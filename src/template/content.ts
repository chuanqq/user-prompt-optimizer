import { type App } from "obsidian";
import type { PromptTemplate } from "./types";
import { DEFAULT_BUILTIN_TEMPLATE } from "../engine/builtin-template";
import { readVaultFile } from "./loader";
import { fetchHttpTemplate } from "./http";
import { OpError } from "../utils/error";

/**
 * Get the full text of a template.
 * - builtin: read the built-in constant;
 * - local: read the latest from the vault each time (no cache; the file is the source of truth);
 * - http: use the cached content; if no cache, fetch it (the caller is responsible for writing the cache after fetching; see actions.refreshHttpTemplate).
 */
export async function getTemplateContent(app: App, tpl: PromptTemplate): Promise<string> {
  if (tpl.source === "builtin") return DEFAULT_BUILTIN_TEMPLATE;
  if (tpl.source === "local") {
    if (!tpl.path) throw new OpError("Local template has no path configured");
    return readVaultFile(app, tpl.path);
  }
  if (tpl.content != null) return tpl.content;
  return fetchHttpTemplate(tpl.url ?? "");
}
