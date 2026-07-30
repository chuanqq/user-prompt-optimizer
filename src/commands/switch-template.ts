import { type App, FuzzySuggestModal, Notice } from "obsidian";
import type ObsidianPromptOptimizer from "../main";
import type { PromptTemplate } from "../template/types";
import { setActiveTemplate } from "../template/manager";

/** Command entry to switch the active template at runtime. */
export function openSwitchTemplate(app: App, plugin: ObsidianPromptOptimizer): void {
  new SwitchTemplateModal(app, plugin).open();
}

class SwitchTemplateModal extends FuzzySuggestModal<PromptTemplate> {
  constructor(app: App, private plugin: ObsidianPromptOptimizer) {
    super(app);
    this.setPlaceholder("Select an optimization template");
  }

  getItems(): PromptTemplate[] {
    return this.plugin.settings.templates;
  }

  getItemText(t: PromptTemplate): string {
    const tag = t.source === "builtin" ? "Built-in" : t.source === "local" ? "Local" : "URL";
    const active = t.id === this.plugin.settings.activeTemplateId ? " · current" : "";
    return `${t.name} (${tag})${active}`;
  }

  onChooseItem(t: PromptTemplate): void {
    if (setActiveTemplate(this.plugin.settings, t.id)) {
      void this.plugin.saveSettings();
      new Notice(`Switched to template: ${t.name}`, 2000);
    }
  }
}
