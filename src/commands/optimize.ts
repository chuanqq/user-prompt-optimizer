import { type App, type Editor, type EditorPosition, Notice } from "obsidian";
import type { PluginSettings } from "../settings";
import type { Logger } from "../utils/logger";
import type { StatusController } from "../ui/status";
import { assembleLiteUserMessage, assembleUserMessage } from "../engine/assemble";
import {
  ENGINE_SYSTEM_PROMPT,
  LITE_SYSTEM_PROMPT,
  DEFAULT_TEMPLATE_NAME,
  LITE_MODE_LABEL,
} from "../engine/system";
import { DEFAULT_BUILTIN_TEMPLATE } from "../engine/builtin-template";
import { getActiveTemplate } from "../template/manager";
import { getTemplateContent } from "../template/content";
import { getProvider } from "../llm";
import { describeError } from "../utils/error";
import { beginOptimizeSession, endOptimizeSession } from "../ui/progress-decoration";

/** Optimization mode: template = structured optimization against the active template (default); lite = template-free light polish. */
export type OptimizeMode = "template" | "lite";

export interface OptimizeDeps {
  app: App;
  settings: PluginSettings;
  editor: Editor;
  logger: Logger;
  status: StatusController;
  mode?: OptimizeMode;
}

/** Core command: select a prompt -> assemble (template or lite mode) -> stream the LLM -> write back into the selection char by char. */
export async function runOptimize(deps: OptimizeDeps): Promise<void> {
  const { app, settings, editor, logger, status } = deps;
  const mode = deps.mode ?? "template";

  const selection = editor.getSelection();
  if (!selection) {
    new Notice("Select a prompt fragment to optimize first.");
    return;
  }

  const providerKind = settings.activeProvider;
  const activeModel = settings[providerKind].model;

  // Template mode: load the active template content; on failure fall back to the default builtin without blocking the optimization.
  // Lite mode: do not load any template; use LITE_MODE_LABEL instead of the template name in logs/status.
  let templateContent = DEFAULT_BUILTIN_TEMPLATE;
  let templateLabel = LITE_MODE_LABEL;
  if (mode === "template") {
    templateLabel = DEFAULT_TEMPLATE_NAME;
    const tpl = getActiveTemplate(settings);
    try {
      templateContent = await getTemplateContent(app, tpl);
      templateLabel = tpl.name;
    } catch (e) {
      new Notice(`${describeError(e)} (continuing with the default template)`, 6000);
    }
  }

  const signal = status.start(`${activeModel} · ${templateLabel}`);
  const startedAt = Date.now();

  // Track endPos manually: after replaceRange the cursor position is unreliable (it tends to
  // jump back to the insertion start). If we relied on getCursor("to"), later deltas would
  // insert before the previous chunk and pile up in reverse order.
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  let endPos: EditorPosition = to;

  // In-editor progress decoration (range highlight + banner), same label as the status bar; cleaned up in finally.
  beginOptimizeSession(editor, from, to, `${activeModel} · ${templateLabel}`);

  let full = "";
  let firstDelta = true;
  try {
    const provider = getProvider(settings);
    const systemPrompt = mode === "lite" ? LITE_SYSTEM_PROMPT : ENGINE_SYSTEM_PROMPT;
    const user =
      mode === "lite"
        ? assembleLiteUserMessage(selection)
        : assembleUserMessage(templateContent, selection);
    for await (const delta of provider.chatStream({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user },
      ],
      model: activeModel,
      temperature: settings.temperature,
      topP: settings.topP,
      stop: settings.stop.length ? settings.stop : undefined,
      seed: settings.seed ?? undefined,
      maxTokens: settings.maxTokens,
      reasoningEffort: settings.reasoningEffort,
      timeoutMs: settings.requestTimeoutMs,
      signal,
    })) {
      if (firstDelta) {
        status.onGenerating();
        editor.replaceRange(delta, from, to);
        endPos = advancePos(from, delta);
        firstDelta = false;
      } else {
        editor.replaceRange(delta, endPos);
        endPos = advancePos(endPos, delta);
      }
      full += delta;
    }

    const elapsed = Date.now() - startedAt;
    if (!full.trim()) {
      new Notice("Optimization failed: the model returned empty content.", 8000);
      status.fail();
      await logger.log({
        time: now(), provider: providerKind, model: activeModel, template: templateLabel,
        inputChars: selection.length, outputChars: 0, elapsedMs: elapsed,
        ok: false, error: "empty response",
      });
      return;
    }
    status.finish(`Optimized (${full.length} chars · ${(elapsed / 1000).toFixed(1)}s)`);
    await logger.log({
      time: now(), provider: providerKind, model: activeModel, template: templateLabel,
      inputChars: selection.length, outputChars: full.length, elapsedMs: elapsed, ok: true,
    });
  } catch (e) {
    // User-initiated cancel (ribbon second click) -> silent; timeout / other errors -> notify.
    if (status.isUserCancelled()) {
      return;
    }
    console.error("[ObsidianPromptOptimizer]", e);
    new Notice(describeError(e), 8000);
    status.fail();
    await logger.log({
      time: now(), provider: providerKind, model: activeModel, template: templateLabel,
      inputChars: selection.length, outputChars: full.length, elapsedMs: Date.now() - startedAt,
      ok: false, error: describeError(e),
    });
  } finally {
    // All exit paths (success / empty response / failure / user cancel) uniformly clean up the decoration.
    endOptimizeSession(editor);
  }
}

function now(): string {
  return new Date().toISOString();
}

/** Advance the editor position: count by UTF-16 code units (matches CodeMirror position semantics), advancing the line on newline. */
function advancePos(pos: EditorPosition, text: string): EditorPosition {
  let line = pos.line;
  let ch = pos.ch;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      ch = 0;
    } else {
      ch++;
    }
  }
  return { line, ch };
}
