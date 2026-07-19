import type { ReasoningEffort } from "../settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  topP?: number;
  stop?: string[];
  /** Only honored by the openai-compatible dialect (DeepSeek/Anthropic do not support it). */
  seed?: number;
  maxTokens?: number;
  /** Reasoning effort: OpenAI -> reasoning_effort; DeepSeek -> thinking toggle + effort; Anthropic -> thinking budget. */
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
  /** Abort signal: passed to fetch; aborting terminates the stream. */
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  name?: string;
}
