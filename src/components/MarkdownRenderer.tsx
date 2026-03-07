"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.min.css";
import { SearchResult } from "@/lib/types";
import { getFaviconUrl, getDomain } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  sources?: SearchResult[];
}

/**
 * Pre-process markdown to convert [N] citation markers into
 * inline links [N](#cite-N) that react-markdown can render.
 * Avoids transforming inside code blocks or inline code.
 */
function preprocessCitations(content: string): string {
  // Split by code blocks and inline code to skip them
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts
    .map((part, i) => {
      // Odd indices are code blocks/inline code — don't touch
      if (i % 2 === 1) return part;
      // Replace [N] but not [text](url) which is already a link
      return part.replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)");
    })
    .join("");
}

function CitationPill({
  num,
  source,
}: {
  num: number;
  source?: SearchResult;
}) {
  const domain = source ? getDomain(source.url) : null;
  const favicon = source ? getFaviconUrl(source.url) : null;

  // Build excerpt from highlights or text, clean up leading junk
  const rawExcerpt = source?.highlights?.join(" ") || source?.text?.slice(0, 200) || "";
  const excerpt = rawExcerpt
    .replace(/^[\s?)\]}>.,;:!*#\-]+/, "") // strip leading garbage chars
    .replace(/\s+/g, " ")                 // normalize whitespace
    .trim();

  if (source) {
    return (
      <span className="group/cite relative mx-[1px] inline-block align-baseline">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-[1px] text-[11px] font-medium no-underline transition-all duration-150"
          style={{
            background: "var(--color-surface-tertiary)",
            color: "var(--color-ink-secondary)",
            border: "none",
            lineHeight: "1.4",
            verticalAlign: "baseline",
            position: "relative",
            top: "-1px",
          }}
        >
          {favicon && (
            <img
              src={favicon}
              alt=""
              width={10}
              height={10}
              className="h-2.5 w-2.5 rounded-sm"
              style={{ flexShrink: 0 }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {domain}
        </a>
        {excerpt && (
          <span
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 -translate-x-1/2 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed group-hover/cite:block"
            style={{
              background: "var(--color-surface-primary)",
              color: "var(--color-ink-primary)",
              letterSpacing: "-0.003em",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px var(--color-border-light)",
            }}
          >
            <span
              className="mb-1.5 block text-[11.5px] font-semibold leading-snug"
              style={{ color: "var(--color-ink-primary)", letterSpacing: "-0.01em" }}
            >
              {source.title}
            </span>
            <span style={{ color: "var(--color-ink-secondary)" }}>
              {excerpt.length > 180 ? excerpt.slice(0, 180) + "..." : excerpt}
            </span>
            <span
              className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent"
              style={{ borderTopColor: "var(--color-surface-primary)" }}
            />
          </span>
        )}
      </span>
    );
  }

  // Fallback if source not found
  return (
    <span
      className="mx-[1px] inline-flex items-center rounded-[5px] px-1.5 py-[1px] text-[11px] font-medium"
      style={{
        background: "var(--color-surface-tertiary)",
        color: "var(--color-ink-tertiary)",
        lineHeight: "1.4",
        verticalAlign: "baseline",
        position: "relative",
        top: "-1px",
      }}
    >
      {num}
    </span>
  );
}

export default function MarkdownRenderer({
  content,
  sources = [],
}: MarkdownRendererProps) {
  const processedContent = useMemo(
    () => preprocessCitations(content),
    [content]
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        a: ({ href, children }) => {
          // Detect citation links: #cite-N
          const citeMatch = href?.match(/^#cite-(\d+)$/);
          if (citeMatch) {
            const num = parseInt(citeMatch[1]);
            const source = sources[num - 1];
            return <CitationPill num={num} source={source} />;
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        pre: ({ children }) => (
          <pre
            className="overflow-x-auto rounded-lg border p-4 text-[13px] leading-relaxed"
            style={{
              background: "var(--color-surface-secondary)",
              borderColor: "var(--color-border-light)",
            }}
          >
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-light)" }}>
            <table className="w-full border-collapse text-[13.5px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead style={{ background: "var(--color-surface-secondary)" }}>{children}</thead>
        ),
        th: ({ children }) => (
          <th
            className="px-3 py-2 text-left text-[12.5px] font-semibold"
            style={{ color: "var(--color-ink-secondary)", borderBottom: "1px solid var(--color-border-light)" }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            className="px-3 py-2 text-[13px]"
            style={{ color: "var(--color-ink-primary)", borderBottom: "1px solid var(--color-border-light)" }}
          >
            {children}
          </td>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock =
            className?.includes("language-") || className?.includes("hljs");
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[0.85em]"
              style={{ fontFamily: "var(--font-mono)" }}
              {...props}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
