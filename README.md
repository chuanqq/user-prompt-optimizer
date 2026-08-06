# User Prompt Optimizer

[切换中文](README.zh-CN.md)

> Select a prompt and refine it with an LLM, streaming the result back into the selection. Built for prompt engineering — not a general writing assistant.

## Features

- **Streaming optimization**: select a prompt -> command / context menu -> write it back into the selection char by char; undo with `Ctrl+Z` / `Cmd+Z`
- **Two optimization modes**:
  - **Template optimization**: structurally optimize the prompt against the active template. Ships with a built-in "General optimization (5phase-lite)" template; you can add `.md` files in your vault or HTTP links as optimization standards and switch on the fly while writing
  - **Lite optimization**: applies no template structure — only disambiguates, dedupes, and sharpens wording; missing key info is marked in place with a `[TODO: ...]` placeholder for manual completion
- **Two providers**: OpenAI-compatible and Anthropic; supports DeepSeek and other compatible service dialects; one-click model list fetch
- **Reasoning & sampling control**: reasoning effort (OpenAI `reasoning_effort` / Anthropic `thinking` budget), temperature / top_p / stop / seed, `extraBody` / `extraHeaders` passthrough, request timeout
- **Visible status**: in-editor selection highlight + an "Optimizing…" banner above the selection (with a stop button), a persistent Notice in the top-right, a pulsing ribbon icon, and live status-bar feedback (Optimizing… -> Generating… -> Optimized). Click the banner / Notice / ribbon to interrupt
- **Detail preservation**: optimization forcefully preserves URLs, request/response examples, JSON structures, code snippets and other technical details — never summarized or omitted
- **Request log**: double-writes to the console and to `optimizer.log` in the plugin directory; one-click viewer on the settings page

## Privacy & external services

This plugin sends network requests to **third-party LLM providers you configure** (e.g. OpenAI, Anthropic, DeepSeek, OpenRouter, or any OpenAI-compatible endpoint). Be aware:

- **What is sent**: the prompt text you select, plus the active optimization template and the built-in engine prompt. Nothing else from your vault is transmitted — the plugin only reads the current editor selection.
- **Where it goes**: only the provider Base URL / API key you enter in settings. The plugin makes no other network calls (no telemetry, no analytics, no update checks beyond Obsidian's own plugin update mechanism).
- **Credentials**: your API key is stored in `data.json` inside the plugin folder (synced with your vault). It will be migrated to Obsidian SecretStorage (per-device, non-synced) in a future version.
- **Opt-in by configuration**: the plugin never contacts any provider until you fill in the Base URL / API key / model and run an optimize command. Removing the credentials stops all network activity.
- **HTTP templates**: if you add an `http`-source template, the plugin fetches that URL when you select/refresh it. The URL and its content are under your control.
- **Vault file listing**: when you add a `local`-source template, the plugin lists your vault's `.md` file paths in a picker so you can choose one. Only the path you pick is read (to load that template); no other file content is accessed, transmitted, or stored outside your vault.

No analytics, telemetry, or vault content collection is performed.

## Installation

> Requires Node.js (recommend >= 18) and npm.

### Build from source

1. Clone the repo

   ```bash
   git clone https://github.com/chuanqq/user-prompt-optimizer.git
   cd user-prompt-optimizer
   ```

2. Install dependencies and build (run inside `plugin/`)

   ```bash
   cd plugin
   npm install
   npm run build      # production build, produces plugin/main.js
   # for development, use npm run dev to enter watch mode
   ```

3. Copy the build artifacts into the target vault's plugin directory

   ```
   <vault>/.obsidian/plugins/user-prompt-optimizer/
   ```

   Files needed: `main.js`, `manifest.json`, `styles.css`

4. In Obsidian: Settings -> Community plugins -> enable "Community plugins" -> enable "User Prompt Optimizer"

## Usage

1. Open the "User Prompt Optimizer" settings page and fill in the provider's Base URL / API Key / Model (you can click "Fetch models" to pull the list); adjust reasoning effort, sampling parameters, max tokens, and the request timeout as needed
2. Select a prompt in a note
3. Run "Optimize prompt" (structured optimization against the active template) or "Optimize prompt (lite, no template)" (disambiguate / dedupe / sharpen + mark missing info) from the command palette, or use the context menu
4. The optimized result streams back into the selection; undo with `Ctrl+Z` / `Cmd+Z`

Command list:

| Command | ID | Description |
|---------|----|-------------|
| Optimize prompt | `optimize-prompt` | Stream a structured optimization of the selection against the active template |
| Optimize prompt (lite, no template) | `optimize-prompt-lite` | No template; only disambiguate / dedupe / sharpen wording; mark missing info with `[TODO: ...]` |
| Switch optimization template | `switch-template` | Open a picker to switch the active optimization template |

## Template management

What the "Optimize prompt" command optimizes against is decided by a "template". Templates come from three sources:

- **builtin**: the built-in "General optimization (5phase-lite)"; cannot be deleted
- **local**: a `.md` file in the vault; read fresh on every optimization (no cache; the file is the source of truth)
- **http**: a remote `.md` link; the full text is fetched and cached; refresh manually

The settings page can list all templates, activate, refresh (http), delete, and add them. The "Switch optimization template" command lets you switch the active template quickly while writing. The "Optimize prompt (lite)" command does not read any template.

The full text of the built-in template is at [`src/engine/default-template.md`](src/engine/default-template.md).

## Log

The developer console (`Ctrl+Shift+I` / `Cmd+Option+I`) or the "Open log" button on the settings page shows the time, model, template, input/output char counts, elapsed time, and status of each request.

## License

MIT — see [LICENSE](LICENSE).
