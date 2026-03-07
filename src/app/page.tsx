"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Message, SearchResult, ResearchStep } from "@/lib/types";
import { generateId, parseSSEStream } from "@/lib/utils";
import ChatInput from "@/components/ChatInput";
import MessageBubble from "@/components/MessageBubble";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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

    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: query, timestamp: Date.now() },
      assistantMessage,
    ]);

    // Search
    let searchResults: SearchResult[] = [];
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        searchResults = (await res.json()).results || [];
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

    // Stream answer
    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: query }],
          searchResults: searchResults.map((r) => ({
            title: r.title,
            url: r.url,
            text: r.text,
            highlights: r.highlights,
          })),
        }),
      });

      if (!chatRes.ok || !chatRes.body) throw new Error("Chat failed");

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
        if (done) { setIsLoading(false); break; }
        stream.processChunk(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      console.error("Chat failed:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Failed to connect to chat service. Make sure Jimmy Proxy is running at localhost:4100." }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  // ── Deep research (agent mode) ───────────────────────────────────

  const handleDeepResearch = async (query: string) => {
    const assistantId = generateId();

    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: query, timestamp: Date.now() },
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
                content: "Failed to run deep research. Make sure Jimmy Proxy is running at localhost:4100.",
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
        className="flex flex-shrink-0 items-center justify-between px-6 py-3"
      >
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="fast.browse.dev"
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
            fast.browse.dev
          </h1>
        </div>

        <div className="flex items-center gap-1" />
      </header>

      {/* Main content */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {!hasMessages && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex h-full flex-col items-center justify-center px-6"
            >
              <div className="max-w-lg text-center">
                <h2
                  className="mb-3 text-[28px] font-semibold"
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
        </AnimatePresence>

        {hasMessages && (
          <div className="mx-auto max-w-2xl px-4 py-6">
            <div className="flex flex-col gap-5">
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
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-5 pt-2">
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
