import { Notice, requestUrl } from "obsidian";
import type { LLMProvider } from "./provider";
import type { ChatRequest, ModelInfo } from "./types";
import type { ProviderConfig } from "../settings";
import { OpError, requestErrorMessage, fetchErrorMessage } from "../utils/error";
import { readSSE } from "./sse";
import { buildAnthropicBody, mergeExtraBody, mergeExtraHeaders, mergeAbortSignal } from "./params";

/** Anthropic native Messages API provider. */
export class AnthropicProvider implements LLMProvider {
  readonly kind = "anthropic" as const;
  constructor(private cfg: ProviderConfig) {}

  async *chatStream(req: ChatRequest): AsyncGenerator<string, void, void> {
    const url = `${trimSlash(this.cfg.baseUrl)}/v1/messages`;
    const raw = buildAnthropicBody(req);
    const { merged: body, ignored } = mergeExtraBody(raw, this.cfg.extraBody);
    if (ignored.length) {
      console.warn("[ObsidianPromptOptimizer] Ignored protected extraBody keys:", ignored);
      new Notice(`Ignored from extraBody: ${ignored.join(", ")} (managed by the plugin)`, 6000);
    }
    const { merged: headers, ignored: ignoredH } = mergeExtraHeaders(
      {
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      this.cfg.extraHeaders
    );
    if (ignoredH.length) {
      console.warn("[ObsidianPromptOptimizer] Ignored protected extraHeaders keys:", ignoredH);
    }
    const signal = mergeAbortSignal(req.signal, req.timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new OpError(await fetchErrorMessage(res, "Anthropic"));

    let produced = false;
    for await (const data of readSSE(res)) {
      let json: { type?: string; delta?: { type?: string; text?: string } };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      // Only emit text deltas; ignore thinking_delta (do not show the reasoning to the user).
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
        const text = json.delta.text;
        if (text) {
          produced = true;
          yield text;
        }
      }
    }
    if (!produced) throw new OpError("Anthropic returned an empty response");
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${trimSlash(this.cfg.baseUrl)}/v1/models`;
    const res = await requestUrl({
      url,
      method: "GET",
      headers: {
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      throw: false,
    });
    if (res.status >= 400) throw new OpError(requestErrorMessage(res, "Anthropic models"));
    const data = (res.json?.data ?? []) as { id: string; display_name?: string }[];
    return data
      .map((m) => ({ id: m.id, name: m.display_name }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
