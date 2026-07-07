import React, { useState, useCallback, useRef } from "react";

// ── National Precision Bearing — PO Review Desk ────────────────────
// Enterprise contract-review tool for inbound bearing POs.
// Brand: NPB corporate blue on white, AS9100D/ISO-audit register.
//   COMPARE — old + revised PO, exact field-level differences
//   REVIEW  — single PO, review card + quality-clause read-out
// Extraction runs through the Anthropic API on real PO PDFs.

const NPB_BLUE = "#004b8d";      // corporate blue
const NPB_BLUE_DK = "#00335f";
const INK = "#1a2230";
const SLATE = "#5a6675";
const LINE = "#e2e6ec";
const CANVAS = "#f4f6f9";

const FIELDS = [
  { key: "po_number", label: "PO number", group: "order" },
  { key: "part_number", label: "Part / item", group: "order" },
  { key: "description", label: "Description", group: "order" },
  { key: "quantity", label: "Quantity", group: "order" },
  { key: "unit_price", label: "Unit price", group: "commercial" },
  { key: "extended_price", label: "Extended price", group: "commercial" },
  { key: "payment_terms", label: "Payment terms", group: "commercial" },
  { key: "need_by_date", label: "Need-by date", group: "logistics" },
  { key: "ship_to", label: "Ship-to address", group: "logistics" },
  { key: "carrier", label: "Carrier / routing", group: "logistics" },
  { key: "carrier_account", label: "Carrier account #", group: "logistics" },
  { key: "contact_name", label: "Buyer contact", group: "contact" },
  { key: "contact_email", label: "Contact email", group: "contact" },
  { key: "quality_clauses", label: "Quality clauses", group: "quality" },
  { key: "quality_url", label: "Quality spec URL", group: "quality" },
];

const EXTRACT_PROMPT = `You are reading a purchase order sent to National Precision Bearing, a bearing distributor. Extract these fields into a single JSON object and return ONLY the JSON — no prose, no markdown fences.

Keys (use empty string "" if not present, EXCEPT quality_clauses which is an array of strings):
- po_number, part_number, description, quantity, unit_price, extended_price, need_by_date, ship_to, carrier, carrier_account, contact_name, contact_email, payment_terms, quality_url
- quality_clauses: array of any quality clause codes or requirements referenced (e.g. "Q1", "DFARS traceability", "C of C required", "source inspection"). Empty array if none.

Return values as plain strings exactly as they appear (keep currency symbols and date formatting).`;

async function callClaude(messages, maxTokens = 1500) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages }),
    });
  } catch (e) {
    throw new Error(`Network request failed (${e.message}). The tool couldn't reach the API from this device.`);
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch {}
    throw new Error(`API returned ${res.status}. ${detail}`);
  }
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

const stripFences = (t) => t.replace(/```json/gi, "").replace(/```/g, "").trim();

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size === 0) return reject(new Error("The file is empty or didn't attach. On a phone, pick the PDF from Files rather than a preview thumbnail."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error(`PDF is ${(file.size/1024/1024).toFixed(1)} MB — too large to send from this device. Try a PDF under 8 MB.`));
    const r = new FileReader();
    r.onload = () => {
      const result = r.result || "";
      const b64 = String(result).split(",")[1];
      if (!b64) return reject(new Error("The PDF couldn't be encoded on this device."));
      resolve(b64);
    };
    r.onerror = () => reject(new Error("The device blocked reading this file."));
    r.readAsDataURL(file);
  });
}

async function extractPO(file) {
  const b64 = await fileToBase64(file);
  const text = await callClaude([
    { role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
      { type: "text", text: EXTRACT_PROMPT },
    ] },
  ]);
  try {
    return JSON.parse(stripFences(text));
  } catch {
    throw new Error("The PO was read but the fields came back in an unexpected format. Try again, or try a clearer PDF.");
  }
}

async function summarizeClauses(po) {
  const clauses = (po.quality_clauses || []).join("; ");
  const url = po.quality_url || "";
  if (!clauses && !url) return null;
  return callClaude([
    { role: "user", content: `A National Precision Bearing rep is reviewing a PO. It references these quality clauses: "${clauses}". ${url ? `The full spec lives at: ${url}. Use web search to read it if reachable.` : ""}

Give a tight, high-level summary a rep can skim in 20 seconds. For each clause, one line: what it requires and whether it's an action item (source inspection, cert of conformance, PPAP, first-article, traceability, DFARS/ITAR, etc). If a referenced URL can't be reached, say so plainly and summarize only the clause codes given. Plain text, no markdown headers, no bullet symbols — just short labeled lines.` }],
    1200
  ).catch(() => "Clause detail unavailable. Review the referenced specification manually.");
}

const fmt = (v) => Array.isArray(v) ? (v.length ? v.join(", ") : "—") : (v && String(v).trim() ? v : "—");

function diffKind(a, b) {
  const av = fmt(a), bv = fmt(b);
  if (av === "—" && bv !== "—") return "added";
  if (av !== "—" && bv === "—") return "removed";
  if (av !== bv) return "changed";
  return "same";
}

// ── Brand wordmark (CSS recreation of NPB lockup) ──────────────────
function Wordmark({ light }) {
  const fg = light ? "#fff" : NPB_BLUE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${fg}` }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: `2px solid ${fg}`, opacity: 0.5 }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 4, height: 4, borderRadius: "50%", background: fg, transform: "translate(-50%,-50%)" }} />
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", color: fg }}>
          NATIONAL PRECISION<span style={{ fontWeight: 500, opacity: 0.85 }}> BEARING</span>
        </div>
        <div style={{ fontSize: 8.5, letterSpacing: ".34em", color: fg, opacity: 0.7, marginTop: 3, fontWeight: 600 }}>
          RELIABLE · RESPONSIVE · RELENTLESS
        </div>
      </div>
    </div>
  );
}

function DropZone({ label, file, onFile, onClear }) {
  const ref = useRef(null);
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

function StatusTag({ kind }) {
  const map = {
    changed: { bg: "#fdf0d9", fg: "#8a5a00", bd: "#f0d9a8", t: "CHANGED" },
    added: { bg: "#e4f3e8", fg: "#1c6b34", bd: "#bfe0c9", t: "ADDED" },
    removed: { bg: "#fbe6e6", fg: "#9a2b2b", bd: "#eec4c4", t: "REMOVED" },
  };
  const s = map[kind]; if (!s) return null;
  return <span style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, fontSize: 9.5, fontWeight: 700, letterSpacing: ".04em", padding: "2px 7px", borderRadius: 3 }}>{s.t}</span>;
}

const GROUP_LABEL = { order: "Order", commercial: "Commercial", logistics: "Logistics & shipping", contact: "Contact", quality: "Quality" };

export default function App() {
  const [mode, setMode] = useState("compare");
  const [oldFile, setOldFile] = useState(null);
  const [newFile, setNewFile] = useState(null);
  const [singleFile, setSingleFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [oldPO, setOldPO] = useState(null);
  const [newPO, setNewPO] = useState(null);
  const [reviewPO, setReviewPO] = useState(null);
  const [clauseSummary, setClauseSummary] = useState(null);
  const [error, setError] = useState("");

  const runCompare = useCallback(async () => {
    setError(""); setBusy(true); setOldPO(null); setNewPO(null);
    try {
      setStatus("Reading original PO…"); const o = await extractPO(oldFile);
      setStatus("Reading revised PO…"); const n = await extractPO(newFile);
      setOldPO(o); setNewPO(n); setStatus("");
    } catch (e) { setError(e.message || "Couldn't read one of the PDFs. Confirm both are text or clear scans, then try again."); }
    finally { setBusy(false); }
  }, [oldFile, newFile]);

  const runReview = useCallback(async () => {
    setError(""); setBusy(true); setReviewPO(null); setClauseSummary(null);
    try {
      setStatus("Extracting PO fields…"); const po = await extractPO(singleFile); setReviewPO(po);
      setStatus("Reading quality clauses…"); const cs = await summarizeClauses(po); setClauseSummary(cs); setStatus("");
    } catch (e) { setError(e.message || "Couldn't read that PDF. Confirm it's a text or clear scanned PO."); }
    finally { setBusy(false); }
  }, [singleFile]);

  const changed = oldPO && newPO ? FIELDS.filter((f) => diffKind(oldPO[f.key], newPO[f.key]) !== "same") : [];

  return (
    <div style={{ minHeight: "100vh", background: CANVAS, fontFamily: "'Inter',-apple-system,system-ui,sans-serif", color: INK }}>
      {/* top brand bar */}
      <div style={{ background: NPB_BLUE, borderBottom: `3px solid ${NPB_BLUE_DK}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "13px 26px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark light />
          <div style={{ display: "flex", gap: 6 }}>
            {["AS9100D", "ISO 9001:2015", "DFARS", "ITAR"].map((c) => (
              <span key={c} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".03em", color: "#fff", border: "1px solid rgba(255,255,255,.35)", borderRadius: 3, padding: "3px 7px" }}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* app title strip */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 26px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", color: NPB_BLUE, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Contract Review</div>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-.02em" }}>PO Review Desk</h1>
          </div>
          <div style={{ display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
            {[["compare", "Compare revisions"], ["review", "Review a PO"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "9px 18px",
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
                {busy ? status || "Working…" : "Compare purchase orders"}
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                <DropZone label="Purchase order" file={singleFile} onFile={setSingleFile} onClear={() => setSingleFile(null)} />
              </div>
              <button disabled={!singleFile || busy} onClick={runReview} style={btn(!singleFile || busy)}>
                {busy ? status || "Working…" : "Run contract review"}
              </button>
            </>
          )}
        </div>

        {error && <div style={{ marginTop: 16, background: "#fbe6e6", border: "1px solid #eec4c4", color: "#9a2b2b", padding: "11px 14px", borderRadius: 6, fontSize: 13 }}>{error}</div>}

        {/* COMPARE */}
        {oldPO && newPO && (
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>Revision summary</h2>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: changed.length ? "#8a5a00" : "#1c6b34" }}>
                {changed.length ? `${changed.length} field${changed.length > 1 ? "s" : ""} changed` : "No changes detected"}
              </span>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "168px 1fr 1fr 96px", gap: 12, padding: "9px 16px", background: "#f7f9fb", borderBottom: `1px solid ${LINE}`, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: SLATE, textTransform: "uppercase" }}>
                <div>Field</div><div>Original</div><div>Revised</div><div style={{ textAlign: "right" }}>Status</div>
              </div>
              {FIELDS.map((f, i) => {
                const k = diffKind(oldPO[f.key], newPO[f.key]);
                const on = k !== "same";
                return (
                  <div key={f.key} style={{ display: "grid", gridTemplateColumns: "168px 1fr 1fr 96px", gap: 12, padding: "11px 16px", alignItems: "center", background: on ? "#fffdf8" : "#fff", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                    <div style={{ fontSize: 12, color: SLATE, fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontSize: 13, color: on ? "#9a2b2b" : INK, textDecoration: k === "removed" ? "line-through" : "none" }}>{fmt(oldPO[f.key])}</div>
                    <div style={{ fontSize: 13, color: on ? "#1c6b34" : INK, fontWeight: on ? 600 : 400 }}>{fmt(newPO[f.key])}</div>
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
            <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>Review card</h2>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
              {["order", "commercial", "logistics", "contact"].map((g) => (
                <div key={g}>
                  <div style={{ padding: "7px 16px", background: "#f7f9fb", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, fontSize: 10, fontWeight: 700, letterSpacing: ".07em", color: NPB_BLUE, textTransform: "uppercase" }}>{GROUP_LABEL[g]}</div>
                  {FIELDS.filter((f) => f.group === g).map((f, i) => (
                    <div key={f.key} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "10px 16px", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                      <div style={{ fontSize: 12, color: SLATE, fontWeight: 600 }}>{f.label}</div>
                      <div style={{ fontSize: 13, color: INK }}>{fmt(reviewPO[f.key])}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <h2 style={{ margin: "24px 0 10px", fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 8 }}>
              Quality clauses
              {!(reviewPO.quality_clauses?.length || reviewPO.quality_url) && <span style={{ fontSize: 12.5, color: SLATE, fontWeight: 400 }}>— none referenced on this PO</span>}
            </h2>
            {clauseSummary && (
              <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${NPB_BLUE}`, borderRadius: 6, padding: "15px 18px", fontSize: 13, lineHeight: 1.65, color: "#2c3644", whiteSpace: "pre-wrap" }}>
                {clauseSummary}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${LINE}`, fontSize: 11.5, color: "#8792a1", lineHeight: 1.6 }}>
          Internal demo build. Field extraction and clause summaries are AI-assisted — verify anything that drives a commitment (price, dates, quality requirements) against the source PO before acting. A production release would pull orders directly from E21 in place of PDF uploads.
        </div>
      </div>
    </div>
  );
}

function btn(disabled) {
  return {
    border: "none", borderRadius: 6, background: disabled ? "#c4cdd8" : NPB_BLUE,
    color: "#fff", fontSize: 13.5, fontWeight: 700, padding: "11px 22px",
    cursor: disabled ? "default" : "pointer", letterSpacing: ".01em",
  };
}
