"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Message, SearchResult, ResearchStep } from "@/lib/types";
import { generateId, parseSSEStream, stripCitations } from "@/lib/utils";
import ChatInput from "@/components/ChatInput";
import MessageBubble from "@/components/MessageBubble";

// ── Latency diagnostic logger ─────────────────────────────────────
// Logs every /api/search and /api/chat request with client-side
// timings + parsed Server-Timing header from the edge route, so
// cold-start events are self-diagnosing in DevTools console.
let lastRequestEndWall = 0;

function parseServerTiming(header: string | null): Record<string, number> {
  if (!header) return {};
  const out: Record<string, number> = {};
  for (const entry of header.split(",")) {
    const parts = entry.trim().split(";");
    const name = parts[0]?.trim();
    const durPart = parts.find((p) => p.trim().startsWith("dur="));
    if (name && durPart) {
      const val = parseFloat(durPart.trim().slice(4));
      if (!isNaN(val)) out[name] = val;
    }
  }
  return out;
}

function logTiming(
  label: string,
  meta: {
    query?: string;
    tStartWall: number;
    tFirstByteWall: number;
    tEndWall: number;
    serverTiming: string | null;
    vercelId: string | null;
  }
) {
  const clientTotal = meta.tEndWall - meta.tStartWall;
  const firstByte = meta.tFirstByteWall - meta.tStartWall;
  const bodyRead = meta.tEndWall - meta.tFirstByteWall;
  const idleBefore =
    lastRequestEndWall > 0
      ? Math.round((meta.tStartWall - lastRequestEndWall) / 1000)
      : null;

  const isSlow = clientTotal > 1500;
  const isFast = clientTotal < 600;
  const color = isSlow ? "#e11d48" : isFast ? "#16a34a" : "#f59e0b";
  const weight = isSlow ? "bold" : "normal";
  const slowTag = isSlow ? " ⚠ SLOW" : "";

  const st = parseServerTiming(meta.serverTiming);
  const queryFrag = meta.query ? ` "${meta.query.slice(0, 50)}"` : "";
  const idleFrag = idleBefore !== null ? ` · idle ${idleBefore}s` : "";

  console.groupCollapsed(
    `%c[${label}]%c ${clientTotal.toFixed(0)}ms%c${queryFrag}${idleFrag}${slowTag}`,
    "color: #888; font-weight: normal",
    `color: ${color}; font-weight: ${weight}`,
    "color: #666; font-weight: normal"
  );

  console.log("%cClient (DevTools-measured)", "font-weight: bold; color: #0ea5e9");
  console.log(`  total:        ${clientTotal}ms`);
  console.log(`  first_byte:   ${firstByte}ms  (fetch → response headers)`);
  console.log(`  body_read:    ${bodyRead}ms  (headers → body fully received)`);

  if (Object.keys(st).length > 0) {
    console.log(
      "%cServer (Server-Timing header from Vercel edge route)",
      "font-weight: bold; color: #8b5cf6"
    );
    for (const [k, v] of Object.entries(st)) {
      const isBottleneck = v > clientTotal * 0.5;
      console.log(
        `  %c${k.padEnd(14)}%c ${v}ms${isBottleneck ? " ← bottleneck" : ""}`,
        isBottleneck ? "color: #e11d48; font-weight: bold" : "",
        ""
      );
    }
    const clientOnly = clientTotal - (st["total"] ?? 0);
    console.log(
      `  ${"(network)".padEnd(14)} ~${clientOnly}ms  (client ↔ Vercel edge, i.e. your ISP path)`
    );
  } else {
    console.log(
      "%c(no Server-Timing header — old deployment or error response)",
      "color: #999"
    );
  }

  console.log("%cInfra", "font-weight: bold; color: #f97316");
  console.log(`  vercel-id:    ${meta.vercelId ?? "—"}`);
  console.log(`  timestamp:    ${new Date(meta.tEndWall).toISOString()}`);
  if (idleBefore !== null) {
    console.log(`  idle_before:  ${idleBefore}s since previous request`);
  } else {
    console.log(`  idle_before:  (first request this session)`);
  }

  console.groupEnd();

  lastRequestEndWall = meta.tEndWall;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(false);

  // Directional spacer animation: instant on expand (so scroll math has room),
  // smooth on collapse (avoids a jarring pop when streaming ends).
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;
    if (isLoading && !wasLoading) {
      // Expanding: snap, no transition
      el.style.transition = "none";
      el.style.minHeight = "calc(100dvh - 160px)";
    } else if (!isLoading && wasLoading) {
      // Collapsing: smooth
      el.style.transition = "min-height 280ms ease-out";
      el.style.minHeight = "0px";
    }
  }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll the newly submitted user message to the top of the viewport.
  // Relies on the bottom spacer having expanded (instantly — no CSS transition
  // on expand) so there's enough scroll room for the scroll to reach the target.
  useEffect(() => {
    if (!scrollTargetRef.current) return;
    const targetId = scrollTargetRef.current;
    scrollTargetRef.current = null;
    // Double rAF to ensure DOM has painted after React commit
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-message-id="${targetId}"]`
        );
        const container = chatContainerRef.current;
        if (!el || !container) return;
        // Force a synchronous layout read so the spacer's just-committed
        // min-height is reflected in scrollHeight before we compute scrollTop.
        void container.scrollHeight;
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollTop =
          container.scrollTop + elRect.top - containerRect.top - 12;
        container.scrollTo({
          top: Math.max(0, scrollTop),
          behavior: "smooth",
        });
      });
    });
  }, [messages]);

  // ── Normal (instant) search + answer ─────────────────────────────

  const handleInstantSubmit = async (query: string) => {
    // ── Setup ───────────────────────────────────────────────────────
    // Create the assistant placeholder WITHOUT searchQuery/searchResults so
    // the SearchTimeline component stays hidden until we actually decide to
    // search. Loading dots will show via the `!searchQuery` branch of
    // isWaitingForContent.
    const assistantId = generateId();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const userMsgId = generateId();
    scrollTargetRef.current = userMsgId;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: query, timestamp: Date.now() },
      assistantMessage,
    ]);

    // Build clean conversation history. We strip inline citation markers
    // ([1], [2], ...) from past assistant messages because those numbers
    // refer to sources from PREVIOUS turns — sources that are no longer in
    // the LLM's context. Leaving ghost citations in the history causes the
    // model to conflate old numbers with the current turn's sources and
    // hallucinate / misattribute.
    const conversationHistory = messages
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role,
        content:
          m.role === "assistant" ? stripCitations(m.content) : m.content,
      }));
    conversationHistory.push({ role: "user", content: query });

    try {
      // ── Phase 1: Router chat ──────────────────────────────────────
      // Fire /api/chat with mode: "router". The model will either respond
      // directly (greeting, small talk, follow-up answerable from context)
      // OR emit "SEARCH: <refined query>" as its first line. We stream its
      // output and watch the first ~10 characters to decide which branch
      // we're in, then behave accordingly.
      const tRouterStartWall = Date.now();
      const routerRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationHistory,
          mode: "router",
        }),
      });
      const tRouterFirstByteWall = Date.now();

      if (!routerRes.ok || !routerRes.body) throw new Error("Router failed");

      const routerServerTiming =
        routerRes.headers.get("Server-Timing") ??
        routerRes.headers.get("x-debug-timing");
      const routerVercelId = routerRes.headers.get("x-vercel-id");

      const routerReader = routerRes.body.getReader();
      const routerDecoder = new TextDecoder();
      let routerContent = "";
      let routerDecision: "direct" | "search" | null = null;

      const routerParser = parseSSEStream(
        (text) => {
          routerContent += text;

          // Decide direction once we have enough text to be confident.
          if (
            routerDecision === null &&
            routerContent.trimStart().length >= 10
          ) {
            const trimmedUpper = routerContent.trimStart().toUpperCase();
            routerDecision = trimmedUpper.startsWith("SEARCH:")
              ? "search"
              : "direct";
          }

          // In direct mode, stream the router's output straight to the UI.
          // In search mode, we discard the UI update — the router's output
          // is just the marker/query, not user-visible content.
          if (routerDecision === "direct") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: routerContent } : m
              )
            );
          }
        },
        () => {}
      );

      while (true) {
        const { done, value } = await routerReader.read();
        if (done) break;
        routerParser.processChunk(routerDecoder.decode(value, { stream: true }));
      }

      const tRouterEndWall = Date.now();

      // If the response was very short (< 10 chars) we never got a chance
      // to decide — default to direct and flush whatever we got.
      if (routerDecision === null) {
        routerDecision = "direct";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: routerContent || "…" }
              : m
          )
        );
      }

      logTiming(`Chat:router`, {
        query,
        tStartWall: tRouterStartWall,
        tFirstByteWall: tRouterFirstByteWall,
        tEndWall: tRouterEndWall,
        serverTiming: routerServerTiming,
        vercelId: routerVercelId,
      });

      // ── Direct path: done ────────────────────────────────────────
      if (routerDecision === "direct") {
        setIsLoading(false);
        return;
      }

      // ── Search path: extract the refined query ──────────────────
      // The router's output looks like:
      //   SEARCH: <refined query>\n
      // or:
      //   SEARCH: <refined query>
      // We slice after "SEARCH:" (case-insensitive), take up to the first
      // newline if present, and fall back to the user's raw query on any
      // parse failure.
      const trimmed = routerContent.trimStart();
      const afterMarker = trimmed.slice("SEARCH:".length);
      const newlineIdx = afterMarker.indexOf("\n");
      const rawQuery =
        newlineIdx >= 0 ? afterMarker.slice(0, newlineIdx) : afterMarker;
      const refinedQuery = rawQuery.trim() || query;

      // Now we know we're searching. Show the SearchTimeline with a
      // spinner and the refined query; clear content (which may transiently
      // contain the "SEARCH:" marker if the decision branch missed an early
      // update — it shouldn't, but belt-and-suspenders).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "",
                searchQuery: refinedQuery,
                searchResults: [],
                searchStatus: "searching" as const,
              }
            : m
        )
      );

      // ── Phase 2a: Exa search with the refined query ─────────────
      let searchResults: SearchResult[] = [];
      try {
        const tSearchStartWall = Date.now();
        const searchRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: refinedQuery }),
        });
        const tSearchFirstByteWall = Date.now();
        if (searchRes.ok) {
          const body = await searchRes.json();
          const tSearchEndWall = Date.now();
          searchResults = body.results || [];
          logTiming("Search", {
            query: refinedQuery,
            tStartWall: tSearchStartWall,
            tFirstByteWall: tSearchFirstByteWall,
            tEndWall: tSearchEndWall,
            serverTiming:
              searchRes.headers.get("Server-Timing") ??
              searchRes.headers.get("x-debug-timing"),
            vercelId: searchRes.headers.get("x-vercel-id"),
          });
        }
      } catch (e) {
        console.error("Search failed:", e);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, searchResults, searchStatus: "done" as const }
            : m
        )
      );

      // ── Phase 2b: Answer chat with sources ──────────────────────
      const tAnswerStartWall = Date.now();
      const answerRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationHistory,
          searchResults: searchResults.map((r) => ({
            title: r.title,
            url: r.url,
            text: r.text,
            highlights: r.highlights,
          })),
          mode: "answer",
        }),
      });
      const tAnswerFirstByteWall = Date.now();

      if (!answerRes.ok || !answerRes.body) throw new Error("Answer failed");

      const answerServerTiming =
        answerRes.headers.get("Server-Timing") ??
        answerRes.headers.get("x-debug-timing");
      const answerVercelId = answerRes.headers.get("x-vercel-id");

      const answerReader = answerRes.body.getReader();
      const answerDecoder = new TextDecoder();
      let answerContent = "";

      const answerParser = parseSSEStream(
        (text) => {
          answerContent += text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: answerContent } : m
            )
          );
        },
        () => {}
      );

      while (true) {
        const { done, value } = await answerReader.read();
        if (done) break;
        answerParser.processChunk(answerDecoder.decode(value, { stream: true }));
      }

      const tAnswerEndWall = Date.now();
      logTiming("Chat:answer", {
        query: refinedQuery,
        tStartWall: tAnswerStartWall,
        tFirstByteWall: tAnswerFirstByteWall,
        tEndWall: tAnswerEndWall,
        serverTiming: answerServerTiming,
        vercelId: answerVercelId,
      });

      setIsLoading(false);
    } catch (e) {
      console.error("Chat failed:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Failed to connect to chat service. ChatJimmy may be temporarily unavailable.",
                searchStatus: "done" as const,
              }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  // ── Deep research (agent mode) ───────────────────────────────────

  const handleDeepResearch = async (query: string) => {
    const assistantId = generateId();

    const userMsgId = generateId();
    scrollTargetRef.current = userMsgId;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: query, timestamp: Date.now() },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        isDeepResearch: true,
        researchSteps: [],
        researchStatus: "researching",
        allSources: [],
        timestamp: Date.now(),
      },
    ]);

    try {
      const res = await fetch("/api/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok || !res.body) throw new Error("Deep research failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let allSources: SearchResult[] = [];

      // Helper to update the assistant message
      const update = (patch: Partial<Message>) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, ...patch } : m
          )
        );
      };

      // Helper to update a specific research step
      const updateStep = (
        stepId: string,
        stepPatch: Partial<ResearchStep>
      ) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            return {
              ...m,
              researchSteps: (m.researchSteps || []).map((s) =>
                s.id === stepId ? { ...s, ...stepPatch } : s
              ),
            };
          })
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const raw = trimmed.slice(6);

          let event: { type: string; [key: string]: unknown };
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          switch (event.type) {
            case "step_start": {
              const newStep: ResearchStep = {
                id: event.stepId as string,
                query: event.query as string,
                status: "searching",
                results: [],
                synthesis: "",
                depth: event.depth as number,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        researchSteps: [...(m.researchSteps || []), newStep],
                      }
                    : m
                )
              );
              break;
            }

            case "search_complete": {
              const results = (event.results || []) as SearchResult[];
              updateStep(event.stepId as string, { results });
              break;
            }

            case "synthesizing": {
              updateStep(event.stepId as string, { status: "synthesizing" });
              break;
            }

            case "step_done": {
              updateStep(event.stepId as string, {
                status: "done",
                synthesis: event.synthesis as string,
              });
              break;
            }

            case "research_complete": {
              update({ researchStatus: "answering" });
              break;
            }

            case "answer_start": {
              update({ researchStatus: "answering" });
              break;
            }

            case "answer_chunk": {
              fullContent += event.content as string;
              const c = fullContent;
              update({ content: c });
              break;
            }

            case "all_sources": {
              allSources = (event.sources || []) as SearchResult[];
              update({ allSources });
              break;
            }

            case "done": {
              update({ researchStatus: "done", allSources });
              setIsLoading(false);
              break;
            }

            case "error": {
              update({
                content: `Research failed: ${event.message}`,
                researchStatus: "done",
              });
              setIsLoading(false);
              break;
            }
          }
        }
      }

      // Ensure loading is cleared
      setIsLoading(false);
    } catch (e) {
      console.error("Deep research failed:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "Failed to run deep research. ChatJimmy may be temporarily unavailable.",
                researchStatus: "done" as const,
              }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  // ── Submit dispatcher ────────────────────────────────────────────

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    setInput("");
    setIsLoading(true);

    if (agentMode) {
      await handleDeepResearch(query);
    } else {
      await handleInstantSubmit(query);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className="flex h-dvh flex-col"
      style={{ background: "var(--color-surface-primary)" }}
    >
      {/* Header */}
      <header
        className="flex flex-shrink-0 items-center justify-between px-4 py-3 sm:px-6"
      >
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="pin"
            className="h-6 w-6"
            style={{ objectFit: "contain" }}
          />
          <h1
            className="text-[15px] font-semibold tracking-tight"
            style={{
              color: "var(--color-ink-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            pin
          </h1>
        </div>

        <div className="flex items-center gap-1" />
      </header>

      {/* Main content */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
          {!hasMessages && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex h-full flex-col items-center justify-center px-6"
            >
              <div className="max-w-lg text-center">
                <h2
                  className="mb-3 text-[24px] font-semibold sm:text-[28px]"
                  style={{
                    color: "var(--color-ink-primary)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.2,
                  }}
                >
                  What do you want to know?
                </h2>
                <div className="mb-8" />

                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What happened in tech today?",
                    "How does RAG work?",
                    "Best TypeScript practices 2025",
                    "Explain quantum computing simply",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border px-3.5 py-1.5 text-[13px] transition-all duration-150 hover:border-ink-ghost hover:bg-surface-secondary"
                      style={{
                        borderColor: "var(--color-border-default)",
                        color: "var(--color-ink-secondary)",
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

        {hasMessages && (
          <div className="mx-auto max-w-2xl px-4 py-4 sm:py-6">
            <div className="flex flex-col gap-4 sm:gap-5">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={
                    isLoading &&
                    message.role === "assistant" &&
                    message.id === messages[messages.length - 1]?.id
                  }
                />
              ))}
            </div>
            {/* Spacer: its minHeight is controlled imperatively via the
                directional-animation useEffect above (instant expand when a
                message starts streaming, smooth collapse when it finishes).
                DO NOT add a style prop here — React would re-apply it every
                render and fight the imperative updates. */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 sm:pb-5">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isLoading}
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            placeholder={
              agentMode
                ? "Ask a complex question for deep research..."
                : hasMessages
                  ? "Ask a follow-up..."
                  : "Ask anything..."
            }
          />
        </div>
      </div>
    </div>
  );
}
