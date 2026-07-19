import { type App, type DropdownComponent, FuzzySuggestModal, Modal, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import type ObsidianPromptOptimizer from "../main";
import type { ProviderKind, ReasoningEffort } from "../settings";
import { getProviderFor } from "../llm";
import { describeError } from "../utils/error";
import { parseJsonObject } from "../llm/params";
import type { PromptTemplate, TemplateSource } from "../template/types";
import { getActiveTemplate, setActiveTemplate, removeTemplate } from "../template/manager";
import { addLocalTemplate, addHttpTemplate, refreshHttpTemplate } from "../template/actions";

interface ProviderPreset {
  label: string;
  baseUrl: string;
  dialect: "openai" | "deepseek";
  model?: string;
}

/** OpenAI-compatible provider presets: selecting one auto-fills baseUrl/dialect/suggested model. Only used by the openai provider. */
const PROVIDER_PRESETS: ProviderPreset[] = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", dialect: "openai", model: "gpt-4o-mini" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com", dialect: "deepseek", model: "deepseek-v4-flash" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", dialect: "openai" },
  { label: "Ollama", baseUrl: "http://localhost:11434/v1", dialect: "openai" },
];

export class OptimizerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ObsidianPromptOptimizer) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("LLM provider")
      .setDesc("Select the global provider; both providers can be configured independently")
      .addDropdown((d) =>
        d
          .addOption("openai", "OpenAI (compatible)")
          .addOption("anthropic", "Anthropic")
          .setValue(s.activeProvider)
          .onChange(async (v) => {
            s.activeProvider = v as ProviderKind;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Active provider expanded on top; inactive collapsed.
    const order: ProviderKind[] =
      s.activeProvider === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
    for (const kind of order) {
      this.renderProviderConfig(kind, kind === s.activeProvider);
    }

    containerEl.createEl("h3", { text: "Sampling parameters" });

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("0–2, higher is more random; ignored in thinking mode")
      .addText((t) =>
        t.setValue(String(s.temperature)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 2) {
            s.temperature = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Top P")
      .setDesc("0–1, nucleus sampling; ignored in thinking mode")
      .addText((t) =>
        t.setValue(String(s.topP)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 1) {
            s.topP = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Stop sequences")
      .setDesc("Comma-separated; generation stops on any match")
      .addText((t) =>
        t.setValue(s.stop.join(", ")).onChange(async (v) => {
          s.stop = v.split(",").map((x) => x.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Seed")
      .setDesc("Blank = disabled; a number makes output reproducible. Only honored by the OpenAI-compatible dialect")
      .addText((t) =>
        t.setValue(s.seed === null ? "" : String(s.seed)).onChange(async (v) => {
          const trimmed = v.trim();
          if (!trimmed) {
            s.seed = null;
          } else {
            const n = Number(trimmed);
            if (Number.isFinite(n)) s.seed = Math.floor(n);
          }
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Reasoning and output" });

    new Setting(containerEl)
      .setName("Reasoning effort")
      .setDesc("OpenAI reasoning_effort / DeepSeek thinking+effort / Anthropic thinking budget; high = maximum (default). Note: DeepSeek has only high/max tiers; low/medium are equivalent to high")
      .addDropdown((d) =>
        d
          .addOption("minimal", "minimal (off)")
          .addOption("low", "low")
          .addOption("medium", "medium")
          .addOption("high", "high")
          .setValue(s.reasoningEffort)
          .onChange(async (v) => {
            s.reasoningEffort = v as ReasoningEffort;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max tokens")
      .setDesc("Upper bound for output + thinking combined; the Anthropic thinking budget is auto-set to this value − 2048")
      .addText((t) =>
        t.setValue(String(s.maxTokens)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 1024) {
            s.maxTokens = Math.floor(n);
            await this.plugin.saveSettings();
          }
        })
      );

    containerEl.createEl("h3", { text: "Optimization templates" });

    new Setting(containerEl)
      .setName("Current template")
      .setDesc(`Active template: ${getActiveTemplate(s).name} (${sourceLabel(getActiveTemplate(s).source)}). Use the "Switch optimization template" command to switch quickly`);

    for (const tpl of s.templates) {
      this.renderTemplateRow(tpl);
    }

    new Setting(containerEl)
      .setName("Add template")
      .setDesc("Add an optimization template from a local vault file or a network URL")
      .addButton((b) =>
        b.setButtonText("Add").onClick(() => {
          new AddTemplateModal(this.app, this.plugin, () => this.display()).open();
        })
      );

    new Setting(containerEl)
      .setName("Open log")
      .setDesc("View past optimization request records (time / model / elapsed / status)")
      .addButton((b) =>
        b.setButtonText("Open").onClick(async () => {
          await this.openLog();
        })
      );
  }

  private renderTemplateRow(tpl: PromptTemplate): void {
    const s = this.plugin.settings;
    const active = tpl.id === s.activeTemplateId;
    const row = new Setting(this.containerEl)
      .setName(tpl.name + (active ? "  ✓" : ""))
      .setDesc(templateDesc(tpl));

    if (!active) {
      row.addButton((b) =>
        b.setButtonText("Set as current").onClick(async () => {
          setActiveTemplate(s, tpl.id);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    if (tpl.source === "http") {
      row.addButton((b) =>
        b.setButtonText("Refresh").onClick(async () => {
          b.setButtonText("Refreshing…").setDisabled(true);
          try {
            await refreshHttpTemplate(s, tpl.id);
            await this.plugin.saveSettings();
            new Notice("Refreshed", 2000);
          } catch (e) {
            new Notice(describeError(e), 8000);
          } finally {
            this.display();
          }
        })
      );
    }
    if (tpl.source !== "builtin") {
      row.addButton((b) =>
        b.setButtonText("Delete").onClick(async () => {
          removeTemplate(s, tpl.id);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
  }

  private renderProviderConfig(kind: ProviderKind, active: boolean): void {
    const s = this.plugin.settings;
    const cfg = s[kind];
    const label = kind === "openai" ? "OpenAI (compatible)" : "Anthropic";

    const host = active
      ? this.containerEl.createDiv()
      : this.containerEl.createEl("details");
    if (!active) host.createEl("summary", { text: `${label} (click to expand)` });
    host.createEl("h4", { text: `${label}${active ? " · in use" : ""}` });

    // Provider presets (only for the openai-compatible provider): selecting one auto-fills baseUrl/dialect/suggested model
    if (kind === "openai") {
      const presetSetting = new Setting(host).setName("Provider preset");
      presetSetting.addDropdown((d) => {
        d.addOption("custom", "Custom");
        for (const p of PROVIDER_PRESETS) d.addOption(p.label, p.label);
        const hit = PROVIDER_PRESETS.find((p) => p.baseUrl === cfg.baseUrl);
        d.setValue(hit ? hit.label : "custom");
        d.onChange(async (v) => {
          if (v === "custom") return;
          const p = PROVIDER_PRESETS.find((x) => x.label === v);
          if (!p) return;
          cfg.baseUrl = p.baseUrl;
          cfg.dialect = p.dialect;
          if (p.model && !cfg.model) cfg.model = p.model;
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }

    new Setting(host)
      .setName("Base URL")
      .addText((t) =>
        t.setValue(cfg.baseUrl).onChange(async (v) => {
          cfg.baseUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(host)
      .setName("API Key")
      .setDesc("Stored in data.json (synced with the vault); TODO migrate to SecretStorage")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder(kind === "openai" ? "sk-..." : "sk-ant-...");
        t.setValue(cfg.apiKey);
        t.onChange(async (v) => {
          cfg.apiKey = v.trim();
          await this.plugin.saveSettings();
        });
      });

    const modelSetting = new Setting(host).setName("Model");
    let dropdown: DropdownComponent | undefined;
    modelSetting.addDropdown((d) => {
      dropdown = d;
      if (cfg.model) d.addOption(cfg.model, cfg.model);
      d.setValue(cfg.model ?? "");
      d.onChange(async (v) => {
        cfg.model = v;
        await this.plugin.saveSettings();
      });
    });
    // Manual input box: for model IDs that listModels did not return (applies on blur/Enter)
    modelSetting.addText((t) => {
      t.setPlaceholder("Or enter the ID manually");
      t.inputEl.addEventListener("change", async () => {
        const id = t.inputEl.value.trim();
        if (!id) return;
        cfg.model = id;
        if (dropdown) {
          dropdown.addOption(id, id);
          dropdown.setValue(id);
        }
        await this.plugin.saveSettings();
        t.inputEl.value = "";
      });
    });
    modelSetting.addButton((b) =>
      b.setButtonText("Fetch models").onClick(async () => {
        if (!cfg.apiKey) {
          new Notice("Please fill in the API Key first", 6000);
          return;
        }
        b.setButtonText("Fetching…").setDisabled(true);
        try {
          const models = await getProviderFor(s, kind).listModels();
          if (!dropdown) return;
          const cur = cfg.model;
          dropdown.selectEl.innerHTML = "";
          for (const m of models) {
            dropdown.addOption(m.id, m.name ? `${m.name} (${m.id})` : m.id);
          }
          if (cur && models.some((m) => m.id === cur)) {
            dropdown.setValue(cur);
          } else if (models[0]) {
            cfg.model = models[0].id;
            dropdown.setValue(models[0].id);
            await this.plugin.saveSettings();
          }
          new Notice(`Fetched ${models.length} models`);
        } catch (e) {
          new Notice(describeError(e), 8000);
        } finally {
          b.setButtonText("Fetch models").setDisabled(false);
        }
      })
    );

    // Advanced: extra request body / headers (passthrough fallback)
    const adv = host.createEl("details");
    adv.createEl("summary", { text: "Advanced (extra params / headers)" });

    new Setting(adv)
      .setName("Extra body (extraBody JSON)")
      .setDesc('Merged into the request body; protected keys (temperature/thinking, etc.) are ignored. E.g. {"user_id":"u1"}')
      .addTextArea((t) => {
        t.setValue(JSON.stringify(cfg.extraBody, null, 2));
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.inputEl.addEventListener("change", async () => {
          const parsed = parseJsonObject(t.inputEl.value);
          if (!parsed.ok) {
            new Notice(`Invalid extraBody JSON: ${parsed.error}`, 8000);
            return; // do not save; keep the text
          }
          cfg.extraBody = parsed.value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(adv)
      .setName("Extra headers (extraHeaders JSON)")
      .setDesc('Merged into the request headers; protected keys like Authorization are ignored. E.g. OpenRouter: {"HTTP-Referer":"...","X-Title":"..."}')
      .addTextArea((t) => {
        t.setValue(JSON.stringify(cfg.extraHeaders, null, 2));
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.inputEl.addEventListener("change", async () => {
          const parsed = parseJsonObject(t.inputEl.value);
          if (!parsed.ok) {
            new Notice(`Invalid extraHeaders JSON: ${parsed.error}`, 8000);
            return;
          }
          // Header values are always coerced to strings
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed.value)) headers[k] = String(v);
          cfg.extraHeaders = headers;
          await this.plugin.saveSettings();
        });
      });
  }

  private async openLog(): Promise<void> {
    const path = this.plugin.logger.logPath();
    const adapter = this.app.vault.adapter;
    let content = "(no log records yet)";
    try {
      if (await adapter.exists(path)) {
        content = await adapter.read(path);
      }
    } catch (e) {
      content = `Failed to read log: ${describeError(e)}`;
    }
    new LogModal(this.app, content).open();
  }
}

class LogModal extends Modal {
  constructor(app: App, private content: string) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("opo-log-modal");
    contentEl.createEl("h2", { text: "Optimization log" });
    const pre = contentEl.createEl("pre");
    pre.setText(this.content);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function sourceLabel(source: TemplateSource): string {
  return source === "builtin" ? "Built-in" : source === "local" ? "Local" : "URL";
}

function templateDesc(tpl: PromptTemplate): string {
  const tag = sourceLabel(tpl.source);
  if (tpl.source === "http") {
    const when = tpl.fetchedAt ? `, updated ${new Date(tpl.fetchedAt).toLocaleString()}` : ", not fetched";
    return `${tag}: ${tpl.url}${when}`;
  }
  if (tpl.source === "local") return `${tag}: ${tpl.path}`;
  return tag;
}

/** Add a template: pick a source -> choose a local file / fill a URL. */
class AddTemplateModal extends Modal {
  constructor(app: App, private plugin: ObsidianPromptOptimizer, private onDone: () => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("opo-template-modal");
    contentEl.createEl("h2", { text: "Add optimization template" });
    new Setting(contentEl)
      .setName("Select source")
      .addButton((b) =>
        b.setButtonText("Local vault file").onClick(() => {
          this.close();
          new LocalFilePickerModal(this.app, this.plugin, this.onDone).open();
        })
      )
      .addButton((b) =>
        b.setButtonText("Network URL").onClick(() => {
          this.close();
          new HttpTemplateModal(this.app, this.plugin, this.onDone).open();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Local file picker: lists .md files in the vault. */
class LocalFilePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private plugin: ObsidianPromptOptimizer, private onDone: () => void) {
    super(app);
    this.setPlaceholder("Select a .md file as the template");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  async onChooseItem(file: TFile): Promise<void> {
    try {
      await addLocalTemplate(this.app, this.plugin.settings, file.path);
      await this.plugin.saveSettings();
      new Notice(`Added: ${file.path}`, 2000);
    } catch (e) {
      new Notice(describeError(e), 8000);
    } finally {
      this.onDone();
    }
  }
}

/** Network URL input: fill URL + optional name -> validate by fetching, then add. */
class HttpTemplateModal extends Modal {
  private url = "";
  private name = "";

  constructor(app: App, private plugin: ObsidianPromptOptimizer, private onDone: () => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("opo-template-modal");
    contentEl.createEl("h2", { text: "Add URL template" });
    new Setting(contentEl)
      .setName("URL")
      .setDesc("Direct link to a .md document (e.g. raw.githubusercontent.com)")
      .addText((t) => {
        t.setPlaceholder("https://...");
        t.onChange((v) => (this.url = v));
      });
    new Setting(contentEl)
      .setName("Name (optional)")
      .addText((t) => {
        t.setPlaceholder("Leave blank to use the URL");
        t.onChange((v) => (this.name = v));
      });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Add (fetch & validate)").setCta().onClick(async () => {
        if (!this.url.trim()) {
          new Notice("Please fill in the URL", 4000);
          return;
        }
        b.setButtonText("Fetching…").setDisabled(true);
        try {
          await addHttpTemplate(this.plugin.settings, this.url.trim(), this.name);
          await this.plugin.saveSettings();
          new Notice("Added", 2000);
          this.close();
        } catch (e) {
          new Notice(describeError(e), 8000);
          b.setButtonText("Add (fetch & validate)").setDisabled(false);
        }
      })
    );
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDone();
  }
}
