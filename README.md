# Speed Search

The world's fastest AI search engine. Sub-second web search → cited answer, streaming. Runs on Cloudflare Workers at 300+ edge POPs worldwide.

**Live:** [pin.dev](https://pin.dev)

---

## How it works

```
  you → Cloudflare Worker ─┬─→ Exa  Instant Search  (~300ms, web results + snippets)
                           └─→ ChatJimmy  (Llama 3.1 8B, ~500ms, streaming answer)
```

1. **Search** — [Exa](https://exa.ai)'s `instant` endpoint returns 8 web results with text snippets in ~300ms. We set `livecrawl: "never"` to hit cache only and keep tail latency flat.
2. **Answer** — The search results become context for a streaming LLM answer with inline citations.
3. **Edge** — Both routes live in a single V8 isolate on Cloudflare Workers. ~25ms cold start, worldwide anycast.

---

## About ChatJimmy

[ChatJimmy](https://chatjimmy.ai) is a public Llama 3.1 8B demo operated by **[Taalas](https://taalas.com)**, a hardware startup that hard-wires transformer weights directly into custom silicon. This lets them hit roughly **17,000 tokens/second** — orders of magnitude faster than GPU inference. All of the "fast" in Speed Search's *answer* step comes from Taalas's work, not ours.

### How we talk to it

There is no official ChatJimmy SDK. Instead, this project stands on the shoulders of **[Fadeleke57/jimmy-proxy](https://github.com/Fadeleke57/jimmy-proxy)** — an OpenAI-compatible Python proxy that reverse-engineers chatjimmy.ai's API (request shape, header spoofing, `<|stats|>` tag parsing) and exposes it at `localhost:4100/v1/chat/completions`.

`src/lib/jimmy.ts` is a **TypeScript port of that proxy**, inlined directly into our Next.js edge route. The wire protocol is identical — same endpoint, same payload shape (`selectedModel`, `systemPrompt`, `topK`), same response post-processing. Our only modification was the delivery mechanism: instead of running a separate Python process on `localhost:4100`, we run the proxy logic in-worker so it ships to the edge as part of the app. Full credit for figuring out ChatJimmy's API belongs to Fadeleke57.

---

## Quickstart

```bash
git clone https://github.com/AnonymousBazinga/ultra-fast-aisearch speed-search
cd speed-search
npm install

# Create .env.local with your Exa API key
echo "EXA_API_KEY=your_exa_key_here" > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Get a free Exa API key at [dashboard.exa.ai](https://dashboard.exa.ai). No ChatJimmy key needed — the demo is public.

---

## Deploy to Cloudflare Workers

```bash
# Store the Exa key as an encrypted Worker secret
npx wrangler secret put EXA_API_KEY

# Build with the OpenNext adapter and deploy
npx opennextjs-cloudflare build
npx wrangler deploy
```

Cloudflare cold start is ~25ms, so no keep-warm cron is needed for a single-isolate app like this. Custom domains are configured in `wrangler.jsonc`.

---

## Tech stack

- **[Next.js 16](https://nextjs.org)** · App Router, React 19
- **[Cloudflare Workers](https://workers.cloudflare.com)** · via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **[Exa Instant Search](https://exa.ai/blog/exa-instant)** · sub-150ms neural web search
- **[ChatJimmy / Taalas](https://chatjimmy.ai)** · Llama 3.1 8B on custom silicon
- **Tailwind CSS 4**, **Framer Motion**, **react-markdown**

---

## Credits

- **[Fadeleke57](https://github.com/Fadeleke57)** — for [`jimmy-proxy`](https://github.com/Fadeleke57/jimmy-proxy), the original Python proxy this project's `src/lib/jimmy.ts` is ported from. We didn't figure out how to talk to ChatJimmy — they did. Their repo has no explicit license; this TypeScript port is published in good faith with full attribution. If you want a standalone OpenAI-compatible endpoint for ChatJimmy, use theirs.
- **[Taalas](https://taalas.com)** — for ChatJimmy, the hardware-accelerated Llama inference that powers every answer. Without their custom silicon, this project would be called "Medium Speed Search".
- **[Exa](https://exa.ai)** — for the Instant Search API.

And please — if you build on this, respect ChatJimmy's public demo and don't hammer it with automated traffic.

---

## License

MIT for our code. The `src/lib/jimmy.ts` port is derived from [Fadeleke57/jimmy-proxy](https://github.com/Fadeleke57/jimmy-proxy), which at time of writing has no license file declared. Use at your own discretion.
