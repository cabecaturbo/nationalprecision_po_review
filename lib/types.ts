// Shape of a parsed purchase order. Mirrors the keys the extraction prompt
// asks Claude to return. Every value is a plain string EXCEPT quality_clauses,
// which is an array of clause codes / requirements.
export type PO = {
  po_number: string;
  part_number: string;
  description: string;
  quantity: string;
  unit_price: string;
  extended_price: string;
  payment_terms: string;
  need_by_date: string;
  ship_to: string;
  carrier: string;
  carrier_account: string;
  contact_name: string;
  contact_email: string;
  quality_clauses: string[];
  quality_url: string;
};

export type ExtractResponse = { po: PO } | { error: string };

// One row of the quality-clause read-out.
export type ClauseRow = {
  code: string; // clause code or short name, e.g. "Q1" or "DFARS 252.225-7009"
  requirement: string; // one concise sentence: what it requires
  action: string; // short action type, e.g. "Cert of Conformance", "Source inspection", "None"
  actionRequired: boolean; // true if the supplier/rep must act on it
};

export type ClauseSummary = {
  clauses: ClauseRow[];
  note: string | null; // e.g. whether the referenced spec URL was read or unreachable
};

export type ClauseResponse = ClauseSummary | { error: string };
