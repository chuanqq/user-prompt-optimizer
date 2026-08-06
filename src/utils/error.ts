/** User-facing error type for the plugin. */
export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpError";
  }
}

/** Format a non-2xx response from requestUrl into a readable message (used by non-streaming calls like listModels). */
export function requestErrorMessage(
  res: { status: number; json?: unknown },
  label: string
): string {
  const err = (res.json as { error?: { message?: string } | string } | undefined)?.error;
  const msg = typeof err === "string" ? err : err?.message;
  return `${label} request failed (HTTP ${res.status}): ${msg ?? "unknown error"}`;
}

/** Extract a readable message from a fetch error response (used by the streaming chatStream). */
export async function fetchErrorMessage(res: Response, label: string): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    const json = JSON.parse(text) as { error?: { message?: string } | string };
    const msg = typeof json.error === "string" ? json.error : json.error?.message;
    if (msg) detail = `HTTP ${res.status}: ${msg}`;
  } catch {
    /* ignore parse failure */
  }
  return `${label} request failed (${detail})`;
}

/** Convert any error into a user-facing message. */
export function describeError(e: unknown): string {
  if (e instanceof OpError) return e.message;
  const err = e as { status?: number; message?: string; name?: string } | undefined;
  if (err?.name === "AbortError") return "Request cancelled";
  if (err?.status === 401 || err?.status === 403) return "Authentication failed: API Key is invalid or lacks permission";
  if (err?.status === 429) return "Rate limit exceeded, please try again later";
  if (err?.status && err.status >= 500) return "Model server error, please try again later";
  if (/timeout|aborted/i.test(String(e))) return "Request timed out or was interrupted";
  if (/Failed to fetch|NetworkError|ECONN|ERR_NETWORK/i.test(String(e)))
    return "Network connection failed (check whether your proxy/network can reach the API)";
  return "Optimization failed: " + (err?.message ?? String(e));
}
