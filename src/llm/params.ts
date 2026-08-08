import type { ReasoningEffort, ProviderDialect } from "../settings";
import type { ChatMessage, ChatRequest } from "./types";

/**
 * Pure-function collection for request body construction and parameter merging.
 * Extracted from the provider IO code so it can be unit-tested in isolation.
 */

/**
 * DeepSeek thinking-tier mapping: the protocol only has high/max tiers; minimal disables thinking.
 * The UI's six tiers collapse onto these: low/medium → high, high/xhigh/max → max (and undefined → max).
 */
export function buildDeepSeekReasoning(effort: ReasoningEffort | undefined): {
  thinking: { type: "enabled" | "disabled" };
  reasoning_effort?: "high" | "max";
} {
  switch (effort) {
    case "minimal":
      return { thinking: { type: "disabled" } };
    case "low":
    case "medium":
      return { thinking: { type: "enabled" }, reasoning_effort: "high" };
    case "high":
    case "xhigh":
    case "max":
    default:
      return { thinking: { type: "enabled" }, reasoning_effort: "max" };
  }
}

/** OpenAI native allowlist: only the o-series / gpt-5 series support reasoning_effort. */
export function isOpenAIReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model);
}

/**
 * OpenAI-compatible request body (openai / deepseek dialects). Pure function.
 * Sampling matrix: when deepseek thinking is enabled, omit temperature/top_p (DeepSeek docs: they have no effect).
 */
export function buildOpenAICompatBody(
  req: ChatRequest,
  dialect: ProviderDialect
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxTokens ?? 2048,
    stream: true,
  };
  const effort = req.reasoningEffort;

  if (dialect === "deepseek") {
    const r = buildDeepSeekReasoning(effort);
    body.thinking = r.thinking;
    if (r.reasoning_effort) body.reasoning_effort = r.reasoning_effort;
    if (r.thinking.type === "disabled") {
      body.temperature = req.temperature ?? 0.3;
      if (req.topP !== undefined) body.top_p = req.topP;
    }
    // deepseek dialect does not support seed; do not send it
  } else {
    if (effort && isOpenAIReasoningModel(req.model)) {
      body.reasoning_effort = effort;
    }
    body.temperature = req.temperature ?? 0.3;
    if (req.topP !== undefined) body.top_p = req.topP;
    if (req.seed !== undefined && req.seed !== null) body.seed = req.seed;
  }

  if (req.stop && req.stop.length) body.stop = req.stop;
  return body;
}

/**
 * Anthropic thinking budget tiers. minimal does not enable thinking.
 * Anthropic has no notion of tiers above "use the whole budget", so high/xhigh/max
 * all map to the same maximum (maxTokens − 2048, floored at 8192) — keeping high's
 * formula unchanged preserves backward compatibility for existing users.
 */
export function buildAnthropicThinking(
  effort: ReasoningEffort | undefined,
  maxTokens: number
): { type: "enabled"; budget_tokens: number } | undefined {
  switch (effort) {
    case "minimal":
      return undefined;
    case "low":
      return { type: "enabled", budget_tokens: 2048 };
    case "medium":
      return { type: "enabled", budget_tokens: 8192 };
    case "high":
    case "xhigh":
    case "max":
    default:
      return { type: "enabled", budget_tokens: Math.max(maxTokens - 2048, 8192) };
  }
}

/** Split out the system message (Anthropic requires system as a standalone field, not inside messages). */
export function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  turns: ChatMessage[];
} {
  const systems = messages.filter((m) => m.role === "system").map((m) => m.content);
  const turns = messages.filter((m) => m.role !== "system");
  const system = systems.join("\n\n");
  return { system: system || undefined, turns };
}

/** Anthropic Messages API request body. Pure function. */
export function buildAnthropicBody(req: ChatRequest): Record<string, unknown> {
  const { system, turns } = splitSystem(req.messages);
  const maxTokens = req.maxTokens ?? 8192;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: turns.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    stream: true,
  };
  if (system) body.system = system;

  const thinking = buildAnthropicThinking(req.reasoningEffort, maxTokens);
  if (thinking) {
    body.thinking = thinking;
    body.temperature = 1; // Anthropic: temperature must be 1 when thinking is enabled
  } else {
    body.temperature = req.temperature ?? 0.3;
  }
  if (req.topP !== undefined) body.top_p = req.topP;
  if (req.stop && req.stop.length) body.stop_sequences = req.stop;
  return body;
}

/** Protected request body keys: passthrough must not overwrite them (managed by the plugin logic). */
export const PROTECTED_BODY_KEYS = new Set([
  "model", "messages", "stream", "temperature", "top_p", "max_tokens",
  "stop", "stop_sequences", "seed", "reasoning_effort", "thinking", "system",
]);

/** Protected request header keys: passthrough must not overwrite them. */
export const PROTECTED_HEADER_KEYS = new Set([
  "Authorization", "x-api-key", "anthropic-version", "Content-Type",
]);

/** Merge extraBody into the body: protected keys are ignored and recorded. Returns the full merged body. */
export function mergeExtraBody(
  body: Record<string, unknown>,
  extra: Record<string, unknown>
): { merged: Record<string, unknown>; ignored: string[] } {
  const ignored: string[] = [];
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (PROTECTED_BODY_KEYS.has(k)) {
      ignored.push(k);
    } else {
      safe[k] = v;
    }
  }
  return { merged: { ...safe, ...body }, ignored };
}

/** Merge extraHeaders into the headers: protected keys are ignored and recorded. */
export function mergeExtraHeaders(
  headers: Record<string, string>,
  extra: Record<string, string>
): { merged: Record<string, string>; ignored: string[] } {
  const ignored: string[] = [];
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (PROTECTED_HEADER_KEYS.has(k)) {
      ignored.push(k);
    } else {
      safe[k] = String(v);
    }
  }
  return { merged: { ...safe, ...headers }, ignored };
}

/** Parse JSON text into an object; an empty string is treated as {}. A non-object or invalid JSON returns an error. */
export function parseJsonObject(
  text: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Must be a JSON object {}" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** Idle timeout handle: aborts when no reset() happens within the configured window. */
export interface IdleTimeout {
  signal: AbortSignal;
  /** Restart the idle clock (call on every received chunk). */
  reset(): void;
  /** Stop the timer for good; call on every exit path so the timer cannot leak. */
  dispose(): void;
}

/**
 * Create an idle timeout: the signal aborts when no data has been received for `ms`.
 * Returns null when disabled (missing or <= 0). The abort reason mirrors
 * AbortSignal.timeout (a TimeoutError DOMException) so describeError keeps
 * mapping it to the timeout message.
 */
export function createIdleTimeout(ms: number | undefined): IdleTimeout | null {
  if (!ms || ms <= 0) return null;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    timer = setTimeout(() => {
      ctrl.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }, ms);
  };
  arm();
  return {
    signal: ctrl.signal,
    reset() {
      clearTimeout(timer);
      arm();
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}

/**
 * Merge the user cancel signal with the timeout signal.
 * Either may be missing; AbortSignal.any merges them when both exist.
 * The timeout fires via its own signal and does not pollute the user signal (so the caller can distinguish user cancel vs timeout).
 */
export function mergeAbortSignal(
  userSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal | undefined
): AbortSignal | undefined {
  if (!userSignal) return timeoutSignal;
  if (!timeoutSignal) return userSignal;
  return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([userSignal, timeoutSignal]);
}
