import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import type { PluginSettings, ProviderKind } from "../settings";
import { OpError } from "../utils/error";

/** Get the provider instance for the given kind (used by the settings-page "Fetch models" button). */
export function getProviderFor(settings: PluginSettings, kind: ProviderKind): LLMProvider {
  const cfg = settings[kind];
  if (!cfg.apiKey) throw new OpError(`API Key for ${kind} is not configured (please fill it in on the settings page)`);
  return kind === "anthropic" ? new AnthropicProvider(cfg) : new OpenAIProvider(cfg);
}

/** Get the currently active provider instance. */
export function getProvider(settings: PluginSettings): LLMProvider {
  return getProviderFor(settings, settings.activeProvider);
}

export type { LLMProvider } from "./provider";
