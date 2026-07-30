import { type App } from "obsidian";
import type { PluginSettings } from "../settings";
import type { PromptTemplate } from "./types";
import { OpError } from "../utils/error";
import { fetchHttpTemplate } from "./http";
import { extractTemplateName, readVaultFile } from "./loader";
import { genId } from "./manager";

/**
 * Template IO operations (depend on obsidian/vault/network; not unit-tested).
 * Pure logic lives in ./manager.ts.
 */

/** Add a local template: read + validate, pick a display name, and append it. */
export async function addLocalTemplate(
  app: App,
  settings: PluginSettings,
  path: string,
  name?: string
): Promise<PromptTemplate> {
  const text = await readVaultFile(app, path);
  const tpl: PromptTemplate = {
    id: genId(),
    name: name?.trim() || extractTemplateName(text) || path.split(/[\\/]/).pop() || path,
    source: "local",
    path,
  };
  settings.templates.push(tpl);
  return tpl;
}

/** Add an http template: fetch + validate, cache the content, and append it. */
export async function addHttpTemplate(
  settings: PluginSettings,
  url: string,
  name?: string
): Promise<PromptTemplate> {
  const content = await fetchHttpTemplate(url);
  const tpl: PromptTemplate = {
    id: genId(),
    name: name?.trim() || url,
    source: "http",
    url,
    content,
    fetchedAt: Date.now(),
  };
  settings.templates.push(tpl);
  return tpl;
}

/** Refresh an http template: re-fetch and overwrite the cache and timestamp. */
export async function refreshHttpTemplate(
  settings: PluginSettings,
  id: string
): Promise<void> {
  const tpl = settings.templates.find((t) => t.id === id);
  if (!tpl || tpl.source !== "http" || !tpl.url) {
    throw new OpError("Only URL templates can be refreshed");
  }
  tpl.content = await fetchHttpTemplate(tpl.url);
  tpl.fetchedAt = Date.now();
}
