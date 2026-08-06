// Settings types and default values.
// NOTE: API Key is currently stored in data.json (synced with the vault).
// TODO: migrate to Obsidian SecretStorage (>=1.11.4) for per-device, non-synced storage.

import type { PromptTemplate } from "./template/types";
import { DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME } from "./engine/system";

export type ProviderKind = "openai" | "anthropic";

// Six tiers, ordered low → high. OpenAI accepts all of these natively
// (xhigh since gpt-5.1-codex-max, max since gpt-5.6); DeepSeek/Anthropic only
// have coarser tiers, so the extra levels collapse into their top tier in params.ts.
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Dialect for OpenAI-compatible providers: decides how the reasoning field is built. Only the openai-compatible provider reads it. */
export type ProviderDialect = "openai" | "deepseek";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Dialect for OpenAI-compatible providers. The anthropic provider ignores this field. */
  dialect: ProviderDialect;
  /** Extra request body fields, merged into the body (protected keys excluded). */
  extraBody: Record<string, unknown>;
  /** Extra request headers, merged into headers (protected keys excluded). */
  extraHeaders: Record<string, string>;
}

export interface PluginSettings {
  activeProvider: ProviderKind;
  openai: ProviderConfig;
  anthropic: ProviderConfig;
  /** All optimization templates (including the built-in default). */
  templates: PromptTemplate[];
  /** Currently active template id. */
  activeTemplateId: string;
  /** Reasoning effort: drives OpenAI reasoning_effort / DeepSeek thinking+effort / Anthropic thinking budget. */
  reasoningEffort: ReasoningEffort;
  /** Token budget for output + thinking combined. */
  maxTokens: number;
  requestTimeoutMs: number;
  /** Sampling temperature (ignored in thinking mode). */
  temperature: number;
  /** Nucleus sampling (ignored in thinking mode). */
  topP: number;
  /** Stop sequences. */
  stop: string[];
  /** Random seed; null means disabled (only honored by the openai-compatible dialect). */
  seed: number | null;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  activeProvider: "openai",
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    dialect: "openai",
    extraBody: {},
    extraHeaders: {},
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    apiKey: "",
    model: "claude-sonnet-5",
    dialect: "openai", // the anthropic provider does not read this field
    extraBody: {},
    extraHeaders: {},
  },
  templates: [{ id: DEFAULT_TEMPLATE_ID, name: DEFAULT_TEMPLATE_NAME, source: "builtin" }],
  activeTemplateId: DEFAULT_TEMPLATE_ID,
  reasoningEffort: "high",
  maxTokens: 8192,
  requestTimeoutMs: 60000,
  temperature: 0.3,
  topP: 1,
  stop: [],
  seed: null,
};

/** Deep-clone the default settings to avoid mutating the constant at runtime. */
export function cloneDefaults(): PluginSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as PluginSettings;
}

/**
 * Migrate a legacy templatePath into a local template (if not already present).
 * Returns a new object when migration happens, otherwise the original object.
 * Called by main.ts loadSettings after merging.
 */
export function migrateLegacyTemplate(
  settings: PluginSettings,
  legacyPath: string | undefined
): PluginSettings {
  const p = legacyPath?.trim();
  if (!p) return settings;
  if (settings.templates.some((t) => t.source === "local" && t.path === p)) return settings;
  const migrated: PromptTemplate = {
    id: `migrated_${Date.now().toString(36)}`,
    name: p.split(/[\\/]/).pop() || p,
    source: "local",
    path: p,
  };
  return {
    ...settings,
    templates: [...settings.templates, migrated],
    activeTemplateId: migrated.id,
  };
}
