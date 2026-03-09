import { NextRequest } from "next/server";
import { chatJimmy } from "@/lib/jimmy";

export const runtime = "edge";

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

export async function POST(req: NextRequest) {
  const { messages, searchResults } = await req.json();

  // Build the system prompt with search context
  let systemContent =
    "You are Speed Search, a helpful AI assistant. " +
    "Use markdown formatting. Be concise but thorough. " +
    "Use bold for key terms. Use bullet points for lists. Keep paragraphs short.";

  if (searchResults && searchResults.length > 0) {
    systemContent +=
      "\n\nIMPORTANT RULES:\n" +
      "1. Cite sources INLINE using [1], [2], [3] right after each claim. Example: \"Rust is fast [1] and safe [2].\"\n" +
      "2. Your response MUST END after your analysis. Do NOT append any section titled Sources, References, Bibliography, or Citations.\n" +
      "3. Do NOT list source titles or URLs anywhere in your response.\n" +
      "4. STOP writing after your final paragraph. Nothing else after that.\n\n" +
      "Sources:\n";
    searchResults.forEach(
      (
        result: { title: string; url: string; text?: string; highlights?: string[] },
        i: number
      ) => {
        systemContent += `[${i + 1}] "${result.title}" (${result.url})\n`;
        if (result.text) {
          systemContent += `Content: ${result.text.slice(0, 800)}\n`;
        }
        if (result.highlights && result.highlights.length > 0) {
          systemContent += `Key points: ${result.highlights.join(" | ")}\n`;
        }
        systemContent += "\n";
      }
    );
  }

  try {
    let content = await chatJimmy([
      { role: "system", content: systemContent },
      ...messages,
    ]);
    content = stripTrailingReferences(content);

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
