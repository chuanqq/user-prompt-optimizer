export type TemplateSource = "builtin" | "local" | "http";

export interface PromptTemplate {
  /** builtin uses a fixed id (DEFAULT_TEMPLATE_ID); local/http use genId(). */
  id: string;
  /** Display name. */
  name: string;
  source: TemplateSource;
  /** local: relative path inside the vault. */
  path?: string;
  /** http: the URL. */
  url?: string;
  /** http: fetched content cache; not stored for builtin/local (builtin reads the constant at runtime; local reads the file fresh each time). */
  content?: string;
  /** http: timestamp (ms) of the last successful fetch. */
  fetchedAt?: number;
}
