"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SearchResult } from "@/lib/types";
import { getFaviconUrl, getDomain } from "@/lib/utils";

interface SearchTimelineProps {
  query: string;
  results: SearchResult[];
  status: "searching" | "done";
}

export default function SearchTimeline({
  query,
  results,
  status,
}: SearchTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  // Stagger reveal results as they arrive
  useEffect(() => {
    if (results.length > visibleCount) {
      const timer = setTimeout(() => {
        setVisibleCount((c) => Math.min(c + 1, results.length));
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [results.length, visibleCount]);

  // Auto-collapse after search is done (with delay)
  useEffect(() => {
    if (status === "done" && results.length > 0) {
      const timer = setTimeout(() => setCollapsed(true), 2400);
      return () => clearTimeout(timer);
    }
  }, [status, results.length]);

  const visibleResults = results.slice(0, visibleCount);

  return (
    <div className="mb-4">
      {/* Header bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
        style={{ background: collapsed ? "transparent" : undefined }}
      >
        {/* Search icon / status indicator */}
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {status === "searching" ? (
            <div className="relative flex items-center justify-center">
              <div
                className="h-3.5 w-3.5 rounded-full border-[1.5px] border-accent/30"
                style={{ borderTopColor: "var(--color-accent)" }}
              >
                <style jsx>{`
                  div {
                    animation: spin 0.8s linear infinite;
                  }
                  @keyframes spin {
                    to {
                      transform: rotate(360deg);
                    }
                  }
                `}</style>
              </div>
            </div>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="text-ink-tertiary"
            >
              <circle
                cx="7"
                cy="7"
                r="5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11 11L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        {/* Query text & count */}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span
            className="truncate text-[13px] font-medium tracking-tight"
            style={{ color: "var(--color-ink-secondary)" }}
          >
            {status === "searching" ? "Searching" : "Searched"}
          </span>
          <span
            className="truncate text-[13px] tracking-tight"
            style={{ color: "var(--color-ink-primary)" }}
          >
            &ldquo;{query}&rdquo;
          </span>
        </div>

        {/* Expand/collapse chevron */}
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="flex-shrink-0 text-ink-ghost opacity-0 transition-opacity group-hover:opacity-100"
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.2 }}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>

      {/* Results timeline */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="relative ml-[22px] border-l border-border-light pl-4 pt-1 pb-1">
              {visibleResults.map((result, i) => (
                <motion.a
                  key={result.url}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: "easeOut",
                  }}
                  className="group/item relative -ml-[calc(1rem+0.5px)] flex items-center gap-2.5 rounded-md py-1.5 pl-4 pr-2 transition-colors hover:bg-surface-secondary"
                >
                  {/* Timeline dot */}
                  <div
                    className="absolute -left-[5px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full border-[1.5px] transition-colors"
                    style={{
                      borderColor:
                        i === visibleResults.length - 1 && status === "searching"
                          ? "var(--color-accent)"
                          : "var(--color-border-default)",
                      background:
                        i === visibleResults.length - 1 && status === "searching"
                          ? "var(--color-accent-light)"
                          : "var(--color-surface-primary)",
                    }}
                  />

                  {/* Favicon */}
                  <img
                    src={getFaviconUrl(result.url)}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 flex-shrink-0 rounded-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />

                  {/* Title & domain */}
                  <div className="flex flex-1 items-center gap-2 overflow-hidden">
                    <span
                      className="truncate text-[12.5px] font-medium"
                      style={{ color: "var(--color-ink-primary)" }}
                    >
                      {result.title}
                    </span>
                    <span
                      className="flex-shrink-0 text-[11px]"
                      style={{ color: "var(--color-ink-ghost)" }}
                    >
                      {getDomain(result.url)}
                    </span>
                  </div>

                  {/* External link icon on hover */}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    className="flex-shrink-0 text-ink-ghost opacity-0 transition-opacity group-hover/item:opacity-100"
                  >
                    <path
                      d="M4.5 2H10V7.5M10 2L3 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.a>
              ))}

              {/* Searching indicator at bottom of timeline */}
              {status === "searching" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative -ml-[calc(1rem+0.5px)] flex items-center gap-2.5 py-1.5 pl-4"
                >
                  <div
                    className="absolute -left-[4px] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full animate-pulse-soft"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <span
                    className="text-[11px] animate-pulse-soft"
                    style={{ color: "var(--color-ink-tertiary)" }}
                  >
                    Finding more sources...
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
