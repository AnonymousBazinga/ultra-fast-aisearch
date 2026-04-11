"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Message, SearchResult, ResearchStep } from "@/lib/types";
import { generateId, parseSSEStream } from "@/lib/utils";
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll the newly submitted user message to the top of the viewport
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
        if (el && container) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const scrollTop =
            container.scrollTop + elRect.top - containerRect.top - 12;
          container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        }
      });
    });
  }, [messages]);

  // ── Normal (instant) search + answer ─────────────────────────────

  const handleInstantSubmit = async (query: string) => {
    const assistantId = generateId();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      searchQuery: query,
      searchResults: [],
      searchStatus: "searching",
      timestamp: Date.now(),
    };

    const userMsgId = generateId();
    scrollTargetRef.current = userMsgId;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: query, timestamp: Date.now() },
      assistantMessage,
    ]);

    // Search
    let searchResults: SearchResult[] = [];
    try {
      const tStartWall = Date.now();
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const tFirstByteWall = Date.now();
      if (res.ok) {
        const body = await res.json();
        const tEndWall = Date.now();
        searchResults = body.results || [];
        logTiming("Search", {
          query,
          tStartWall,
          tFirstByteWall,
          tEndWall,
          serverTiming: res.headers.get("Server-Timing"),
          vercelId: res.headers.get("x-vercel-id"),
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

    // Build conversation history for context
    const conversationHistory = messages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    conversationHistory.push({ role: "user", content: query });

    // Stream answer
    try {
      const tChatStartWall = Date.now();
      const chatRes = await fetch("/api/chat", {
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
        }),
      });
      const tChatFirstByteWall = Date.now();

      if (!chatRes.ok || !chatRes.body) throw new Error("Chat failed");

      const chatServerTiming = chatRes.headers.get("Server-Timing");
      const chatVercelId = chatRes.headers.get("x-vercel-id");

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      const stream = parseSSEStream(
        (text) => {
          fullContent += text;
          const c = fullContent;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: c } : m))
          );
        },
        () => setIsLoading(false)
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const tChatEndWall = Date.now();
          logTiming("Chat", {
            query,
            tStartWall: tChatStartWall,
            tFirstByteWall: tChatFirstByteWall,
            tEndWall: tChatEndWall,
            serverTiming: chatServerTiming,
            vercelId: chatVercelId,
          });
          setIsLoading(false);
          break;
        }
        stream.processChunk(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      console.error("Chat failed:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Failed to connect to chat service. ChatJimmy may be temporarily unavailable." }
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
            alt="browse.dev"
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
            browse.dev
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
            {/* Spacer tall enough so the last message can be scrolled to the top */}
            <div ref={messagesEndRef} style={{ minHeight: "calc(100dvh - 160px)" }} />
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
