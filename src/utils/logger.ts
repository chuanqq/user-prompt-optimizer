import type { App } from "obsidian";

export interface LogEntry {
  time: string;
  provider: string;
  model: string;
  template: string;
  inputChars: number;
  outputChars: number;
  elapsedMs: number;
  ok: boolean;
  error?: string;
}

/**
 * Request log: double-writes to the console and to optimizer.log in the plugin directory (append).
 * File path: .obsidian/plugins/<pluginId>/optimizer.log inside the vault.
 */
export class Logger {
  constructor(private app: App, private pluginId: string) {}

  async log(entry: LogEntry): Promise<void> {
    const line = this.format(entry);
    // Intentional double-write: the console mirror lets users inspect recent optimizations via dev tools
    // without opening the on-disk log file. Kept on purpose; not a stray debug log.
    console.log("[ObsidianPromptOptimizer]", line);
    try {
      const path = this.logPath();
      const adapter = this.app.vault.adapter;
      const prev = (await adapter.exists(path)) ? await adapter.read(path) : "";
      await adapter.write(path, prev + line + "\n");
    } catch (e) {
      console.warn("[ObsidianPromptOptimizer] Failed to write log", e);
    }
  }

  logPath(): string {
    return `${this.pluginDir()}/optimizer.log`;
  }

  pluginDir(): string {
    return `${this.app.vault.configDir}/plugins/${this.pluginId}`;
  }

  private format(e: LogEntry): string {
    const status = e.ok ? "OK" : `FAIL ${e.error ?? ""}`.trim();
    return `${e.time} | ${e.provider}/${e.model} | ${e.template} | in=${e.inputChars} out=${e.outputChars} ${e.elapsedMs}ms | ${status}`;
  }
}
