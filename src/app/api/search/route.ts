import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const tEntry = Date.now();
  const { query } = await req.json();
  const tParsed = Date.now();

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "EXA_API_KEY not configured" }, { status: 500 });
  }

  try {
    const tFetchStart = Date.now();
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "instant",
        numResults: 8,
        contents: {
          text: { maxCharacters: 1500 },
          highlights: { numSentences: 3 },
          livecrawl: "never",
        },
      }),
    });
    const tFetchHeaders = Date.now();

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Exa API error:", errorText);
      return NextResponse.json(
        { error: "Search failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const tFetchBody = Date.now();

    const serverTiming = [
      `req_parse;dur=${tParsed - tEntry}`,
      `pre_fetch;dur=${tFetchStart - tParsed}`,
      `exa_ttfb;dur=${tFetchHeaders - tFetchStart}`,
      `exa_body;dur=${tFetchBody - tFetchHeaders}`,
      `total;dur=${tFetchBody - tEntry}`,
    ].join(", ");

    return NextResponse.json(data, {
      headers: { "Server-Timing": serverTiming },
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
