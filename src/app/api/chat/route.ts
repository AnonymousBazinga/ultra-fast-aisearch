import { NextRequest } from "next/server";
import { chatJimmy } from "@/lib/jimmy";
import {
  buildAnswerSystemPrompt,
  buildRouterSystemPrompt,
  todayISODate,
} from "@/lib/prompts";

// Strip trailing "References" / "Sources" sections that Llama sometimes appends
// despite being told not to. Only applied in "answer" mode — in "router" mode
// we need the raw output (including the literal "SEARCH:" prefix) intact.
function stripTrailingReferences(text: string): string {
  return text
    .replace(
      /\n+\*?\*?(?:References|Sources|Bibliography|Key findings|Citations|Note)\*?\*?:?\s*\n(?:\s*[-*]?\s*\[?\d+\]?[^\n]*\n?)*/gi,
      ""
    )
    .replace(/\[(\d+)(?:\s*,\s*(\d+))+\]/g, (match: string) => {
      const nums = match.match(/\d+/g) || [];
      return nums.map((n: string) => `[${n}]`).join("");
    })
    .trimEnd();
}

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  searchResults?: Array<{
    title?: string;
    url?: string;
    text?: string;
    highlights?: string[];
  }>;
  mode?: "router" | "answer";
}

export async function POST(req: NextRequest) {
  const tEntry = Date.now();
  const body = (await req.json()) as RequestBody;
  const tParsed = Date.now();

  const { messages = [], searchResults = [], mode } = body;
  const effectiveMode: "router" | "answer" =
    mode === "router" ? "router" : "answer";

  const today = todayISODate();
  const systemContent =
    effectiveMode === "router"
      ? buildRouterSystemPrompt(today)
      : buildAnswerSystemPrompt(searchResults, today);

  const tPromptBuilt = Date.now();

  try {
    let content = await chatJimmy([
      { role: "system", content: systemContent },
      ...messages,
    ]);
    const tChatjimmyDone = Date.now();

    if (effectiveMode === "answer") {
      content = stripTrailingReferences(content);
    }
    const tStripped = Date.now();

    const serverTiming = [
      `mode;desc="${effectiveMode}"`,
      `req_parse;dur=${tParsed - tEntry}`,
      `build_prompt;dur=${tPromptBuilt - tParsed}`,
      `chatjimmy;dur=${tChatjimmyDone - tPromptBuilt}`,
      `strip;dur=${tStripped - tChatjimmyDone}`,
      `total;dur=${tStripped - tEntry}`,
    ].join(", ");

    // Re-emit as SSE chunks so the client streaming logic still works
    const encoder = new TextEncoder();
    const chunkSize = 12;
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < content.length; i += chunkSize) {
          const chunk = content.slice(i, i + chunkSize);
          const sseData = JSON.stringify({
            choices: [{ delta: { content: chunk } }],
          });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Server-Timing": serverTiming,
        "x-debug-timing": serverTiming,
        "Access-Control-Expose-Headers": "Server-Timing, x-debug-timing",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to chat API" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
