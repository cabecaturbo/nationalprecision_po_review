import { NextRequest, NextResponse } from "next/server";
import { anthropicMessages } from "@/lib/anthropic";
import type { ClauseRow, ClauseSummary } from "@/lib/types";

// Web search adds round-trips; give the route headroom.
export const runtime = "nodejs";
export const maxDuration = 60;

const FALLBACK: ClauseSummary = {
  clauses: [],
  note: "Clause detail unavailable — review the referenced specification manually.",
};

const stripFences = (t: string) =>
  t.replace(/```json/gi, "").replace(/```/g, "").trim();

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

  // Nothing to summarize.
  if (!clauses && !url) {
    return NextResponse.json<ClauseSummary>({ clauses: [], note: null });
  }

  const prompt = `A National Precision Bearing rep is reviewing a purchase order. It references these quality clauses: "${clauses}". ${
    url ? `The full specification is at: ${url} — use web search to read it if reachable.` : ""
  }

Return ONLY a JSON object (no prose, no markdown fences) in exactly this shape:
{
  "clauses": [
    {
      "code": "<short clause code or name, e.g. 'Q1' or 'DFARS 252.225-7009'>",
      "requirement": "<one concise sentence, under ~15 words: what it requires>",
      "action": "<2-3 word action type: e.g. 'Cert of Conformance', 'Source inspection', 'First article', 'Traceability', 'DFARS flowdown', or 'None'>",
      "actionRequired": true
    }
  ],
  "note": "<one short sentence, or null: e.g. whether the referenced spec URL was read or could not be reached>"
}

Rules: one entry per distinct clause; "requirement" stays under ~15 words; set "actionRequired" false only for purely informational clauses; if the URL can't be reached, say so in "note" and summarize just the clause codes given.`;

  try {
    const raw = await anthropicMessages({
      max_tokens: 1500,
      // Server-side Anthropic web search tool. Billed per use and must be
      // enabled for the API key's organization.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      return NextResponse.json<ClauseSummary>({
        clauses: [],
        note: "Couldn't structure the clause summary — review the specification manually.",
      });
    }

    // Normalize/validate the shape so the UI can trust it.
    const obj = (parsed ?? {}) as { clauses?: unknown; note?: unknown };
    const rows: ClauseRow[] = Array.isArray(obj.clauses)
      ? obj.clauses.map((c) => {
          const r = (c ?? {}) as Partial<ClauseRow>;
          return {
            code: String(r.code ?? "").trim() || "—",
            requirement: String(r.requirement ?? "").trim(),
            action: String(r.action ?? "").trim() || "None",
            actionRequired: r.actionRequired !== false,
          };
        })
      : [];
    const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : null;

    return NextResponse.json<ClauseSummary>({ clauses: rows, note });
  } catch {
    // A clause-summary failure shouldn't sink the whole review.
    return NextResponse.json<ClauseSummary>(FALLBACK);
  }
}
