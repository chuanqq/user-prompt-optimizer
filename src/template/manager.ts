import type { PluginSettings } from "../settings";
import type { PromptTemplate } from "./types";
import { DEFAULT_TEMPLATE_ID } from "../engine/system";

/**
 * Template pure-logic layer (does not import obsidian, so it is unit-testable).
 * IO-dependent add/refresh operations live in ./actions.ts.
 */

export function genId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Return the active template; fall back to the first one when activeTemplateId is invalid. */
export function getActiveTemplate(settings: PluginSettings): PromptTemplate {
  return (
    settings.templates.find((t) => t.id === settings.activeTemplateId) ??
    settings.templates[0]
  );
}

/** Set the active template; returns true on a hit. */
export function setActiveTemplate(settings: PluginSettings, id: string): boolean {
  if (settings.templates.some((t) => t.id === id)) {
    settings.activeTemplateId = id;
    return true;
  }
  return false;
}

/** Remove a template; deleting the active one falls back to builtin.default; builtin.default itself cannot be deleted. */
export function removeTemplate(settings: PluginSettings, id: string): void {
  if (id === DEFAULT_TEMPLATE_ID) return;
  const idx = settings.templates.findIndex((t) => t.id === id);
  if (idx < 0) return;
  settings.templates.splice(idx, 1);
  if (settings.activeTemplateId === id) {
    settings.activeTemplateId = settings.templates[0]?.id ?? DEFAULT_TEMPLATE_ID;
  }
}
