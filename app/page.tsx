"use client";

import React, { useState, useCallback, useRef } from "react";
import type { PO, ClauseSummary } from "@/lib/types";

// ── National Precision Bearing — PO Review Desk ────────────────────
// Enterprise contract-review tool for inbound bearing POs.
// Brand: NPB corporate blue on white, AS9100D/ISO-audit register.
//   COMPARE — old + revised PO, exact field-level differences
//   REVIEW  — single PO, review card + quality-clause read-out
// Extraction runs through the Anthropic API — server-side, via the internal
// /api/extract and /api/clauses routes (the key never touches the browser).

const NPB_BLUE = "#004b8d"; // corporate blue
const NPB_BLUE_DK = "#00335f";
const INK = "#1a2230";
const SLATE = "#5a6675";
const LINE = "#e2e6ec";
const CANVAS = "#f4f6f9";

// Font stacks (defined as CSS variables in app/layout.tsx).
const DISPLAY = "var(--font-display), 'Archivo', system-ui, sans-serif"; // wordmark, headings, buttons
const BODY = "var(--font-body), 'Inter', -apple-system, system-ui, sans-serif"; // body + tables
const MONO = "var(--font-mono), 'IBM Plex Mono', ui-monospace, monospace"; // technical data values

// `mono: true` renders the value in the mono face — used for codes/numbers/dates
// so the tool reads like an engineering document, not free text.
type FieldDef = { key: keyof PO; label: string; group: string; mono?: boolean };

const FIELDS: FieldDef[] = [
  { key: "po_number", label: "PO number", group: "order", mono: true },
  { key: "part_number", label: "Part / item", group: "order", mono: true },
  { key: "description", label: "Description", group: "order" },
  { key: "quantity", label: "Quantity", group: "order", mono: true },
  { key: "unit_price", label: "Unit price", group: "commercial", mono: true },
  { key: "extended_price", label: "Extended price", group: "commercial", mono: true },
  { key: "payment_terms", label: "Payment terms", group: "commercial" },
  { key: "need_by_date", label: "Need-by date", group: "logistics", mono: true },
  { key: "ship_to", label: "Ship-to address", group: "logistics" },
  { key: "carrier", label: "Carrier / routing", group: "logistics" },
  { key: "carrier_account", label: "Carrier account #", group: "logistics", mono: true },
  { key: "contact_name", label: "Buyer contact", group: "contact" },
  { key: "contact_email", label: "Contact email", group: "contact", mono: true },
  { key: "quality_clauses", label: "Quality clauses", group: "quality" },
  { key: "quality_url", label: "Quality spec URL", group: "quality" },
];

// ── Client-side PDF read + guard (unchanged from the original component) ──
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || file.size === 0)
      return reject(
        new Error(
          "The file is empty or didn't attach. On a phone, pick the PDF from Files rather than a preview thumbnail.",
        ),
      );
    if (file.size > 8 * 1024 * 1024)
      return reject(
        new Error(
          `PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — too large to send from this device. Try a PDF under 8 MB.`,
        ),
      );
    const r = new FileReader();
    r.onload = () => {
      const result = r.result || "";
      const b64 = String(result).split(",")[1];
      if (!b64)
        return reject(new Error("The PDF couldn't be encoded on this device."));
      resolve(b64);
    };
    r.onerror = () => reject(new Error("The device blocked reading this file."));
    r.readAsDataURL(file);
  });
}

// ── Internal API calls (server holds the key; browser never sees it) ──
async function extractPO(file: File): Promise<PO> {
  const pdfBase64 = await fileToBase64(file);
  let res: Response;
  try {
    res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64 }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network request failed (${msg}). Couldn't reach the review service.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Extraction failed (${res.status}).`);
  }
  return data.po as PO;
}

async function summarizeClauses(po: PO): Promise<ClauseSummary | null> {
  const clauses = po.quality_clauses || [];
  const url = po.quality_url || "";
  if (!clauses.length && !url) return null;
  const fallback: ClauseSummary = {
    clauses: [],
    note: "Clause detail unavailable — review the referenced specification manually.",
  };
  let res: Response;
  try {
    res = await fetch("/api/clauses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clauses, url }),
    });
  } catch {
    return fallback;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return fallback;
  return {
    clauses: Array.isArray(data.clauses) ? data.clauses : [],
    note: typeof data.note === "string" ? data.note : null,
  };
}

const fmt = (v: unknown): string =>
  Array.isArray(v)
    ? v.length
      ? v.join(", ")
      : "—"
    : v && String(v).trim()
      ? String(v)
      : "—";

type DiffKind = "added" | "removed" | "changed" | "same";

function diffKind(a: unknown, b: unknown): DiffKind {
  const av = fmt(a),
    bv = fmt(b);
  if (av === "—" && bv !== "—") return "added";
  if (av !== "—" && bv === "—") return "removed";
  if (av !== bv) return "changed";
  return "same";
}

// ── Brand wordmark ─────────────────────────────────────────────────
// Type-only wordmark matching the real National Precision Bearing identity
// (clean navy/white sans, no icon) with the genuine "Reliable. Responsive.
// Relentless." slogan beneath. To drop in the real logo art, place it in
// /public and swap this for <img src="/npb-logo.svg" alt="National Precision Bearing" />.
function Wordmark({ light }: { light?: boolean }) {
  const fg = light ? "#fff" : NPB_BLUE;
  const rule = light ? "rgba(255,255,255,.4)" : "rgba(0,75,141,.28)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ fontFamily: DISPLAY, lineHeight: 1.04 }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.005em", color: fg }}>
          National Precision<span style={{ fontWeight: 500 }}> Bearing</span>
        </div>
        <div style={{ height: 1, background: rule, margin: "6px 0 5px" }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 9.5, letterSpacing: ".16em", color: fg, opacity: 0.82, fontWeight: 600, textTransform: "uppercase" }}>
          Reliable. Responsive. Relentless.
        </div>
      </div>
    </div>
  );
}

function DropZone({
  label,
  file,
  onFile,
  onClear,
}: {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: SLATE, marginBottom: 7, fontWeight: 700 }}>{label}</div>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        style={{
          border: `1.5px ${file ? "solid" : "dashed"} ${over ? NPB_BLUE : file ? "#b9d0e4" : "#c4cdd8"}`,
          background: over ? "#eef4fa" : file ? "#f5f9fd" : "#fff",
          borderRadius: 6, padding: file ? "14px 16px" : "22px 16px",
          cursor: "pointer", transition: "all .12s", position: "relative",
        }}
      >
        <input ref={ref} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 4, background: NPB_BLUE, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>PDF</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
              <div style={{ fontSize: 11, color: SLATE }}>{(file.size / 1024).toFixed(0)} KB · ready</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClear(); }} style={{ border: "none", background: "none", color: SLATE, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: INK, fontWeight: 500 }}>Drop PO here <span style={{ color: SLATE, fontWeight: 400 }}>or click to browse</span></div>
            <div style={{ fontSize: 11, color: SLATE, marginTop: 3 }}>PDF · single purchase order</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ kind }: { kind: DiffKind }) {
  const map: Record<string, { bg: string; fg: string; bd: string; t: string }> = {
    changed: { bg: "#fdf0d9", fg: "#8a5a00", bd: "#f0d9a8", t: "CHANGED" },
    added: { bg: "#e4f3e8", fg: "#1c6b34", bd: "#bfe0c9", t: "ADDED" },
    removed: { bg: "#fbe6e6", fg: "#9a2b2b", bd: "#eec4c4", t: "REMOVED" },
  };
  const s = map[kind];
  if (!s) return null;
  return <span style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, fontSize: 9.5, fontWeight: 700, letterSpacing: ".04em", padding: "2px 7px", borderRadius: 3 }}>{s.t}</span>;
}

const GROUP_LABEL: Record<string, string> = { order: "Order", commercial: "Commercial", logistics: "Logistics & shipping", contact: "Contact", quality: "Quality" };

function Spinner({ light, size = 15 }: { light?: boolean; size?: number }) {
  const track = light ? "rgba(255,255,255,.4)" : "rgba(0,75,141,.22)";
  const head = light ? "#fff" : NPB_BLUE;
  return (
    <span
      className="npb-spin"
      style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `2px solid ${track}`, borderTopColor: head, flexShrink: 0 }}
    />
  );
}

function ActionTag({ text, required }: { text: string; required: boolean }) {
  const bg = required ? "#eaf1f8" : "#f0f2f5";
  const fg = required ? NPB_BLUE : SLATE;
  const bd = required ? "#c5d9ec" : "#dde1e7";
  return (
    <span style={{ fontFamily: DISPLAY, background: bg, color: fg, border: `1px solid ${bd}`, fontSize: 9.5, fontWeight: 600, letterSpacing: ".03em", padding: "3px 8px", borderRadius: 3, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

const CLAUSE_COLS = "150px 1fr 132px";

// Renders the quality-clause read-out as a scannable table (or just a note if
// there was nothing structured to show).
function ClauseSummaryView({ summary }: { summary: ClauseSummary }) {
  if (!summary.clauses.length) {
    return (
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${NPB_BLUE}`, borderRadius: 6, padding: "14px 18px", fontSize: 13, color: "#2c3644", lineHeight: 1.6 }}>
        {summary.note || "No clause detail available."}
      </div>
    );
  }
  return (
    <div>
      <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ fontFamily: DISPLAY, display: "grid", gridTemplateColumns: CLAUSE_COLS, gap: 12, padding: "9px 16px", background: "#f7f9fb", borderBottom: `1px solid ${LINE}`, fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: SLATE, textTransform: "uppercase" }}>
          <div>Clause</div><div>Requirement</div><div>Action</div>
        </div>
        {summary.clauses.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: CLAUSE_COLS, gap: 12, padding: "12px 16px", alignItems: "start", borderTop: i ? `1px solid ${LINE}` : "none" }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: INK, fontWeight: 500, lineHeight: 1.45 }}>{c.code}</div>
            <div style={{ fontSize: 13, color: "#2c3644", lineHeight: 1.5 }}>{c.requirement}</div>
            <div>
              {c.action && c.action.toLowerCase() !== "none"
                ? <ActionTag text={c.action} required={c.actionRequired} />
                : <span style={{ fontSize: 12, color: SLATE }}>—</span>}
            </div>
          </div>
        ))}
      </div>
      {summary.note && (
        <div style={{ marginTop: 10, fontSize: 12, color: SLATE, lineHeight: 1.5 }}>{summary.note}</div>
      )}
    </div>
  );
}

export default function Page() {
  const [mode, setMode] = useState<"compare" | "review">("compare");
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [oldPO, setOldPO] = useState<PO | null>(null);
  const [newPO, setNewPO] = useState<PO | null>(null);
  const [reviewPO, setReviewPO] = useState<PO | null>(null);
  const [clauseSummary, setClauseSummary] = useState<ClauseSummary | null>(null);
  const [error, setError] = useState("");

  const runCompare = useCallback(async () => {
    if (!oldFile || !newFile) return;
    setError(""); setBusy(true); setOldPO(null); setNewPO(null);
    try {
      setStatus("Reading original PO…"); const o = await extractPO(oldFile);
      setStatus("Reading revised PO…"); const n = await extractPO(newFile);
      setOldPO(o); setNewPO(n); setStatus("");
      // TODO: persist review here (e.g. Supabase insert of the compare result).
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read one of the PDFs. Confirm both are text or clear scans, then try again.");
    } finally {
      setBusy(false);
    }
  }, [oldFile, newFile]);

  const runReview = useCallback(async () => {
    if (!singleFile) return;
    setError(""); setBusy(true); setReviewPO(null); setClauseSummary(null);
    try {
      setStatus("Extracting PO fields…"); const po = await extractPO(singleFile); setReviewPO(po);
      setStatus("Reading quality clauses…"); const cs = await summarizeClauses(po); setClauseSummary(cs); setStatus("");
      // TODO: persist review here (e.g. Supabase insert of the review + clause summary).
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that PDF. Confirm it's a text or clear scanned PO.");
    } finally {
      setBusy(false);
    }
  }, [singleFile]);

  // Switching modes clears prior output so stale results from the other mode
  // don't linger on screen (e.g. a compare table hanging above a new review).
  const switchMode = (m: "compare" | "review") => {
    if (m === mode) return;
    setMode(m);
    setError("");
    setStatus("");
    setOldPO(null);
    setNewPO(null);
    setReviewPO(null);
    setClauseSummary(null);
  };

  // Clear everything back to an empty intake — the explicit "start over" so the
  // user doesn't have to refresh the page after an analysis.
  const resetAll = () => {
    setError("");
    setStatus("");
    setOldFile(null);
    setNewFile(null);
    setSingleFile(null);
    setOldPO(null);
    setNewPO(null);
    setReviewPO(null);
    setClauseSummary(null);
  };

  const changed = oldPO && newPO ? FIELDS.filter((f) => diffKind(oldPO[f.key], newPO[f.key]) !== "same") : [];

  return (
    <div style={{ minHeight: "100vh", background: CANVAS, fontFamily: BODY, color: INK }}>
      {/* top brand bar */}
      <div style={{ background: NPB_BLUE, borderBottom: `3px solid ${NPB_BLUE_DK}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "13px 26px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark light />
          <div style={{ display: "flex", gap: 6 }}>
            {["AS9100D", "ISO 9001:2015", "DFARS", "ITAR"].map((c) => (
              <span key={c} style={{ fontFamily: DISPLAY, fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", color: "#fff", border: "1px solid rgba(255,255,255,.35)", borderRadius: 2, padding: "4px 7px" }}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* app title strip */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 26px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: ".14em", color: NPB_BLUE, fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>Contract Review</div>
            <h1 style={{ fontFamily: DISPLAY, margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>PO Review Desk</h1>
          </div>
          <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 4, overflow: "hidden" }}>
            {([["compare", "Compare revisions"], ["review", "Review a PO"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => switchMode(m)} style={{
                fontFamily: DISPLAY, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "9px 18px", letterSpacing: ".01em",
                background: mode === m ? NPB_BLUE : "#fff", color: mode === m ? "#fff" : SLATE,
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "26px 26px 90px" }}>
        {/* intake card */}
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, padding: 22, boxShadow: "0 1px 2px rgba(16,40,70,.04)" }}>
          {mode === "compare" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 18 }}>
                <DropZone label="Original PO" file={oldFile} onFile={setOldFile} onClear={() => setOldFile(null)} />
                <DropZone label="Revised PO" file={newFile} onFile={setNewFile} onClear={() => setNewFile(null)} />
              </div>
              <button disabled={!oldFile || !newFile || busy} onClick={runCompare} style={btn(!oldFile || !newFile || busy)}>
                {busy ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><Spinner light />{status || "Working…"}</span>
                ) : "Compare purchase orders"}
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                <DropZone label="Purchase order" file={singleFile} onFile={setSingleFile} onClear={() => setSingleFile(null)} />
              </div>
              <button disabled={!singleFile || busy} onClick={runReview} style={btn(!singleFile || busy)}>
                {busy ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><Spinner light />{status || "Working…"}</span>
                ) : "Run contract review"}
              </button>
            </>
          )}
        </div>

        {error && <div style={{ marginTop: 16, background: "#fbe6e6", border: "1px solid #eec4c4", color: "#9a2b2b", padding: "11px 14px", borderRadius: 6, fontSize: 13 }}>{error}</div>}

        {/* COMPARE */}
        {oldPO && newPO && (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontFamily: DISPLAY, margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>Revision summary</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 700, color: changed.length ? "#8a5a00" : "#1c6b34" }}>
                  {changed.length ? `${changed.length} field${changed.length > 1 ? "s" : ""} changed` : "No changes detected"}
                </span>
                <button onClick={resetAll} style={ghostBtn()}>New comparison</button>
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ fontFamily: DISPLAY, display: "grid", gridTemplateColumns: "168px 1fr 1fr 96px", gap: 12, padding: "9px 16px", background: "#f7f9fb", borderBottom: `1px solid ${LINE}`, fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: SLATE, textTransform: "uppercase" }}>
                <div>Field</div><div>Original</div><div>Revised</div><div style={{ textAlign: "right" }}>Status</div>
              </div>
              {FIELDS.map((f, i) => {
                const k = diffKind(oldPO[f.key], newPO[f.key]);
                const on = k !== "same";
                return (
                  <div key={f.key} style={{ display: "grid", gridTemplateColumns: "168px 1fr 1fr 96px", gap: 12, padding: "11px 16px", alignItems: "center", background: on ? "#fffdf8" : "#fff", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                    <div style={{ fontSize: 12, color: SLATE, fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontFamily: f.mono ? MONO : BODY, fontSize: f.mono ? 12 : 13, color: on ? "#9a2b2b" : INK, textDecoration: k === "removed" ? "line-through" : "none" }}>{fmt(oldPO[f.key])}</div>
                    <div style={{ fontFamily: f.mono ? MONO : BODY, fontSize: f.mono ? 12 : 13, color: on ? "#1c6b34" : INK, fontWeight: on ? 600 : 400 }}>{fmt(newPO[f.key])}</div>
                    <div style={{ textAlign: "right" }}><StatusTag kind={k} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* REVIEW */}
        {reviewPO && (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontFamily: DISPLAY, margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>Review card</h2>
              <button onClick={resetAll} style={ghostBtn()}>Review new PO</button>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
              {["order", "commercial", "logistics", "contact"].map((g) => (
                <div key={g}>
                  <div style={{ fontFamily: DISPLAY, padding: "7px 16px", background: "#f7f9fb", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, fontSize: 10, fontWeight: 600, letterSpacing: ".09em", color: NPB_BLUE, textTransform: "uppercase" }}>{GROUP_LABEL[g]}</div>
                  {FIELDS.filter((f) => f.group === g).map((f, i) => (
                    <div key={f.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "10px 16px", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                      <div style={{ fontSize: 12, color: SLATE, fontWeight: 600 }}>{f.label}</div>
                      <div style={{ fontFamily: f.mono ? MONO : BODY, fontSize: f.mono ? 12 : 13, color: INK }}>{fmt(reviewPO[f.key])}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <h2 style={{ fontFamily: DISPLAY, margin: "24px 0 10px", fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 8 }}>
              Quality clauses
              {!(reviewPO.quality_clauses?.length || reviewPO.quality_url) && <span style={{ fontSize: 12.5, color: SLATE, fontWeight: 400 }}>— none referenced on this PO</span>}
            </h2>
            {busy && !clauseSummary && (reviewPO.quality_clauses?.length || reviewPO.quality_url) ? (
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${NPB_BLUE}`, borderRadius: 6, padding: "15px 18px", display: "flex", alignItems: "center", gap: 11 }}>
                <Spinner />
                <span className="npb-pulse" style={{ fontSize: 13, color: SLATE, fontWeight: 500 }}>
                  Reviewing quality clauses — reading the referenced specification…
                </span>
              </div>
            ) : clauseSummary ? (
              <ClauseSummaryView summary={clauseSummary} />
            ) : null}
          </div>
        )}

        <div style={{ fontFamily: DISPLAY, marginTop: 40, paddingTop: 16, borderTop: `1px solid ${LINE}`, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600, color: "#9aa4b1" }}>
          Demo · testing version
        </div>
      </div>
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    fontFamily: DISPLAY, border: "none", borderRadius: 4, background: disabled ? "#c4cdd8" : NPB_BLUE,
    color: "#fff", fontSize: 13.5, fontWeight: 700, padding: "11px 22px",
    cursor: disabled ? "default" : "pointer", letterSpacing: ".02em",
  };
}

// Outlined "start over" button shown alongside results.
function ghostBtn(): React.CSSProperties {
  return {
    fontFamily: DISPLAY, border: `1px solid ${NPB_BLUE}`, background: "#fff", color: NPB_BLUE,
    fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 4,
    cursor: "pointer", letterSpacing: ".02em", whiteSpace: "nowrap",
  };
}
