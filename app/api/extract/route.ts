import { NextRequest, NextResponse } from "next/server";
import { anthropicMessages } from "@/lib/anthropic";
import type { PO } from "@/lib/types";

// PDF extraction can take a while on large scans; keep it on the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 8 * 1024 * 1024; // mirrors the client-side 8 MB guard

const EXTRACT_PROMPT = `You are reading a purchase order sent to National Precision Bearing, a bearing distributor. Extract these fields into a single JSON object and return ONLY the JSON — no prose, no markdown fences.

Keys (use empty string "" if not present, EXCEPT quality_clauses which is an array of strings):
- po_number, part_number, description, quantity, unit_price, extended_price, need_by_date, ship_to, carrier, carrier_account, contact_name, contact_email, payment_terms, quality_url
- quality_clauses: array of any quality clause codes or requirements referenced (e.g. "Q1", "DFARS traceability", "C of C required", "source inspection"). Empty array if none.

Return values as plain strings exactly as they appear (keep currency symbols and date formatting).`;

const stripFences = (t: string) =>
  t.replace(/```json/gi, "").replace(/```/g, "").trim();

export async function POST(req: NextRequest) {
  let body: { pdfBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body wasn't valid JSON." },
      { status: 400 },
    );
  }

  const pdfBase64 = body.pdfBase64;
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return NextResponse.json(
      { error: "No PDF was included in the request." },
      { status: 400 },
    );
  }

  // base64 inflates ~33%; approximate the decoded size to enforce the guard
  // server-side too (the client guards on File.size, but never trust the client).
  const approxBytes = Math.floor((pdfBase64.length * 3) / 4);
  if (approxBytes > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        error: `PDF is ~${(approxBytes / 1024 / 1024).toFixed(1)} MB — over the 8 MB limit. Try a PDF under 8 MB.`,
      },
      { status: 413 },
    );
  }

  let text: string;
  try {
    text = await anthropicMessages({
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The extraction request failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let po: PO;
  try {
    po = JSON.parse(stripFences(text));
  } catch {
    return NextResponse.json(
      {
        error:
          "The PO was read but the fields came back in an unexpected format. Try again, or try a clearer PDF.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ po });
}
