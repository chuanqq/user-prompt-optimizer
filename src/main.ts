import { type Editor, type Menu, Notice, Plugin } from "obsidian";
import { cloneDefaults, migrateLegacyTemplate, type PluginSettings } from "./settings";
import { runOptimize, type OptimizeMode } from "./commands/optimize";
import { openSwitchTemplate } from "./commands/switch-template";
import { OptimizerSettingTab } from "./ui/setting-tab";
import { StatusController } from "./ui/status";
import { createOptimizeProgressField } from "./ui/progress-decoration";
import { Logger } from "./utils/logger";

export default class ObsidianPromptOptimizer extends Plugin {
  settings: PluginSettings = cloneDefaults();
  status!: StatusController;
  logger!: Logger;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.status = new StatusController();
    this.logger = new Logger(this.app, this.manifest.id);

    const statusEl = this.addStatusBarItem();
    this.status.setStatusEl(statusEl);

    const ribbonEl = this.addRibbonIcon("wand", "ObsidianPromptOptimizer", () => {
      // While optimizing: click to interrupt; otherwise show a usage hint.
      if (!this.status.cancelIfRunning()) {
        new Notice("Select a prompt, then run the optimize command or use the context menu. Click here again to stop an in-progress optimization.");
      }
    });
    this.status.setRibbonEl(ribbonEl);

    // Persistent progress Notice: spinner + text + stop button, created/updated/hidden with the state machine lifecycle.
    this.status.setNoticeFactory((text, onStop) => {
      const frag = document.createDocumentFragment();
      const container = frag.createDiv({ cls: "opo-notice" });
      container.createSpan({ cls: "opo-spinner" });
      const textEl = container.createSpan({ cls: "opo-notice-text", text });
      const stopEl = container.createEl("button", { cls: "opo-notice-stop", text: "Stop" });
      stopEl.addEventListener("click", (e) => {
        e.preventDefault();
        onStop();
      });
      const notice = new Notice(frag, 0);
      return {
        update: (t: string) => textEl.setText(t),
        hide: () => notice.hide(),
      };
    });

    // In-editor progress decoration (selection highlight + banner); the banner stop button routes to the state machine cancel.
    this.registerEditorExtension(
      createOptimizeProgressField({ onStop: () => this.status.cancelIfRunning() })
    );

    this.addCommand({
      id: "optimize-prompt",
      name: "Optimize prompt",
      editorCallback: (editor: Editor) => this.optimize(editor, "template"),
    });

    this.addCommand({
      id: "optimize-prompt-lite",
      name: "Optimize prompt (lite, no template)",
      editorCallback: (editor: Editor) => this.optimize(editor, "lite"),
    });

    this.addCommand({
      id: "switch-template",
      name: "Switch optimization template",
      callback: () => openSwitchTemplate(this.app, this),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        if (!editor) return;
        menu.addItem((i) =>
          i.setTitle("Prompt: calibrate (lite)").onClick(() => this.optimize(editor, "lite"))
        );
        menu.addItem((i) =>
          i.setTitle("Prompt: optimize (template)").onClick(() => this.optimize(editor, "template"))
        );
      })
    );

    this.addSettingTab(new OptimizerSettingTab(this.app, this));
  }

  /** Unified entry for both optimize commands. */
  private optimize(editor: Editor, mode: OptimizeMode): void {
    void runOptimize({
      app: this.app,
      settings: this.settings,
      editor,
      logger: this.logger,
      status: this.status,
      mode,
    });
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    const defaults = cloneDefaults();
    let merged: PluginSettings = {
      ...defaults,
      ...(loaded ?? {}),
      openai: { ...defaults.openai, ...(loaded?.openai ?? {}) },
      anthropic: { ...defaults.anthropic, ...(loaded?.anthropic ?? {}) },
    };
    // Fallback: templates missing/empty, or activeTemplateId invalid.
    if (!merged.templates?.length) merged.templates = defaults.templates;
    if (!merged.templates.some((t) => t.id === merged.activeTemplateId)) {
      merged.activeTemplateId = merged.templates[0].id;
    }
    // Legacy field migration: templatePath -> local template
    const legacyPath = (loaded as { templatePath?: string } | null)?.templatePath;
    merged = migrateLegacyTemplate(merged, legacyPath);
    this.settings = merged;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
