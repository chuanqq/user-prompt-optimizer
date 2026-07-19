# ObsidianPromptOptimizer

[English](README.md)

> 选中一段 prompt 提示词，用 LLM 对这段 prompt 本身进行优化/细化，流式写回选区。面向 prompt engineering 场景，非通用文本写作助手。

## 特性

- **流式优化**：选中 prompt → 命令/右键 → 逐字写回选区，`Ctrl+Z` 可撤销
- **双模式优化**：
  - **模板优化**：按激活模板对 prompt 做结构化优化，内置「通用优化（5phase-lite）」模板；可添加 vault 内 `.md` 文档或 HTTP 链接作为优化标准，写作时一键切换
  - **轻量优化**：不套用任何模板结构，只做歧义消除、去重与表述精细化；缺失的关键信息原位插入 `[待补充：…]` 留白占位符，便于手动补全
- **双 Provider**：OpenAI（兼容）与 Anthropic；支持 DeepSeek 等兼容服务的方言（dialect）；一键获取模型列表
- **推理与采样控制**：reasoning effort（OpenAI `reasoning_effort` / Anthropic `thinking` budget）、temperature / top_p / stop / seed、`extraBody` / `extraHeaders` 透传、请求超时
- **状态可见**：编辑器内选区高亮 + 选区上方「正在优化…」横幅（带停止按钮）、右上角常驻 Notice、ribbon 脉冲动画 + 状态栏实时反馈（正在优化… → 生成中… → 已优化），优化中点横幅/Notice/ribbon 均可中断
- **细节保留**：优化时强制保留 URL、请求/响应示例、JSON 结构、代码片段等技术细节，不概括省略
- **请求日志**：双写 console + 插件目录 `optimizer.log`，设置页一键查看

## 隐私与外部服务

本插件会向你**配置的第三方 LLM 服务商**（如 OpenAI、Anthropic、DeepSeek、OpenRouter 或任意 OpenAI 兼容端点）发起网络请求。请注意：

- **发送什么**：你选中的 prompt 文本，加上当前激活的优化模板与内置引擎 prompt。不会发送 vault 中的其他任何内容——插件只读取当前编辑器选区。
- **发往哪里**：仅发往你在设置里填写的 provider Base URL / API Key。插件不发起其他任何网络请求（无遥测、无分析、无更新检查，插件更新走 Obsidian 自身机制）。
- **凭据存储**：API Key 存于插件目录下的 `data.json`（随 vault 同步）。后续将迁移到 Obsidian SecretStorage（per-device、不同步）。
- **按需启用**：在你填写 Base URL / API Key / 模型并执行优化命令前，插件不会联系任何服务商；清除凭据即可停止全部网络活动。
- **HTTP 模板**：若添加 `http` 来源的模板，插件会在选中/刷新该模板时抓取该 URL。URL 与内容均由你掌控。

不进行任何分析、遥测或 vault 内容收集。

## 安装

> 需要 Node.js（建议 ≥ 18）与 npm。

### 从源码构建

1. 克隆仓库

   ```bash
   git clone https://github.com/chuanqq/user-prompt-optimizer.git
   cd user-prompt-optimizer
   ```

2. 安装依赖并构建（在 `plugin/` 目录内执行）

   ```bash
   cd plugin
   npm install
   npm run build      # 生产构建，产出 plugin/main.js
   # 开发可用 npm run dev 进入 watch 模式
   ```

3. 将构建产物拷贝到目标 vault 的插件目录

   ```
   <vault>/.obsidian/plugins/user-prompt-optimizer/
   ```

   需要的文件：`main.js`、`manifest.json`、`styles.css`

4. 在 Obsidian 中：设置 → 第三方插件 → 开启「社区插件」→ 启用「ObsidianPromptOptimizer」

## 使用

1. 打开设置页「ObsidianPromptOptimizer」，填入 provider 的 Base URL / API Key / Model（可点「获取模型」拉取），按需调整推理强度、采样参数与最大 token 数
2. 在笔记中选中一段 prompt
3. 命令面板执行「优化 prompt」（按激活模板结构化优化）或「轻量优化 prompt（不套模板）」（只做消歧/去重/精细化与留白标注），也可用右键菜单
4. 优化结果流式写回选区；`Ctrl+Z` 可撤销

命令一览：

| 命令 | ID | 说明 |
|------|----|------|
| 优化 prompt | `optimize-prompt` | 按当前激活模板对选区做流式结构化优化 |
| 轻量优化 prompt（不套模板） | `optimize-prompt-lite` | 不套模板，只做消歧/去重/表述精细化，缺失信息以 `[待补充：…]` 留白 |
| 切换优化模板 | `switch-template` | 弹出选择器切换当前激活的优化模板 |

## 模板管理

「优化 prompt」命令的优化依据由「模板」决定，模板有三种来源：

- **builtin**：内置「通用优化模板」，不可删除
- **local**：vault 内的 `.md` 文件，每次优化时直读全文（不缓存，文件即真相）
- **http**：远程 `.md` 链接，抓取后缓存全文，可手动刷新

在设置页可列出全部模板、激活、刷新（http）、删除、添加。命令「切换优化模板」可在写作时快速切换激活模板。「轻量优化 prompt」命令不读取任何模板。

内置模板全文见 [`src/engine/default-template.md`](src/engine/default-template.md)。

## 日志

开发者控制台（`Ctrl+Shift+I`）或设置页「打开日志」按钮，查看历次请求的时间、模型、模板、输入输出字数、耗时与状态。

## License

MIT，见 [LICENSE](LICENSE)。
