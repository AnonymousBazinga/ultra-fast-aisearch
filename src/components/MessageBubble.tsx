"use client";

import { motion } from "framer-motion";
import { Message } from "@/lib/types";
import SearchTimeline from "./SearchTimeline";
import DeepResearchTimeline from "./DeepResearchTimeline";
import MarkdownRenderer from "./MarkdownRenderer";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export default function MessageBubble({
  message,
  isStreaming,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex justify-end"
      >
        <div
          className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5"
          style={{
            background: "var(--color-ink-primary)",
            color: "var(--color-surface-primary)",
          }}
        >
          <p className="text-[14.5px] leading-relaxed tracking-tight">
            {message.content}
          </p>
        </div>
      </motion.div>
    );
  }

  // Determine which sources to use for citation pills
  const sources = message.isDeepResearch
    ? message.allSources
    : message.searchResults;

  // Determine if we're in the "waiting for content" state
  const isWaitingForContent =
    !message.content &&
    isStreaming &&
    (message.isDeepResearch
      ? message.researchStatus === "answering"
      : message.searchStatus === "done");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex justify-start"
    >
      <div className="max-w-[92%]">
        {/* Deep research timeline */}
        {message.isDeepResearch && message.researchSteps && (
          <DeepResearchTimeline
            steps={message.researchSteps}
            status={message.researchStatus || "done"}
            totalSources={message.allSources?.length}
          />
        )}

        {/* Normal search timeline */}
        {!message.isDeepResearch &&
          message.searchQuery &&
          message.searchResults && (
            <SearchTimeline
              query={message.searchQuery}
              results={message.searchResults}
              status={message.searchStatus || "done"}
            />
          )}

        {/* Answer content */}
        {message.content && (
          <div className="prose">
            <MarkdownRenderer content={message.content} sources={sources} />
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-[18px] w-[2px] align-text-bottom animate-pulse-soft"
                style={{ background: "var(--color-ink-primary)" }}
              />
            )}
          </div>
        )}

        {/* Loading dots */}
        {isWaitingForContent && (
          <div className="flex items-center gap-1.5 py-2">
            {[0, 300, 600].map((delay) => (
              <div
                key={delay}
                className="h-1.5 w-1.5 rounded-full animate-pulse-soft"
                style={{
                  background: "var(--color-ink-ghost)",
                  animationDelay: `${delay}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
