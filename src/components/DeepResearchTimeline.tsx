"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ResearchStep } from "@/lib/types";
import { getFaviconUrl, getDomain } from "@/lib/utils";

interface DeepResearchTimelineProps {
  steps: ResearchStep[];
  status: "researching" | "answering" | "done";
  totalSources?: number;
}

function StepItem({ step }: { step: ResearchStep }) {
  const [showResults, setShowResults] = useState(false);

  // Auto-show results briefly, then hide
  useEffect(() => {
    if (step.status === "done" && step.results.length > 0) {
      setShowResults(true);
      const timer = setTimeout(() => setShowResults(false), 3000);
      return () => clearTimeout(timer);
    }
    if (step.status === "searching") {
      setShowResults(true);
    }
  }, [step.status, step.results.length]);

  const isActive = step.status !== "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative pl-5"
    >
      {/* Timeline dot */}
      <div
        className="absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] transition-all duration-300"
        style={{
          borderColor: isActive
            ? "var(--color-accent)"
            : "var(--color-border-default)",
          background: isActive
            ? "var(--color-accent-light)"
            : "var(--color-surface-primary)",
        }}
      />

      {/* Query line */}
      <div className="flex items-center gap-2">
        {step.status === "searching" && (
          <div className="relative flex h-3 w-3 items-center justify-center">
            <div
              className="h-3 w-3 rounded-full border-[1.5px]"
              style={{
                borderColor: "var(--color-accent)",
                borderTopColor: "transparent",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </div>
        )}
        {step.status === "synthesizing" && (
          <div className="relative flex h-3 w-3 items-center justify-center">
            <div
              className="h-2 w-2 rounded-full animate-pulse-soft"
              style={{ background: "var(--color-accent)" }}
            />
          </div>
        )}
        <span
          className="text-[12px]"
          style={{ color: "var(--color-ink-tertiary)" }}
        >
          {step.status === "searching"
            ? "Searching"
            : step.status === "synthesizing"
              ? "Analyzing"
              : step.depth === 0
                ? "Searched"
                : "Explored"}
        </span>
        <span
          className="text-[12.5px] font-medium"
          style={{
            color: "var(--color-ink-secondary)",
            letterSpacing: "-0.01em",
          }}
        >
          &ldquo;{step.query}&rdquo;
        </span>
      </div>

      {/* Results (collapsible) */}
      <AnimatePresence>
        {showResults && step.results.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 flex flex-wrap gap-1.5 pb-1">
              {step.results.slice(0, 5).map((result) => (
                <a
                  key={result.url}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] transition-colors hover:bg-surface-hover"
                  style={{
                    background: "var(--color-surface-secondary)",
                    color: "var(--color-ink-tertiary)",
                  }}
                >
                  <img
                    src={getFaviconUrl(result.url)}
                    alt=""
                    width={10}
                    height={10}
                    className="h-2.5 w-2.5 rounded-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {getDomain(result.url)}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Synthesis text (light gray) */}
      {step.synthesis && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-1 text-[12.5px] leading-relaxed"
          style={{
            color: "var(--color-ink-ghost)",
            letterSpacing: "-0.005em",
          }}
        >
          {step.synthesis}
        </motion.p>
      )}
    </motion.div>
  );
}

export default function DeepResearchTimeline({
  steps,
  status,
  totalSources,
}: DeepResearchTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse when answer starts
  useEffect(() => {
    if (status === "done") {
      const timer = setTimeout(() => setCollapsed(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="mb-4">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        {/* Icon */}
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {status === "researching" || status === "answering" ? (
            <div className="relative">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="text-accent"
              >
                <path
                  d="M8 2v4l2.5 1.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.4"
                />
              </svg>
              <div
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-pulse-soft"
                style={{ background: "var(--color-accent)" }}
              />
            </div>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="text-ink-tertiary"
            >
              <path
                d="M8 2v4l2.5 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.4"
              />
            </svg>
          )}
        </div>

        {/* Label */}
        <div className="flex flex-1 items-center gap-2">
          <span
            className="text-[13px] font-medium tracking-tight"
            style={{ color: "var(--color-ink-secondary)" }}
          >
            {status === "researching"
              ? "Researching..."
              : status === "answering"
                ? "Writing answer..."
                : "Deep research complete"}
          </span>
        </div>

        {/* Chevron */}
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

      {/* Timeline content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="relative ml-[22px] border-l border-border-light pl-2 pt-1 pb-2">
              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <StepItem key={step.id} step={step} />
                ))}
              </div>

              {/* Active indicator */}
              {status === "researching" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative mt-2 pl-5"
                >
                  <div
                    className="absolute left-0 top-[5px] h-[5px] w-[5px] rounded-full animate-pulse-soft"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <span
                    className="text-[11px] animate-pulse-soft"
                    style={{ color: "var(--color-ink-ghost)" }}
                  >
                    Thinking of follow-up questions...
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
