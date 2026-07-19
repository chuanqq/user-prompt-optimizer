import type { ChatRequest, ModelInfo } from "./types";

/**
 * LLM provider abstraction. All providers implement this interface.
 * chatStream is streaming: it yields text deltas one chunk at a time; the caller accumulates them and writes them into the selection.
 * listModels still uses requestUrl (non-streaming; used by the settings page).
 */
export interface LLMProvider {
  readonly kind: "openai" | "anthropic";
  chatStream(req: ChatRequest): AsyncGenerator<string, void, void>;
  listModels(): Promise<ModelInfo[]>;
}
