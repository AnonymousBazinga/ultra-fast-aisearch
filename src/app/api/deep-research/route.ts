import { NextRequest } from "next/server";
import { chatJimmy } from "@/lib/jimmy";

const EXA_API_KEY = process.env.EXA_API_KEY || "";

// Controlled research tree:
//   Depth 0: 1 search (original query)        → 2 follow-ups
//   Depth 1: 2 searches (follow-ups)           → 1 follow-up each
//   Depth 2: 2 searches (deeper follow-ups)    → no follow-ups
// Total: 5 searches, ~25-30 sources — fits Llama 8B context comfortably

const MAX_DEPTH = 3;
const MAX_SOURCES_FOR_ANSWER = 18; // cap sources sent to final answer

// ── Exa search (auto mode for thoroughness) ────────────────────────

async function searchExa(query: string) {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 5,
      contents: {
        text: { maxCharacters: 1000 },
        highlights: { numSentences: 2 },
      },
    }),
  });

  if (!response.ok) {
    console.error("Exa search failed:", await response.text());
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

// ── Call Llama (non-streaming) for synthesis + follow-ups ───────────

async function synthesize(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  return chatJimmy([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

// ── Parse follow-up questions from Llama response ──────────────────

function parseFollowUps(
  text: string,
  maxFollowUps: number
): { synthesis: string; followUps: string[] } {
  const lines = text.split("\n");
  const synthesisLines: string[] = [];
  const followUps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("FOLLOW_UP:")) {
      const question = trimmed.slice("FOLLOW_UP:".length).trim();
      if (question.length > 10) {
        followUps.push(question);
      }
    } else {
      synthesisLines.push(line);
    }
  }

  // Clean up synthesis: remove preamble like "Here is a 2-3 sentence synthesis..."
  let synthesis = synthesisLines.join("\n").trim();
  synthesis = synthesis
    .replace(/^here(?:'s| is) (?:a |the )?\d*-?\d* ?sentence (?:brief )?synthesis[^:]*:\s*/i, "")
    .replace(/^here(?:'s| is) (?:a |the )?(?:brief )?synthesis[^:]*:\s*/i, "")
    .replace(/^\*\*synthesis:?\*\*\s*/i, "")
    .replace(/^\*\*synthesis\*\*\s*/i, "")
    .replace(/^synthesis:?\s*/i, "")
    .trim();

  return {
    synthesis,
    followUps: followUps.slice(0, maxFollowUps),
  };
}

// ── Deduplicate sources by URL ─────────────────────────────────────

function deduplicateSources(
  sources: { title: string; url: string; text?: string; highlights?: string[] }[]
) {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ── Format search results for Llama context ────────────────────────

function formatResultsForLLM(
  results: { title: string; url: string; text?: string }[],
  offset: number = 0
): string {
  return results
    .map((r, i) => {
      let entry = `[${offset + i + 1}] "${r.title}" (${r.url})`;
      if (r.text) {
        entry += `\nContent: ${r.text.slice(0, 400)}`;
      }
      return entry;
    })
    .join("\n\n");
}

// ── SSE helpers ────────────────────────────────────────────────────

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// ── Main handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: "Query required" }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const allResults: {
        title: string;
        url: string;
        text?: string;
        highlights?: string[];
      }[] = [];
      const allSyntheses: { query: string; synthesis: string }[] = [];
      let queuesToResearch: string[] = [query];

      try {
        for (
          let depth = 0;
          depth < MAX_DEPTH && queuesToResearch.length > 0;
          depth++
        ) {
          const currentQueries = [...queuesToResearch];
          queuesToResearch = [];

          // Control branching: depth 0 → 2 follow-ups, depth 1+ → 1 each
          const maxFollowUpsPerStep = depth === 0 ? 2 : 1;
          const isLastDepth = depth >= MAX_DEPTH - 1;

          for (const currentQuery of currentQueries) {
            const stepId = `step-${depth}-${Math.random().toString(36).slice(2, 8)}`;

            // Signal: step started
            controller.enqueue(
              encoder.encode(
                sseEvent("step_start", {
                  stepId,
                  query: currentQuery,
                  depth,
                })
              )
            );

            // Search
            const results = await searchExa(currentQuery);
            allResults.push(...results);

            controller.enqueue(
              encoder.encode(
                sseEvent("search_complete", {
                  stepId,
                  results: results.map(
                    (r: { title: string; url: string }) => ({
                      title: r.title,
                      url: r.url,
                    })
                  ),
                })
              )
            );

            // Build context for synthesis
            const previousContext =
              allSyntheses.length > 0
                ? "Previous research found:\n" +
                  allSyntheses
                    .map((s) => `- ${s.synthesis}`)
                    .join("\n") +
                  "\n\n"
                : "";

            const systemPrompt = isLastDepth
              ? "You are a research assistant. Write a 2-3 sentence synthesis of the new findings. Do NOT generate follow-up questions."
              : "You are a research assistant. Given search results, do two things:\n" +
                "1. Write a 2-3 sentence synthesis of what was found.\n" +
                `2. List exactly ${maxFollowUpsPerStep} follow-up question${maxFollowUpsPerStep > 1 ? "s" : ""} to deepen understanding. Each MUST start on its own line with \"FOLLOW_UP:\" prefix.\n\n` +
                "Example:\nThe results show X is important for Y. Key findings suggest Z.\n\n" +
                "FOLLOW_UP: What mechanisms cause Y?\n" +
                (maxFollowUpsPerStep > 1
                  ? "FOLLOW_UP: How does Z compare to alternatives?"
                  : "");

            const userPrompt =
              previousContext +
              (depth > 0
                ? `Original query: ${query}\nNow researching: `
                : "Query: ") +
              currentQuery +
              "\n\nSearch results:\n" +
              formatResultsForLLM(results);

            // Signal: synthesizing
            controller.enqueue(
              encoder.encode(sseEvent("synthesizing", { stepId }))
            );

            const rawResponse = await synthesize(systemPrompt, userPrompt);
            const { synthesis, followUps } = parseFollowUps(
              rawResponse,
              maxFollowUpsPerStep
            );

            allSyntheses.push({ query: currentQuery, synthesis });

            controller.enqueue(
              encoder.encode(
                sseEvent("step_done", {
                  stepId,
                  synthesis,
                  followUps: isLastDepth ? [] : followUps,
                })
              )
            );

            // Queue follow-ups for next depth
            if (!isLastDepth) {
              queuesToResearch.push(...followUps);
            }
          }
        }

        // Deduplicate sources
        const uniqueSources = deduplicateSources(allResults);
        const sourcesForAnswer = uniqueSources.slice(
          0,
          MAX_SOURCES_FOR_ANSWER
        );

        // Signal: research complete
        controller.enqueue(
          encoder.encode(
            sseEvent("research_complete", {
              totalSources: uniqueSources.length,
              sources: uniqueSources.map((r) => ({
                title: r.title,
                url: r.url,
              })),
            })
          )
        );

        // ── Final comprehensive answer ─────────────────────────

        const researchContext = allSyntheses
          .map((s) => `- ${s.synthesis}`)
          .join("\n");

        // Use only top sources to keep context manageable for Llama 8B
        const finalSystemPrompt =
          "You are Speed Search. Write a well-structured answer using markdown.\n" +
          "IMPORTANT RULES:\n" +
          "1. Cite sources INLINE using [1], [2], [3] etc. right after each claim\n" +
          "2. Example: \"Rust prevents memory bugs at compile time [2] and performs like C++ [5].\"\n" +
          "3. Do NOT list references at the end. No bibliography. No \"References:\" section.\n" +
          "4. Use **bold** for key terms. Use bullet points for lists.\n\n" +
          "Sources:\n" +
          formatResultsForLLM(sourcesForAnswer);

        const finalUserPrompt = `${query}\n\nResearch notes:\n${researchContext}`;

        controller.enqueue(
          encoder.encode(sseEvent("answer_start", {}))
        );

        let fullAnswer = await chatJimmy([
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: finalUserPrompt },
        ]);

        // Strip trailing references/bibliography that Llama sometimes adds
        fullAnswer = fullAnswer
          .replace(
            /\n+\*?\*?(?:References|Sources|Bibliography|Key findings from research|Citations)\*?\*?:?\s*\n(?:\s*\[?\d+\]?[^\n]*\n?)*/gi,
            ""
          )
          .trimEnd();

        // Normalize [4, 5, 6] → [4][5][6] for citation pill rendering
        fullAnswer = fullAnswer.replace(
          /\[(\d+)(?:\s*,\s*(\d+))+\]/g,
          (match: string) => {
            const nums = match.match(/\d+/g) || [];
            return nums.map((n: string) => `[${n}]`).join("");
          }
        );

        // Emit answer in small chunks to simulate streaming
        const chunkSize = 12;
        for (let i = 0; i < fullAnswer.length; i += chunkSize) {
          const chunk = fullAnswer.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(sseEvent("answer_chunk", { content: chunk }))
          );
        }

        // Send all sources for citation pill rendering
        controller.enqueue(
          encoder.encode(
            sseEvent("all_sources", {
              sources: sourcesForAnswer.map((r) => ({
                title: r.title,
                url: r.url,
                text: r.text,
                highlights: r.highlights,
              })),
            })
          )
        );

        controller.enqueue(encoder.encode(sseEvent("done", {})));
      } catch (error) {
        console.error("Deep research error:", error);
        controller.enqueue(
          encoder.encode(
            sseEvent("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Research failed",
            })
          )
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
