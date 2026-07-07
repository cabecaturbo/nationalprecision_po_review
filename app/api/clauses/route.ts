import { NextRequest, NextResponse } from "next/server";
import { anthropicMessages } from "@/lib/anthropic";

// Web search adds round-trips; give the route headroom.
export const runtime = "nodejs";
export const maxDuration = 60;

const FALLBACK =
  "Clause detail unavailable. Review the referenced specification manually.";

export async function POST(req: NextRequest) {
  let body: { clauses?: string[]; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body wasn't valid JSON." },
      { status: 400 },
    );
  }

  const clauses = (body.clauses || []).join("; ");
  const url = body.url || "";

  // Nothing to summarize — mirror the component's behavior (returns null).
  if (!clauses && !url) {
    return NextResponse.json({ summary: null });
  }

  const prompt = `A National Precision Bearing rep is reviewing a PO. It references these quality clauses: "${clauses}". ${
    url ? `The full spec lives at: ${url}. Use web search to read it if reachable.` : ""
  }

Give a tight, high-level summary a rep can skim in 20 seconds. For each clause, one line: what it requires and whether it's an action item (source inspection, cert of conformance, PPAP, first-article, traceability, DFARS/ITAR, etc). If a referenced URL can't be reached, say so plainly and summarize only the clause codes given. Plain text, no markdown headers, no bullet symbols — just short labeled lines.`;

  try {
    const summary = await anthropicMessages({
      max_tokens: 1200,
      // Server-side Anthropic web search tool. Billed per use and must be
      // enabled for the API key's organization.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });
    return NextResponse.json({ summary: summary || FALLBACK });
  } catch {
    // Match the component: a clause-summary failure shouldn't sink the review.
    return NextResponse.json({ summary: FALLBACK });
  }
}
