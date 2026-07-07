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
export type ClauseResponse = { summary: string | null } | { error: string };
