"use client";

import { useRef, useEffect, KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Ask anything...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  const hasValue = value.trim().length > 0;
  const isActive = hasValue && !disabled;

  return (
    <div className="relative">
      <div
        className="group/input flex items-end gap-3 rounded-xl px-5 py-3.5 transition-all duration-200"
        style={{
          background: "var(--color-surface-secondary)",
          boxShadow: "0 0 0 1px transparent",
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = "var(--color-surface-primary)";
          e.currentTarget.style.boxShadow = "0 0 0 1px var(--color-border-default), 0 2px 8px rgba(0,0,0,0.04)";
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.style.background = "var(--color-surface-secondary)";
            e.currentTarget.style.boxShadow = "0 0 0 1px transparent";
          }
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none disabled:opacity-50"
          style={{
            color: "var(--color-ink-primary)",
            maxHeight: "200px",
            letterSpacing: "-0.01em",
          }}
        />

        <button
          onClick={onSubmit}
          disabled={disabled || !hasValue}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200 disabled:opacity-0"
          style={{
            background: isActive ? "var(--color-ink-primary)" : "transparent",
            transform: isActive ? "scale(1)" : "scale(0.9)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            style={{ color: "var(--color-surface-primary)" }}
          >
            <path
              d="M8 12V4M8 4L4 8M8 4L12 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
