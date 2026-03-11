const UPSTREAM_URL = "https://chatjimmy.ai/api/chat";
const MAX_SYSTEM_PROMPT = 20000;

/**
 * Call ChatJimmy's Llama 3.1 8B directly, bypassing the proxy.
 * Accepts OpenAI-style messages and returns the assistant's content string.
 */
export async function chatJimmy(
  messages: { role: string; content: string }[]
): Promise<string> {
  // Separate system messages from chat messages
  let systemPrompt = "";
  const chatMessages: { role: string; content: string }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt += msg.content + "\n";
    } else {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
  }

  systemPrompt = systemPrompt.trim();
  if (systemPrompt.length > MAX_SYSTEM_PROMPT) {
    systemPrompt = systemPrompt.slice(0, MAX_SYSTEM_PROMPT);
  }

  const payload = {
    messages: chatMessages,
    chatOptions: {
      selectedModel: "llama3.1-8B",
      systemPrompt,
      topK: 8,
    },
    attachment: null,
  };

  const response = await fetch(UPSTREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://chatjimmy.ai",
      Referer: "https://chatjimmy.ai/",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ChatJimmy error ${response.status}: ${errorText}`);
  }

  const raw = await response.text();

  // Strip <|stats|>...</|stats|> tags
  const content = raw.replace(/<\|stats\|>[\s\S]*?<\|\/stats\|>/g, "").trim();

  return content;
}
