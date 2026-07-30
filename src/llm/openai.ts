import { Notice, requestUrl } from "obsidian";
import type { LLMProvider } from "./provider";
import type { ChatRequest, ModelInfo } from "./types";
import type { ProviderConfig } from "../settings";
import { OpError, requestErrorMessage, fetchErrorMessage } from "../utils/error";
import { readSSE } from "./sse";
import {
  buildOpenAICompatBody,
  mergeExtraBody,
  mergeExtraHeaders,
  mergeAbortSignal,
  createIdleTimeout,
} from "./params";

/** OpenAI-compatible provider: covers OpenAI / DeepSeek / OpenRouter / Ollama / Groq, etc. */
export class OpenAIProvider implements LLMProvider {
  readonly kind = "openai" as const;
  constructor(private cfg: ProviderConfig) {}

  async *chatStream(req: ChatRequest): AsyncGenerator<string, void, void> {
    const url = `${trimSlash(this.cfg.baseUrl)}/chat/completions`;
    const raw = buildOpenAICompatBody(req, this.cfg.dialect);
    const { merged: body, ignored } = mergeExtraBody(raw, this.cfg.extraBody);
    if (ignored.length) {
      console.warn("[ObsidianPromptOptimizer] Ignored protected extraBody keys:", ignored);
      new Notice(`Ignored from extraBody: ${ignored.join(", ")} (managed by the plugin)`, 6000);
    }
    const { merged: headers, ignored: ignoredH } = mergeExtraHeaders(
      { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
      this.cfg.extraHeaders
    );
    if (ignoredH.length) {
      console.warn("[ObsidianPromptOptimizer] Ignored protected extraHeaders keys:", ignoredH);
    }
    const idle = createIdleTimeout(req.timeoutMs);
    const signal = mergeAbortSignal(req.signal, idle?.signal);

    // Streaming note: the native fetch is intentionally used here instead of Obsidian's requestUrl.
    // requestUrl buffers the full body and cannot read SSE chunks incrementally; chatStream requires
    // incremental parsing to drive the streaming UI. This is an accepted deviation from the linter rule.
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new OpError(await fetchErrorMessage(res, "OpenAI"));

      let produced = false;
      for await (const data of readSSE(res)) {
        // Any received frame proves the connection is alive; restart the idle clock.
        idle?.reset();
        if (data === "[DONE]") break;
        let json: { choices?: { delta?: { content?: string } }[] };
        try {
          // Cast the parsed value to the expected shape; member access below is checked against it.
          json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          produced = true;
          yield delta;
        }
      }
      if (!produced) throw new OpError("OpenAI returned an empty response");
    } finally {
      idle?.dispose();
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${trimSlash(this.cfg.baseUrl)}/models`;
    const res = await requestUrl({
      url,
      method: "GET",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
      throw: false,
    });
    if (res.status >= 400) throw new OpError(requestErrorMessage(res, "OpenAI models"));
    const data = (res.json?.data ?? []) as { id: string }[];
    return data.map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
