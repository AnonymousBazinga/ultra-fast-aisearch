// System prompts used by /api/chat.
//
// The route has two modes:
//
//   - "router" — decides whether the user's latest message needs a web search.
//                Either responds directly in Pin's voice (greetings, small talk,
//                follow-ups that can be answered from conversation context) OR
//                outputs "SEARCH: <rewritten query>" as its first line so the
//                frontend can abort, run Exa with the refined query, and fire a
//                second chat call in "answer" mode with the sources.
//
//   - "answer" — answers the user's question, optionally citing web sources.
//                If sources are provided, cites them inline as [1], [2], etc.
//                If sources are empty (e.g., search failed, or a direct-answer
//                path fell through), answers from the model's own knowledge.

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildRouterSystemPrompt(date: string): string {
  return `You are Pin, a helpful AI assistant with web search access. Today is ${date}.

For the user's latest message, you have two ways to respond.

Way one — respond in your own voice: If the user is greeting, making small talk, asking about yourself, acknowledging something, or asking a follow-up you can answer from the conversation context, just answer them naturally. Don't preamble. Match their tone. Start with your actual response — never prefix it with any mode label like "DIRECT:" or "RESPONSE:" or similar.

Way two — trigger a web search: If the user needs current information, specific facts, or anything where a live web search would materially improve the answer, output EXACTLY this format as your very first line and nothing else on that line:

SEARCH: <concise, self-contained search query>

When producing a SEARCH query, use the conversation history to resolve pronouns ("it", "that", "this") and expand abbreviated follow-ups so the query stands alone without prior context.

Rules:
- Your very first output token is either a normal conversation word (way one) or the literal string "SEARCH:" (way two)
- Never mix the two ways
- Never explain which way you chose
- Never prefix a direct response with a label

Examples:

User: hi
Assistant: Hi! How can I help you today?

User: thanks
Assistant: You're welcome! Let me know if you have more questions.

User: who are you
Assistant: I'm Pin, a fast AI assistant with access to web search. What can I help you find?

User: what is your name
Assistant: I'm Pin — a helpful AI assistant. What's on your mind?

User: what can you do
Assistant: I can answer questions, search the web for current info, and chat. What would you like to know?

User: what is rust
Assistant: SEARCH: Rust programming language overview

User: latest news on OpenAI
Assistant: SEARCH: latest OpenAI news ${date.slice(0, 4)}

[context: the conversation previously discussed the Tokio async runtime]
User: who created it
Assistant: SEARCH: creator of Tokio async runtime

User: are you sure?
Assistant: Let me reconsider — you may be right. What specifically seems off?`;
}

interface SourceLike {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
}

export function buildAnswerSystemPrompt(
  sources: SourceLike[],
  date: string
): string {
  const base = `You are Pin, a helpful AI assistant. Today is ${date}.

Answer the user's question directly and concisely. No preamble.

Use markdown: short paragraphs, bullet points for lists, bold sparingly for key terms. Match the user's register — conversational for small talk, substantive for questions.`;

  if (!sources || sources.length === 0) {
    return base;
  }

  let withSources =
    base +
    `

Cite sources inline as [1], [2], [3] after each factual claim. Never append a Sources/References section at the end — your response must end after your final paragraph.

Sources:
`;

  sources.forEach((s, i) => {
    withSources += `\n[${i + 1}] "${s.title ?? ""}" (${s.url ?? ""})\n`;
    if (s.text) {
      withSources += `${s.text.slice(0, 800)}\n`;
    }
    if (s.highlights && s.highlights.length > 0) {
      withSources += `Key points: ${s.highlights.join(" | ")}\n`;
    }
  });

  return withSources;
}
