import { LITE_USER_TEMPLATE, USER_TEMPLATE } from "./system";

/** Optional role-injection controls: when roleEnabled is false (or omitted), both helpers yield empty strings
 *  and the assembled message is byte-identical to the no-role form. */
export interface RoleOpts {
  roleEnabled?: boolean;
  roleHint?: string;
}

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

/**
 * Build the <role_hint> data block (empty when role injection is off or no hint is given).
 * Same defense-in-depth as <reference_template>: sanitize forged tags so hint content cannot escape its data region.
 */
function buildRoleHintBlock(opts: RoleOpts | undefined): string {
  const hint = opts?.roleHint?.trim() ?? "";
  if (!opts?.roleEnabled || !hint) return "";
  return `<role_hint>\n${sanitizeTag(hint, "role_hint")}\n</role_hint>\n\n`;
}

/**
 * Build the role-preamble directive clause appended to the final instruction (empty when role injection is off).
 * Two shapes so the system prompt knows which path to take: with-hint (always prepend, use the hint verbatim)
 * vs. auto-infer from subject matter (may omit when no domain is identifiable).
 */
function buildRoleDirective(opts: RoleOpts | undefined): string {
  if (!opts?.roleEnabled) return "";
  const hint = opts.roleHint?.trim() ?? "";
  if (hint) {
    return " Prepend a role preamble using the domain given in <role_hint> verbatim.";
  }
  return " If a clear professional domain can be inferred from the subject matter of <original_prompt>, prepend a single role preamble line before the optimized prompt; otherwise omit it.";
}

/** Assemble the user message: first sanitize escaping tags in both inputs, then interpolate into USER_TEMPLATE. */
export function assembleUserMessage(template: string, selection: string, opts?: RoleOpts): string {
  const cleanTpl = sanitizeTag(template, "reference_template");
  const cleanSel = sanitizeTag(selection, "original_prompt");
  return render(USER_TEMPLATE, {
    template: cleanTpl,
    selection: cleanSel,
    role_hint_block: buildRoleHintBlock(opts),
    role_directive: buildRoleDirective(opts),
  });
}

/** Assemble the lite-mode user message: a single input (the selection); sanitize escaping tags, then interpolate into LITE_USER_TEMPLATE. */
export function assembleLiteUserMessage(selection: string, opts?: RoleOpts): string {
  const cleanSel = sanitizeTag(selection, "original_prompt");
  return render(LITE_USER_TEMPLATE, {
    selection: cleanSel,
    role_hint_block: buildRoleHintBlock(opts),
    role_directive: buildRoleDirective(opts),
  });
}
