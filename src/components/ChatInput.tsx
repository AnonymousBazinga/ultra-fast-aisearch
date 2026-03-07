"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  agentMode: boolean;
  onAgentModeChange: (mode: boolean) => void;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Ask anything...",
  agentMode,
  onAgentModeChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [ripple, setRipple] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        triggerRipple();
        onSubmit();
      }
    }
  };

  const triggerRipple = () => {
    setRipple(true);
    setTimeout(() => setRipple(false), 600);
  };

  const hasValue = value.trim().length > 0;
  const isActive = hasValue && !disabled;

  return (
    <div className="relative">
      {/* Glow layer behind the input */}
      <div
        className="pointer-events-none absolute -inset-[1px] rounded-2xl transition-opacity duration-500"
        style={{
          opacity: focused ? 1 : 0,
          background:
            "linear-gradient(135deg, rgba(47,111,235,0.06) 0%, rgba(160,120,255,0.04) 50%, rgba(47,111,235,0.06) 100%)",
          filter: "blur(1px)",
        }}
      />

      {/* Ripple effect on submit */}
      <AnimatePresence>
        {ripple && (
          <motion.div
            initial={{ opacity: 0.15, scale: 0.95 }}
            animate={{ opacity: 0, scale: 1.02 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="pointer-events-none absolute -inset-1 rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(47,111,235,0.1), rgba(160,120,255,0.08))",
            }}
          />
        )}
      </AnimatePresence>

      {/* Main input container */}
      <div
        className="relative overflow-hidden rounded-2xl transition-all duration-300"
        style={{
          background: focused
            ? "rgba(255,255,255,0.95)"
            : "rgba(247,247,245,0.8)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: focused
            ? "0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)"
            : "0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
        }}
      >
        {/* Textarea area */}
        <div className="flex items-end gap-2 px-4 pt-3.5 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none disabled:opacity-40"
            style={{
              color: "var(--color-ink-primary)",
              maxHeight: "180px",
              letterSpacing: "-0.01em",
              caretColor: "var(--color-accent)",
            }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
          {/* Left: Deep Research toggle */}
          <button
            onClick={() => onAgentModeChange(!agentMode)}
            className="group relative flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12px] font-medium transition-all duration-300"
            style={{
              background: agentMode
                ? "rgba(47,111,235,0.06)"
                : "transparent",
              color: agentMode
                ? "rgba(47,111,235,0.55)"
                : "var(--color-ink-ghost)",
            }}
          >
            {/* Brain icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              className="transition-all duration-300"
              style={{
                color: agentMode
                  ? "rgba(47,111,235,0.55)"
                  : "var(--color-ink-ghost)",
                transform: agentMode ? "scale(1.05)" : "scale(1)",
                filter: agentMode
                  ? "drop-shadow(0 0 3px rgba(47,111,235,0.15))"
                  : "none",
              }}
            >
              <path
                d="M12 2C9.5 2 7.5 3.5 7 5.5C5.5 5.8 4.3 6.8 3.7 8.2C2.5 8.8 1.8 10.2 2 11.6C1.5 12.8 1.5 14.2 2.2 15.4C2 16.8 2.5 18.2 3.5 19.1C4.2 20.5 5.8 21.2 7.3 21C8.5 21.8 10 22.2 11.5 21.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 2C14.5 2 16.5 3.5 17 5.5C18.5 5.8 19.7 6.8 20.3 8.2C21.5 8.8 22.2 10.2 22 11.6C22.5 12.8 22.5 14.2 21.8 15.4C22 16.8 21.5 18.2 20.5 19.1C19.8 20.5 18.2 21.2 16.7 21C15.5 21.8 14 22.2 12.5 21.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 2V22"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M7 8.5C8.5 9.5 10 10 12 10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M17 8.5C15.5 9.5 14 10 12 10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M7 15C8.5 14 10 13.5 12 14"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M17 15C15.5 14 14 13.5 12 14"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>

            <span
              className="transition-all duration-300"
              style={{
                letterSpacing: agentMode ? "0.01em" : "0",
              }}
            >
              Deep Research
            </span>

            {/* Active indicator dot */}
            <AnimatePresence>
              {agentMode && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="h-1 w-1 rounded-full"
                  style={{
                    background: "rgba(47,111,235,0.45)",
                    boxShadow: "0 0 4px rgba(47,111,235,0.2)",
                  }}
                />
              )}
            </AnimatePresence>
          </button>

          {/* Right: Send button */}
          <motion.button
            onClick={() => {
              if (isActive) {
                triggerRipple();
                onSubmit();
              }
            }}
            disabled={disabled || !hasValue}
            animate={{
              scale: isActive ? 1 : 0.85,
              opacity: isActive ? 1 : 0,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200 disabled:pointer-events-none"
            style={{
              background: isActive
                ? "var(--color-ink-primary)"
                : "transparent",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              style={{ color: "#fff" }}
            >
              <path
                d="M8 12V4M8 4L4 8M8 4L12 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
