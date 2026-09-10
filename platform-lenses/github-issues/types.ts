/** Host-facing protocol types used by the GitHub lens. */
export interface ExternalIntent {
  id: string;
  operation: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ExternalReceipt {
  status: number;
  body: string;
}

export interface ConnectionState {
  revision: number;
  records: Record<string, { local: string; baseline: Record<string, unknown> | null }>;
  cursor: unknown;
}
