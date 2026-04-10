import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = "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";

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "ultra-fast",
        max_results: 8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Tavily API error:", errorText);
      return NextResponse.json(
        { error: "Search failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
