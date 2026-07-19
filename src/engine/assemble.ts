import { LITE_USER_TEMPLATE, USER_TEMPLATE } from "./system";

/** Simple variable interpolation: {{var}} -> vars[var]; unmatched keys become empty strings. */
export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip opening/closing tags of the given name from text, case-insensitively, to prevent content from escaping the XML data region. */
export function sanitizeTag(text: string, tag: string): string {
  const re = new RegExp(`</?\\s*${escapeRegExp(tag)}\\s*>`, "gi");
  return text.replace(re, "");
}

/** Assemble the user message: first sanitize escaping tags in both inputs, then interpolate into USER_TEMPLATE. */
export function assembleUserMessage(template: string, selection: string): string {
  const cleanTpl = sanitizeTag(template, "reference_template");
  const cleanSel = sanitizeTag(selection, "original_prompt");
  return render(USER_TEMPLATE, { template: cleanTpl, selection: cleanSel });
}

/** Assemble the lite-mode user message: a single input (the selection); sanitize escaping tags, then interpolate into LITE_USER_TEMPLATE. */
export function assembleLiteUserMessage(selection: string): string {
  const cleanSel = sanitizeTag(selection, "original_prompt");
  return render(LITE_USER_TEMPLATE, { selection: cleanSel });
}
