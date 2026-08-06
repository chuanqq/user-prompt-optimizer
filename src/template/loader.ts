import { type App, TFile } from "obsidian";
import { OpError } from "../utils/error";

/** Extract the `name` field from a YAML frontmatter (or undefined if absent). Only used as a fallback display name when adding a local template. */
export function extractTemplateName(text: string): string | undefined {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) return undefined;
  const nameLine = fm[1].match(/^name:\s*(.+?)\s*$/m);
  return nameLine ? nameLine[1].replace(/^["']|["']$/g, "") : undefined;
}

/** Read the full text of a file in the vault. Throws OpError if the file does not exist. */
export async function readVaultFile(app: App, path: string): Promise<string> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new OpError(`File not found: ${path}`);
  return app.vault.read(file);
}
