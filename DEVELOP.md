# DEVELOP

## 2026-07-08 ModelScope MCP Install / v0.4.1

- `src/js/plugin_store.js` 调整 `deployModelScopeMcp()`：安装 hosted MCP 时先请求 `GET /api/v1/mcpServers/{Path}/{Name}/listByStatus` 取平台 `DeploymentJobId`，再按魔搭详情页“连接”按钮流程提交 `POST /api/v1/mcpServers/{Path}/{Name}/asyncDeploy`，请求体保留 `EnvironmentVariables`、`ExpirationMinutes`、`TransportType`、`AuthCheck`、`InfraSource: "platform"` 和 `DeploymentJobId`。
- `src/js/plugin_store.js` 新增部署状态轮询：提交连接后使用 `POST /api/v1/mcpServers/deployStatus` 等待 `published` 并读取 `Data.McpDeployInfo.Url`，避免只导入已在网页端提前连接过的 MCP。
- `package.json` 版本按当前打包要求保持 `0.4.1`；`sw.js` 缓存版本升级到 `fritia-next-chat-v22`。

## 2026-07-08 Tool Panel / Official Site / v0.4.2

- `src/styles/app.css` 调整 MCP 客户端页布局：client 视图使用剩余高度作为工作台区域，编辑区内部给 JSON 配置框分配 `minmax(0, 1fr)` 滚动空间，避免窗口高度不足时 `#mcp-client-json` 被 `.tool-client-workbench` 裁切。
- `src/js/ui.js` 新增 `openExternalUrl()`，主菜单“访问官网”在 Tauri/WebView2 打包端优先调用壳层 `open_external_url`，失败或网页端回退到 `window.open()`。
- 该项功能已并入当前 `0.4.1` 补丁线；历史缓存版本为 `fritia-next-chat-v21`。

## 2026-07-08 MCP Agent Output / v0.4.1

- `src/js/tool_chat_engine.js` 调整工具模式流式输出：中间轮模型文本只进入 agent 内部 messages 和 `toolTrace`，运行中的 assistant 气泡保持 trace + typing 状态，直到无后续 tool calls 且判定为最终回复时才写入聊天正文。
- `src/js/tool_chat_engine.js` 调整 MCP 文件聚合：按最后一个产生附件的 MCP 步骤作为最终输出文件写入 `message.attachments`；更早步骤的文件写入 `message.meta.toolOtherAttachments`，避免中间产物挤占最终回复。
- `index.html` 新增 `#tool-other-files-panel`；`src/js/ui.js` 新增“其他文件”按钮和悬浮窗口渲染，复用现有附件节点创建、图片加载、本地文件读取和保存逻辑。
- `src/styles/app.css` 新增 `.tool-other-files-*` 样式，按钮保持窄、低对比，悬浮窗口适配桌面和移动端现有 modal 布局。
- `package.json` 版本更新为 `0.4.1`；`sw.js` 缓存版本升级到 `fritia-next-chat-v20`。
- `src/js/ui.js` 的插件商店错误态增加纯前端运行时文案分支：无壳静态页面无法直接安装魔搭插件时提示使用 APP 或手动配置；Tauri/WebView 打包端仍显示原有读取失败文案。

## 2026-07-07 Plugin Store / ModelScope MCP

- `index.html` 新增主菜单浮层 `#main-menu`，菜单项为“插件商店”和“访问官网”；“访问官网”使用浏览器新窗口打开 `https://fritia.online`。
- `index.html` 新增 `#plugin-store-panel`、`#plugin-detail-panel`、`#plugin-source-login-panel` 和 `#plugin-official-browser-panel`：插件商店包含“角色插件”和“MCP 插件”两个分组，角色插件暂留空，MCP 插件页提供搜索、来源下拉、刷新、卡片网格和分页；详情窗口提供介绍、固定 `remote` 类型和继承魔搭参数 schema 的服务配置项；登录窗口增加“在本页面中完成登录”提示和“检验登录状态”按钮；官方详情在网页/PWA 运行时使用悬浮浏览器面板。
- 新增 `src/js/plugin_store.js`：封装魔搭社区 hosted MCP 列表接口、详情接口、部署/连接接口、登录态检测、MCP 数据归一化、参数 schema 归一化和标准 `mcpServers` JSON 生成。MCP 列表按魔搭当前前端实现使用 `PUT /api/v1/dolphin/mcpServers`；部署/连接优先使用 `POST /api/v1/mcpServers/deploy`。详情配置按魔搭前端逻辑选择可用 schema：双传输类型优先取 `EnvSchema`，单传输类型取对应传输 schema，并在空 schema 时回退到第一个非空 schema；服务配置还会补齐传输类型、鉴权类型和有效期这三个部署控制项。Tauri 桌面端会优先调用壳层 `modelscope_fetch`，在魔搭登录 WebView2 的同源上下文中带 `X-Requested-With` 和 `x-modelscope-accept-language` 请求接口；纯静态浏览器运行时若遇到 CORS、登录态或 WAF 限制，会抛出可展示错误。
- `src/js/ui.js` 新增 `mainMenuOpen`、`pluginStoreSection`、`pluginSourceMenuOpen` 和 `pluginStore` 状态，新增主菜单绑定、插件商店分组切换、魔搭登录检测、列表刷新、详情加载、官方详情窗口、服务配置读取和“一键添加到 Streamable HTTP MCP 客户端”流程。服务配置读取会把 schema 字段写入 `EnvironmentVariables`，把传输类型、鉴权类型和有效期写入部署请求 options。Tauri 桌面端点击“魔搭社区”会优先调用 `open_modelscope_window` 打开同一应用内 WebView2 插件源窗口，并在主应用内短时轮询登录态；“官方详情”优先调用 `open_modelscope_detail_window` 打开同一应用内 WebView2 详情窗口。后续由壳层复用魔搭窗口的浏览器/WAF 上下文请求 MCP 接口。
- “添加到 MCP 服务”会调用魔搭部署接口获取远程 URL，复制标准 `mcpServers` JSON，并通过 `parseMcpServerConfigJson()` / `upsertMcpClient()` 新建启用状态的 Streamable HTTP MCP 客户端，服务器名称使用 MCP 工具展示名。
- `src/styles/app.css` 新增主菜单和插件商店 Soft UI 样式：桌面端左侧分组 + 三列卡片网格，中等宽度两列卡片，移动端顶部分类 + 两列紧凑卡片；MCP 卡片标题与图标同排，简介固定两行；插件商店、详情、登录、官方详情按固定 z-index 分层，确保后打开的业务窗口位于上层；所有按钮继续使用 `src/_logo/icons` 下的 Lucide 风格图标。
- `sw.js` 缓存版本升级到 `fritia-next-chat-v19`，核心缓存加入 `plugin_store.js` 和插件商店新增图标；`package.json` 的 `check` 脚本加入 `src/js/plugin_store.js`。

## 2026-07-06 Tool Calling / WebMCP / MCP Relay

- 新增 `src/js/mcp_tools.js`：集中管理 `localStorage.fritia_mcp_tool_config`、MCP 客户端配置、权限、系统日志、Streamable HTTP MCP 初始化/`tools/list`/`tools/call`、Stdio Relay 调用，以及 WebMCP 服务端 `window.FritiaWebMCP`。
- 新增 `src/js/tool_chat_engine.js`：工具模式私聊独立流程。该流程不复用 `completePrivateMessageReply()`，而是自行构建角色 prompt、RAG、长期记忆和历史上下文，调用支持 tool calls 的 OpenAI-compatible `chat/completions` 流式接口，并把工具调用状态写入 `message.meta.toolTrace`。
- `tool_chat_engine.js` 把工具模式最终回复写入长期记忆，但通过 `skipGraphEdges` / `excludeFromGraph` 避免创建知识图谱节点；`toolTrace` 中的“思考中”和“MCP 调用”详情只保存到聊天历史，不进入长期记忆或后续 LLM 上下文，工具模式消息附件也不会进入后续 LLM 上下文。
- `tool_chat_engine.js` 工具模式为多步 agent loop：每轮模型响应仍携带完整 MCP tools，工具结果回填后继续请求模型判断下一步；只有无工具调用且不是“继续处理/要我继续/下一步操作”等中间话术时才结束。循环上限为 50 步；达到上限、用户点击停止或异常中断时会把压缩后的 agent messages 写入 `toolTrace.resumeState`，用户发送“继续”可续跑。
- 新增 `backend/mcp_relay.mjs`：无框架 Node.js stdio MCP Relay，默认监听 `127.0.0.1:17373`，接收前端 JSON-RPC 请求后启动/复用本地 stdio MCP Server。该目录会随 `tools/build_static.mjs` 复制到 `dist/backend`，供 Tauri/Electron/Capacitor/WebView 打包流程复用。
- `index.html` 新增 `#tool-call-panel` 工具调用悬浮窗口、`#mcp-picker-popover` 聊天头工具选择下拉，以及左侧 `data-panel-open="tool-call-panel"` 入口。聊天头原视频按钮改为 `#external-tools-toggle-btn`。
- `src/js/ui.js` 新增工具配置窗口绑定、MCP 客户端列表/JSON 编辑器/权限/日志渲染、聊天头多选下拉、工具开关状态同步和工具模式发送分流；纯网页运行时隐藏 Stdio MCP 配置页签，MCP 客户端启用开关切换后立即保存，权限页全部使用自绘开关且每行一个选项。v0.3.5 起权限页 DOM 按“功能 / 权限 / 对话”分组。
- `src/js/ui.js` 新增工具配置窗口绑定、MCP 客户端列表/JSON 编辑器/权限/日志渲染、聊天头多选下拉、工具开关状态同步和工具模式发送分流；纯网页运行时隐藏 Stdio MCP 配置页签，MCP 客户端启用开关切换后立即保存，权限页全部使用自绘开关且每行一个选项。v0.3.5 起权限页 DOM 按“功能 / 权限 / 对话”分组；工具窗口新增“使用说明”页，读取 `src/docs/mcp_help.md` 并用轻量 Markdown 渲染器展示标题、列表、代码、表格和远程图片。
- `src/styles/app.css` 新增工具配置窗口桌面/移动两套布局、MCP 多选下拉、工具调用状态栏和自绘滚动条样式，继续使用本项目蓝紫 Soft UI 设计变量。v0.3.5 起移动端 MCP 客户端页、transport 页签和配置 JSON 区域补齐自绘滚动条，配置 JSON 输入/预览不再自动换行；权限设置分组内项目使用高级设置式行列表，不再逐项包裹卡片；MCP 客户端服务列表在桌面工作台内拥有独立纵向滚动条，竖屏下至少保留 3 个服务项高度，激活态语音/外部工具按钮 hover 时保持蓝紫可见状态。
- `sw.js` 缓存版本升级到 `fritia-next-chat-v18`，核心缓存清单加入 `mcp_tools.js`、`tool_chat_engine.js`、`src/docs/mcp_help.md`、工具入口 `ai-agent.svg`、存档入口 `refresh-cw.svg`、角色卡入口 `role-card.svg`、保存按钮 `save-config.svg`、使用说明入口 `tool-help.svg`、`wrench.svg`、停止按钮 `x.svg` 和工具窗口下载图标 `tool-server.svg`、`tool-skills.svg`、`tool-streamable-http.svg`、`tool-stdio.svg`。
- `package.json` 的 `check` 脚本加入新增模块和 `backend/mcp_relay.mjs`；`tools/static_server.mjs` 增加 `.mjs` MIME；`tools/build_static.mjs` 复制 `backend/`。
- 网络沙箱阻止从 Lucide GitHub 下载 `wrench.svg`，因此本次先按项目现有 Lucide SVG 风格写入同名本地图标，后续可用官方下载资源覆盖。
- `parseMcpServerConfigJson()` 以标准 `mcpServers` 配置为主，按 `url`、`command`、`transport`、`type` 解析 Streamable HTTP、legacy SSE 或 stdio；UI 不再把标准 JSON 改写成扁平内部模板。Streamable HTTP 新建、删除兜底和空白保存时 `#mcp-client-json` 保持空白，空白或错误 JSON 会在运行时报错，不再自动套默认 URL 模板。
- Streamable HTTP MCP 在桌面打包端优先使用 `window.__FRITIA_MCP_HTTP_RELAY__`，原生 relay 按 JSON-RPC `id` 读取 `application/json` 或 `text/event-stream` 响应，并兼容 `sessionId` / `session_id` 两种返回字段，避免 initialize 后 `tools/list` 丢失 `Mcp-Session-Id`。远程 URL 运行时会对 `localhost` / `127.0.0.1` 做 loopback fallback，以适配带 Host 检查的本地 MCP 服务。
- `backend/mcp_relay.mjs` 和 Windows Tauri stdio relay 均会在首次非 initialize 请求前自动完成 MCP `initialize` / `notifications/initialized` 握手；Windows 下对 `.cmd` / `.bat` / 无扩展命令使用通用 `cmd.exe /d /s /c` 包装，兼容 `npx @playwright/mcp@latest` 这类 stdio MCP 配置。
- `src/js/mcp_tools.js` 新增 legacy SSE transport 流程：GET 打开 SSE 事件流、读取 endpoint 事件、POST JSON-RPC 消息，并从 SSE message 事件按 JSON-RPC `id` 匹配响应。
- `src/js/mcp_tools.js` 的工具列表读取、Streamable HTTP、legacy SSE 和开发用 stdio relay fetch 路径支持可选 `AbortSignal`；工具模式停止按钮触发后会中止正在进行的 HTTP/SSE/fetch 请求，并在 native relay 返回后阻断后续 MCP 步骤。
- `src/js/mcp_tools.js` 预置隐藏的 `Filesystem` stdio MCP 客户端：打包运行时默认启用，纯网页运行时始终禁用；它不会进入聊天头 MCP 多选下拉，但当会话选择了至少一个可见 MCP 客户端时，会通过 `withImplicitFilesystemClientIds()` 隐式加入工具列表收集。
- 工具模式 prompt 保持通用 MCP 流程：根据工具名称、描述和参数 schema 判断是否调用工具，不写死任何具体 MCP Server 或工具名。
- 工具模式 prompt 明确要求：任务未完成时继续发起 tool calls，不得在自然语言中间承诺后停止，也不得让用户重复确认本可继续用工具完成的步骤。
- `src/js/ui.js` 的 `createToolTraceNode()` 将连续 `toolTrace.calls` 合并为单个“MCP 调用”折叠框，折叠时显示最新工具名，展开后再逐条查看参数、结果和附件摘要。
- `src/js/ui.js` 在工具流程运行时记录 `activeToolRun`，当前 typing 工具回复下方显示圆形停止按钮；工具尚未生成内容时停止按钮与 typing 提示同排，已有内容后停止按钮移动到内容下方。点击后触发 `AbortController.abort()`，隐藏按钮并等待工具引擎把 trace 标记为可续跑中断。
- `src/js/ui.js` 的 MCP 多选下拉顶部新增“小字标题：可调用 MCP 列表”；聊天头私聊角色卡按钮改用 `role-card.svg`，与工具调用 `ai-agent.svg` 区分。
- 工具模式最终消息可携带任意附件：`tool_chat_engine.js` 从模型 content parts、MCP result content、`resource_link`、`structuredContent`、Relay `changedFiles`、结果文本和工具参数中的远程文件 URL / 本地文件引用抽取 image/audio/video/resource/file；图片直接渲染，音频复用语音条，视频使用原生 video 控件，其他附件通过 `saveAttachmentToUserDevice()` 保存到用户选择的位置。`.log`、常见临时文件和没有可保存数据的空占位会在 `normalizeGeneratedAttachments()` 阶段过滤。
- `backend/mcp_relay.mjs` 在 stdio `tools/call` 前后对配置 `cwd` 做有限文件快照，并额外读取请求参数中明确出现的文件路径/文件名；返回 `{ response, changedFiles }`，前端通过 `getNativeRelayResponse()` 保留 MCP JSON-RPC 结果并把文件变更映射为聊天附件。
- `src/js/mcp_tools.js` 将 `MCP_LOG_EVENT` 从 `MCP_CONFIG_EVENT` 中拆出，MCP 调用日志写入只刷新日志面板，不再触发工具配置、会话 chrome 和 WebMCP manifest 的整套刷新。
- `src/js/ui.js` 为工具回复新增 `updateStoreFromToolReply()`：工具运行中只更新消息列表和移动端返回状态，最终 sent/error 时再刷新会话列表、MCP 选择器和聊天头，避免每次 MCP 调用导致主页面头像和人物图标重载。
- 工具附件渲染新增本地文件桥和远程 URL 兼容：`storage.normalizeAttachment()` 保留工具附件的 `url` / `path`，打包端可通过 `window.__FRITIA_NATIVE_FILE__.readFile()` 读取本地路径；远程 URL 直接用于预览，保存时才尝试 fetch 成真实数据，失败时保留直接下载链接。
- `assertMcpPermission()` 改为以全局权限设置驱动实际授权流程；客户端级 `off` 仍禁止调用，但客户端默认 `ask` 不再覆盖“默认调用级别：允许已启用 MCP + 关闭手动授权”。
- `assertMcpFileWritePermission()` 会在 `permissions.requireFileWriteApproval` 开启时，对通用 MCP 工具名和参数键做文件写入/删除/移动/复制意图检测，并把同一次调用涉及的目标路径合并成一次授权提示。
- `src/js/chat_engine.js` 和 `src/js/roundtable.js` 在普通私聊/群聊 LLM 上下文构建前读取 `permissions.isolateToolContext`；开启后过滤 `message.meta.toolMode === true` 的历史。工具模式自身的 `buildToolMessages()` 不做该过滤。
- Windows v0.3.6 Tauri 壳层启用 `devtools` feature，注入脚本监听 `F12` 调用 `open_devtools`；stdio MCP 子进程 stderr 会被采集为最近日志摘要，并在启动、初始化或读写失败时附加到错误中。打包壳层提供通用 `read_local_file` 命令和 stdio `tools/call` 文件快照，把本地 MCP 工具创建/修改的输出文件作为附件回传网页层。

## 2026-07-05 Runtime Environment Detection And WebDAV CORS Check

- 新增 `src/js/runtime_env.js`，导出 `initRuntimeEnvironment()`、`getRuntimeEnvironment()`、`getRuntimeEnvironmentType()`、`isBrowserFrontendRuntime()` 和 `RUNTIME_ENV_TYPES`。
- `src/js/main.js` 在 `boot()` 最前面调用 `initRuntimeEnvironment()`，把运行环境检测结果缓存为通用接口，并写入 `document.documentElement.dataset.runtimeEnv`。
- 运行环境类型覆盖 `web`、`localhost`、`file`、`tauri`、`electron`、`webview` 和 `unknown`；普通网页/localhost/file 归为纯前端环境，Tauri/Electron/WebView 归为打包环境。
- `src/js/archive_sync.js` 新增 `ensureWebDavCorsSupport()`：仅在纯前端环境下对当前 WebDAV 配置执行浏览器 CORS 探测，打包环境直接跳过。
- 用户尝试启用 WebDAV 同步，以及点击“连接测试”时都会先调用 CORS 探测；若浏览器 fetch 因 CORS 阻断失败，进度文本显示固定错误：“错误：该 WebDAV 服务商不支持浏览器同步，请更换服务商或下载客户端。”
- WebDAV `webDavFetch()` 对 `OPTIONS / PUT / MKCOL / DELETE` 增加空响应兼容：如果浏览器抛出 `Response with null body status cannot have body`，会合成为 `204 No Content` 成功响应，避免实际同步成功后被错误文案覆盖。
- WebDAV 上传或云端恢复完成后的进度文案统一为 `同步成功，时间：YYYY/MM/DD HH:MM`。
- `package.json` 的 `check` 脚本加入 `src/js/runtime_env.js`；`sw.js` 缓存版本升级到 `fritia-next-chat-v6` 并加入 `runtime_env.js`。

## 2026-07-05 Archive Backup And WebDAV Sync

- 左侧主导航原 `data-panel-open="character-import-panel"` 的“导入角色”按钮改为 `data-panel-open="archive-panel"` 存档备份入口；v0.3.5 起图标改为联网下载的 Lucide `refresh-cw.svg`，并与工具调用入口互换位置。导入角色入口仍保留在搜索框 `+` 添加菜单和角色卡快捷操作中。
- 新增 `src/js/archive_sync.js`，集中实现 ZIP 导出/导入、IndexedDB 全量导出/恢复、WebDAV 配置保存、文件级增量同步、同步状态事件和冲突事件。
- ZIP 备份使用标准 ZIP 容器的 stored 条目，不引入额外 npm 依赖；内容包含 `localStorage` 中的聊天/设置/知识库状态/长期记忆/表情包等键，以及 `fritia_media_store` 和 `fritia_knowledge_base_db` 的记录。
- WebDAV 同步不上传 ZIP 包，而是按 `localStorage/<key>.json`、`indexeddb/<db>/<store>.json` 和 `manifest.json` 拆分为具体 JSON 文件；每个文件使用内容 hash 判断是否需要上传，冲突判断基于上次本地/远端 manifest hash。
- 当本地和云端自上次同步后都发生变化，`fritia-archive-conflict` 会触发顶层冲突窗口，用户选择“上传本地版本”或“恢复云端版本”后再继续同步。
- 新增 `#archive-panel`、`#archive-config-popover` 和 `#archive-conflict-overlay`。桌面端为左侧状态栏 + 右侧滚动内容，移动端为单列全屏窗口；配置编辑使用小悬浮窗口，测试/同步共用进度条。
- `sw.js` 缓存版本升级到 `fritia-next-chat-v5`，核心缓存清单加入 `src/js/archive_sync.js`；`npm run check` 同步加入该模块的 `node --check`。

## 2026-07-05 Quick Add Menu

- `index.html` 在会话列表搜索框右侧 `+` 外增加 `#quick-create-wrap` 和 `#quick-create-menu`，菜单项为“创建群聊”和“导入角色”，均使用 `src/_logo/icons` 下的 Lucide SVG 图标。
- `src/js/ui.js` 新增 `state.quickCreateMenuOpen`、`bindQuickCreateMenu()`、`renderQuickCreateMenu()` 和 `closeQuickCreateMenu()`；点击加号展开/收起菜单，点击空白处或按 Escape 关闭菜单。
- 菜单项复用现有弹窗：`#quick-create-group` 调用 `openPanel('group-editor-panel', { fresh: true })`，`#quick-import-character` 调用 `openPanel('character-import-panel')`。
- `src/styles/app.css` 新增 `.quick-create-*` 样式，按 Soft UI / 轻量玻璃拟态规则设置白色半透明背景、圆角、细边框、柔和阴影和移动端宽度约束。

## 2026-07-04 Preset Roles And Time Display

- `src/js/characters.js` 的 `PRESET_CHARACTER_SOURCES` 新增安卡希雅、凯茜娅、里芙、苔丝、肴，复用现有 `ensurePresetCharacters()` 预置角色同步和私聊创建流程。
- 新增角色均读取 `src/_char/<角色>` 下的头像、人格提示词和 TTS 参考语音；示例对话暂留空，简介和 tags 在预置角色元数据中维护。
- `src/js/storage.js` 新增 `formatConversationListTime()` 和 `formatMessageTime()`：会话列表当天显示 `HH:MM`、非当天显示 `MM/DD`；消息气泡当天显示 `HH:MM`、非当天显示 `MM/DD HH:MM`。
- `src/js/ui.js` 的会话列表 meta 改用 `formatConversationListTime()`，消息气泡 meta 改用 `formatMessageTime()`；异常详情仍保留 `formatTime()` 的纯时间显示。

## 2026-07-04 Role Card And Image Model Routing

- `src/js/ui.js` 的 `[data-panel-open]` 和 `[data-group-info-open]` 事件会识别触发源是否来自 `.detail-pane`；从角色卡片快速操作打开设置、导入/编辑角色、知识库、记忆节点或群聊成员面板后，会调用 `closeDetailPane()` 自动关闭角色卡片。
- `#detail-close-btn` 改为复用 `closeDetailPane()`，并在样式中增加底部间距，避免关闭按钮贴住角色头像简介卡片。
- 新增 `src/js/llm_request.js`，作为 OpenAI-compatible 请求统一入口。私聊 `requestOpenAICompatible()` 和群聊 `requestRoundtableCompletion()` 都通过该入口发起请求。
- `requestLlmCompletion()` 会检测 `messages` 中的 `image_url` content part：明确文本模型会直接使用默认图像转述模型，未知模型先请求默认对话模型，只有在图片/视觉不支持错误时才回退默认图像转述模型；这保证图片路由是单次请求级别的，不会改变后续默认对话模型。
- `sw.js` 缓存版本更新到 `fritia-next-chat-v4`，并把 `src/js/llm_request.js` 加入核心资源清单。

## 2026-07-02 Model Provider Settings

- “设置 / 大模型”重做为多提供商模型连接工作台，分为“对话”“文字转语音”和移动端可见的“默认模型”标签。
- `src/js/settings.js` 扩展 `chatProviders`、`ttsProviders`、`defaultChatProviderId`、`defaultTtsProviderId`、`defaultImageCaptionProviderId`；旧版 `apiKey/baseUrl/model` 会在无 `chatProviders` 时迁移为首个对话提供商源。
- 兼容字段 `settings.apiKey`、`settings.baseUrl`、`settings.model` 继续由默认对话提供商派生，私聊、群聊、DeepSeek 亲密模式和圆桌密语请求无需改入口即可使用默认对话模型。
- 新增 `src/js/tts_engine.js`，按 MiMO `mimo-v2.5-tts-voiceclone` 文档构造 `chat/completions` 音色复刻请求，使用 `api-key` 请求头与 `messages + audio.voice` 结构，接收角色导入时保存的参考声音文件对象。
- 桌面端模型页使用左侧提供商列表、右侧配置表单、下方默认模型三列选择；移动端隐藏列表，使用下拉选择提供商，并把默认模型作为同级标签页。
- 模型详情头部新增桌面端垃圾桶图标删除按钮；底部“保存模型设置”改回纯文字按钮，避免图标导致换行。
- 原生 `<select>` 保留为数据源，但统一通过 `enhanceCustomSelect()` 渲染为自绘悬浮下拉菜单，选项点击后继续派发原生 `change` 事件。
- 修复“保存模型设置”时三个默认模型被重置的问题：保存前先缓存默认模型选择，再保存当前提供商，避免 `fritia-settings-updated` 重绘表单后覆盖用户刚选的默认值；当前提供商改 ID 时会同步重映射默认模型 id。

## 2026-07-02 Advanced Settings And Localization

- `src/js/settings.js` 迁移旧项目 DeepSeek 亲密模式字段：`localizationSensitivity`、`deepseekIntimateMode`、`deepseekIntimateModeStartedAt`、`deepseekIntimateModeDisabledAt`，并恢复 `isDeepSeekIntimateModeAvailable()` / `shouldUseDeepSeekIntimateMode()`。
- 新增 `src/js/deepseek_intimate_mode.js`，按旧项目方式只在模型名包含 `deepseek` 且 `localizationSensitivity === 1` 且开关开启时读取 `src/_queries/deepseek_special_prompt.txt`，返回 `{ role: 'user', content: ... }`。
- `src/js/chat_engine.js` 和 `src/js/roundtable.js` 在私聊/群聊请求中插入亲密模式 user 消息，并给对应 assistant/bot 回复写入 `meta.deepseekIntimateMode`；后续上下文会过滤已关闭亲密模式期间的旧回复。
- `src/js/long_term_memory.js` 已有旧项目插槽 `options.deepseekIntimateMode && !settings.includeIntimate`，因此亲密模式回复默认不录入长期记忆，除非记忆节点设置开启“允许录入亲密模式内容”。
- `index.html` 和 `src/styles/app.css` 将高级设置页重绘为参考图风格的分组卡片行列表，新增“本地化”集合与 iOS 风格亲密模式开关。
- 高级设置 CSS 进一步参考旧项目 `.advanced-setting-row` 密集程度，压缩为约 58px 行高、13px 主标题、11px 说明、36px 数字输入和更小的滑块/开关控件。
- 修复 `advanced-save` 保存顺序：先缓存 `localizationSensitivity` / `deepseekIntimateMode` 草稿值，再触发 `saveAdvancedSettings()`，避免高级设置事件同步表单后把本地化值写回默认值；同时主设置保存后调用 `closePanel('settings-panel')`。
- 修复 `.btn:hover` 覆盖 `.btn-primary` 背景的问题，主按钮、知识库图标主按钮和记忆节点搜索主按钮 hover 时保持深色渐变，仅轻微变亮。

## 2026-07-02 Long-Term Memory Node Rewrite

- `src/js/long_term_memory.js` 从旧项目 `D:\Models\vibe_coding\fritia_online_v3 (dev)\js\long_term_memory.js` 重新迁移，保留旧项目的常量、记忆归一化、关系抽取、topic promotion、生命周期维护、搜索和 canvas 力导向图谱绘制逻辑。
- 本项目没有旧项目的 `advanced_settings.js`，因此迁移模块在文件顶部用 `getAdvancedSettings()` 做兼容适配，只补齐长期记忆所需的维护、去重和访问增强默认参数。
- `src/js/ui.js` 的“记忆节点”打开/关闭/初始化改为调用 `initLongTermMemoryPanel()`、`openMemoryNodePanel()`、`closeMemoryNodePanel()`；保留旧弱版函数作为未调用代码，避免本次重构扩大到无关设置逻辑。
- 记忆节点 UI 不继承旧项目粉色/金色图谱配色，canvas 绘制色值改为本项目蓝紫 Soft UI 体系；按钮和开关样式遵循 `src/ui_rules/ui_design_rules.md`。

## 2026-07-02 Roundtable Core Refactor

- `src/js/roundtable.js` 重构为圆桌密语专用请求链路，不再通过 `requestCharacterReply()` 的通用群聊 prompt；模型请求体由 `buildRequestBody(settings, speaker, event, ragMessage, memoryMessage, intimateMessage)` 生成。
- 迁移旧项目 `roundtable_whispers.js` 的 `BUILTIN_DEFS`、`FALLBACK_PROMPTS`、`SAFE_FALLBACKS`、`HOSTILE_PATTERNS`、流式读取、JSON 提取/修复解析、敌意内容过滤和 handoff 安全回退规则。
- 新增 3 分钟窗口预算：`roundtableTokenHardLimit`、`roundtableCallLimit`、`roundtableFollowUpRate`，通过“设置 / 高级 / 圆桌密语”保存到高级设置。
- 新增圆桌异常状态：请求配置缺失、API 错误、JSON 解析失败、预算硬限制等会写入 `getRoundtableError()`，并派发 `fritia-roundtable-error-updated` 供 UI 渲染。
- 聊天头右上角按钮组左侧新增 `#roundtable-error-btn` 感叹号图标和 `#roundtable-error-popover` 详情浮层；详情内容使用自绘滚动条。

更新时间：2026-07-01

本文记录 Fritia Online NEXT Chat 的开发事实、版本变更和继承约定。后续每次代码结构变化都需要同步更新本文和 `STRUCTURE.md`。

## 0.1.0 初始化

本次建立了仿 QQ / Telegram 的角色扮演 AI 聊天软件首版：

- 新增静态 Web/PWA 应用入口 `index.html`。
- 新增桌面横屏三栏 UI：左侧导航、会话/好友列表、聊天窗口、右侧详情。
- 新增移动端竖屏 UI：会话列表与聊天窗口滑入式切换。
- 新增 `manifest.webmanifest` 和 `sw.js`，预留 PWA / WebView 封装。
- 新增 `src/styles/app.css`，独立于旧项目配色，不继承 Fritia Online NEXT 的视觉主题。
- 新增 `src/_logo` 资源目录，下载 Lucide SVG 图标和 Fluent UI Emoji PNG 资源。
- 新增 `package.json`，提供 `npm run dev` 和 `npm run check` 脚本；`npm run dev` 使用项目内 `tools/static_server.mjs`，不依赖 npm registry 下载。

## 架构决策

当前首版采用无构建依赖的静态 ES Module：

- 移动端低占用：不引入 React/Vue/Electron 运行时。
- 跨平台：Web 代码可作为 PWA，也可被 Tauri 或 Capacitor 封装。
- 数据本地优先：设置和聊天索引在 `localStorage`，知识库在 IndexedDB。

外部框架调研结论：

- Tauri v2 适合作为桌面和移动 WebView 壳层，官方文档强调使用系统 WebView 和较小包体。
- Capacitor 适合作为 iOS/Android Web Native 壳层，插件生态更偏移动设备能力。
- Matrix 的 room/event 模型适合作为后续服务端同步协议参考；本首版本地会话模型使用 `conversation + messages`，便于未来映射到 room/event。

## 旧项目继承

参考旧项目：

```text
D:\Models\vibe_coding\fritia_online_v3 (dev)
```

继承范围：

- 预置角色：芙提雅、芬妮、琴诺、安卡希雅、凯茜娅、里芙、苔丝、肴头像和人格提示词。
- 知识库：沿用 `fritia_knowledge_base_db`、`fritia_knowledge_base_state`、archive 字段、分块与检索思想。
- 长期记忆：沿用 `fritia_long_term_memory`、私聊 scope、公共圆桌 scope、文本记忆 + graph edge 的数据组织。
- 群聊：沿用“圆桌密语”的核心对话方式，即每轮只选择一个 bot，模型请求只扮演当前发言角色，可处理 @ 提及、角色间 bot-to-bot 接话和最大互聊次数限制。

不继承范围：

- 不继承旧项目 Three.js 场景、3D 房间、暖调闲聚地图和旧 UI 配色。
- 不继承旧项目乙女风面板视觉。
- 不继承旧项目移动横屏专用布局。

## 关键实现

### `src/js/storage.js`

新增统一本地存储层：

- `fritia_next_chat_store` 保存角色、会话、消息和当前会话。
- `ensurePrivateConversation()` 把角色映射为 `private:<characterId>` 私聊。
- `createGroupConversation()` 把多个角色映射为 `group:<hash>` 群聊。
- `createGroupConversation()` 新建或更新群聊时固定写入 `src/_char/Profile_GroupChat.png` 作为群聊头像。
- `updateGroupConversation()` 原地更新已存在群聊的成员、标题和圆桌规则，保持原 conversation id，不再因成员变化创建新群聊。
- 群聊会话新增 `groupSettings`，默认值继承旧项目“圆桌密语”规则：自动接话、空闲搭话、Bot 开头 @ 触发、最大人数和 `botChainLimit`。
- 消息结构预留 `attachments`，支持图片、音频、文件。

### `src/js/characters.js`

新增预置角色加载：

- 从 `src/_char/Fritia/fritia_prompt.txt` 加载芙提雅。
- 从 `src/_char/Fenny/char_fenny_prompt.txt` 加载芬妮。
- 从 `src/_char/Cherno/char_cherno_prompt.txt` 加载琴诺。
- 从 `src/_char/Acacia/char_acacia_prompt.txt` 加载安卡希雅。
- 从 `src/_char/Katya/cha_katya_prompt.txt` 加载凯茜娅。
- 从 `src/_char/Lyfe/char_lyfe_prompt.txt` 加载里芙。
- 从 `src/_char/Tess/char_tess_prompt.txt` 加载苔丝。
- 从 `src/_char/Yao/char_yao_prompt.txt` 加载肴。
- 首次加载会为预置角色创建私聊。

### `src/js/knowledge_base.js`

新增轻量知识库模块：

- IndexedDB 名称：`fritia_knowledge_base_db`。
- object stores：`knowledgeBases`、`files`、`chunks`、`indexes`。
- 启用状态键：`fritia_knowledge_base_state`。
- 预置导入状态键：`fritia_preloaded_knowledge_base_state`。
- 自动导入 `src/_rag_data/chenbai_character_settings_260622.json`。
- 检索算法：BM25 + latin token + CJK 1/2-gram。
- 对话注入函数：`buildRagReferenceMessage()`。
- 管理函数：`deleteKnowledgeBase()` 删除知识库、文件、分块和索引；`deleteKnowledgeBaseFile()` 删除单个文件并重建索引。

### `src/js/long_term_memory.js`

新增轻量长期记忆模块：

- 存储键：`fritia_long_term_memory`。
- 默认结构：`{ version, extractorVersion, updatedAt, settings, memories, edges, deletedIds, lifecycle }`。
- 私聊 scope：`private:<characterId>`。
- 群聊公共 scope：`public:roundtable`。
- 采集函数：`recordLongTermMemoryTurn()`。
- 注入函数：`buildLongTermMemoryMessage()`。
- 记忆节点图谱数据：`buildGraphData()`。

### `src/js/chat_engine.js`

新增 OpenAI 兼容聊天调用：

- 私聊发送入口：`sendPrivateMessage()`。
- 模型请求入口：`requestCharacterReply()`。
- 请求顺序：角色 system prompt -> 知识库 RAG -> 长期记忆 RAG -> 历史消息 -> 当前用户消息。
- 未配置 API Key 时返回本地占位回复。

### `src/js/roundtable.js`

新增圆桌密语群聊调度：

- 玩家消息入口：`sendGroupPlayerMessage()`。
- bot 接话入口：`runRoundtableTurn()`，内部维护圆桌事件队列，串行处理每位 speaker。
- 发言人选择会考虑 @ 提及、上一位发言者和随机权重。
- 每次模型请求只传当前 speaker 的人格设定。
- 玩家手动 @ 群成员时始终作为明确提及处理；被 @ 的角色回复时，回复对象解析为“分析员”或其他目标，避免 bot 在消息前缀中 @ 自己。
- `autoBotChat` 关闭时，无提及的普通玩家消息不触发自动接话；有玩家 @ 时仍会触发对应角色回复。
- `runRoundtableTurn()` 支持 bot-to-bot 链式接话，按当前群聊 `groupSettings.botChainLimit` 限制玩家未介入时的最大连续回复次数。
- 圆桌模型请求改为结构化 JSON payload，解析 `text`、`targetId`、`wantsFollowUp`、`suggestedFollowUpTargetId`、`intent` 和 `emotion`。
- bot 消息开头 @ 其他 bot 时会按 `botAtMentionTriggersReply` 决定是否触发后续接话；普通 follow-up 由 payload 的 `wantsFollowUp` 和高级设置 `roundtableFollowUpRate` 共同决定。
- `idleTalk` 打开时，前端会在当前群聊静默约 45 秒后入队一次空闲圆桌事件；默认关闭，不会自动消耗模型请求。

### `src/js/ui.js`

新增全部 DOM 绑定和渲染：

- 会话列表、联系人列表、群聊列表。
- 消息窗口和附件预览。
- 角色导入表单。
- 存档导入导出窗口，包含 ZIP 全量备份、ZIP 导入恢复、WebDAV 配置、连接测试、立即同步、增量同步进度和冲突选择。
- 会话列表搜索框右侧 `+` 浮动添加菜单，统一进入创建群聊或导入角色。
- 群聊成员单列多选创建窗口，包含搜索、已选头像条、自绘滚动条和底部创建按钮。
- 私聊桌面端默认收起右侧角色卡片，右上角会话信息按钮在私聊时展开角色卡，在群聊时打开成员与规则侧边悬浮面板。
- 群聊侧边面板支持成员宫格、当前群聊成员增减、圆桌规则开关、最大人数、bot-to-bot 最大连续回复次数和跳转高级设置。
- 群聊输入框支持 `@` 候选浮层、键盘选择、消息文本 @ 高亮，以及点击 bot 头像插入 @。
- 设置页。
- 知识库管理页采用旧项目同类的左侧知识库列表、右侧文件/分块工作台布局，支持知识库删除、文件删除和按文件预览分块。
- 长期记忆节点采用左搜索与详情、中间图谱、悬浮搜索结果/档案/设置布局，支持图谱拖动缩放、单节点拖拽、过滤和删除。

## 2026-07-01 UI 布局优化

- 参考 `D:\Models\vibe_coding\fritia_online_v3 (dev)` 中 `knowledge-workbench` 与 `memory-node-panel` 结构，重排本项目“知识库”和“记忆节点”弹窗。
- 桌面端私聊不再默认占用最右侧详情列；点击聊天头右上角角色卡按钮后才展开。
- 群聊右上角会话信息按钮保留群聊成员含义，并打开成员与圆桌规则侧边悬浮面板。
- 组建群聊弹窗改为单列好友列表，支持搜索、复选多选、已选头像预览和底部“创建群聊(n)”按钮。
- 群聊会话头像固定为 `src/_char/Profile_GroupChat.png`，旧会话展示也通过 UI 回退统一到该头像。

## 2026-07-01 群聊功能修复

- 修复角色和群聊数据变更后依赖刷新才能显示的问题：统一通过 `saveAppStore()` 事件和 `updateStore()` 立即刷新列表、消息、详情、群聊侧边面板与 @ 候选。
- 已存在群聊的成员编辑改为 `updateGroupConversation()` 原地更新，保留原会话和聊天记录。
- 群聊右上角“群聊成员”改为打开侧边悬浮面板，不再复用创建群聊弹窗。
- 群聊规则继承旧项目圆桌密语的 `autoBotChat`、`idleTalk`、`botAtMentionTriggersReply`、最大人数和 `botChainLimit` 配置。
- 前端补齐群聊 `@` 候选、插入和高亮机制；修复 bot 回复时把 @ 前缀指向自身的问题。

## 2026-07-01 记忆节点与知识库完整迁移

- “记忆节点”迁移为旧项目同类功能结构：左侧搜索/节点详情，中间关系图谱，悬浮搜索结果、记忆档案和设置面板。
- 记忆图谱支持滚轮缩放、拖动画布、拖动单个节点和点击节点查看；搜索结果可定位节点或删除关系边。
- 记忆档案支持孤立、全部、私有和圆桌公共过滤，可删除对应原文记忆；设置浮层可配置启用状态、保留天数、屏蔽关键词和亲密内容采集。
- “知识库”迁移为旧项目同类工作台：左侧知识库创建/选择列表，右侧当前知识库详情、启用开关、删除按钮、上传入口、文件列表和分块预览。
- 知识库文件支持删除并自动重建索引，点击文件可预览该文档对应分块；分块预览限制前 80 块并压缩长文本，避免大文件卡顿。

## 2026-07-01 致命问题修复

- 修复首次进入页面不显示会话和好友的问题：`initUi()` 会在 `ensurePresetCharacters()` 写入预置角色和私聊后重新读取最新 `fritia_next_chat_store`，避免使用模块导入时缓存的空 store。
- 修复知识库统计存在但文件列表/分块列表为空的问题：`fritia_knowledge_base_db` 升级到 version 2，`openDb()` 会为既有 object store 补齐 `kbId` / `fileId` 索引。
- 修复文件列表渲染时调用未定义 `formatBytes()` 的异常；该异常会在真实文件记录存在时中断 `renderKnowledgeFileList()`，导致文件列表和分块预览保持空白。
- `sw.js` 缓存名升级为 `fritia-next-chat-v2`，并将 HTML / JS / CSS / JSON 改为 network-first，避免 service worker 持续返回旧前端代码。

## 运行与验证

已执行：

- 下载 `src/_logo` 下 28 个开源图标/表情资源。
- 检查 HTML 重复 id：未发现重复。
- 检查 ES Module 相对导入目标：未发现缺失。
- `npm run check`：通过。
- `http://127.0.0.1:3000/` 首页请求返回 200。

未执行：

- 浏览器截图验证尚未执行。

## 下一步

- 增加导出/导入 ZIP，覆盖聊天、角色、知识库、长期记忆。
- 增加 Playwright 截图检查，覆盖桌面横屏和移动竖屏。
- 选择 Tauri 或 Capacitor 壳层并补充原生权限配置。

## 2026-07-02 Chat UI Critical Layout Fix

- 桌面聊天主列改为顶部固定、消息列表独立滚动、底部输入栏绝对定位悬浮，避免长聊天记录把输入框挤出视口。
- `#message-list` 和列表区域补充自绘滚动条，符合 `src/ui_rules/ui_design_rules.md` 的 Soft UI / 蓝紫主色视觉要求。
- 移动端竖屏恢复原左侧功能入口，将 `.rail` 改为列表页底部悬浮 Tab Bar；进入聊天页时自动收起，避免遮挡输入栏。
- 私聊右上角“角色卡片”改为与群聊成员一致的右侧玻璃悬浮窗口，并新增 `#detail-close-btn` 关闭按钮。

## 2026-07-02 Knowledge UI Refinement

- 修复用户深色聊天气泡内 `@` 提及颜色过暗的问题，改为浅色半透明胶囊样式。
- 知识库管理区 `.kb-management-grid` 在宽屏下使用 `repeat(2, minmax(0, 1fr))`，保证文件列表和分块预览等宽。
- 隐藏 `#kb-upload-status` 横条，并将知识库操作状态写入顶部 `#kb-active-status`。
- 知识库创建、启用/停用、删除知识库和删除文档操作全部改为外部 SVG 图标按钮。

## 2026-07-02 Settings Save Flow

- `#memory-settings-save` 和 `#advanced-save` 保存完成后统一调用 `closePanel('settings-panel')`，使设置悬浮窗口立即收起。

## 2026-07-02 Memory Node Mobile Portrait

- 仅在 `@media (max-width: 760px) and (orientation: portrait)` 下新增 `#memory-node-panel` 专用覆盖规则，迁移旧项目“记忆节点”移动端竖屏布局。
- 保持横屏和其他窗口布局不变；compact 搜索继续复用 `long_term_memory.js` 中旧项目同源的 `.is-compact-open` 切换逻辑。

## 2026-07-02 Static Hosting Deployment

- 新增 `tools/build_static.mjs`，以无第三方依赖方式复制 `index.html`、`manifest.webmanifest`、`sw.js` 和 `src/` 到 `dist/`，并写入 `dist/.nojekyll`。
- `package.json` 新增 `build` 与 `preview` 脚本，`tools/static_server.mjs` 支持通过命令参数指定静态根目录。
- 新增 GitHub Pages workflow：push 到 `main` / `master` 或手动触发时运行检查、构建并发布 `dist/`。
- 新增 `wrangler.toml` 和 `.nvmrc`，Cloudflare Pages 通过 GitHub 仓库部署时使用 `npm run build` 与 `dist`。

## 2026-07-02 Sticker Packs

- 新增 `src/js/stickers.js`，使用 `localStorage.fritia_sticker_store` 保存用户上传的表情包原图 data URL、尺寸和文件信息。
- `src/js/ui.js` 新增表情包弹窗、上传、删除、管理窗口分区和点击表情发送逻辑；发送时复用现有图片附件消息格式，不新增消息类型。
- 表情缩略图按图片比例切换 `contain` / `cover`，只影响表情窗口和管理窗口显示，不改变发送的原图。
- 表情附件会记录 `source: "sticker"` 与原始宽高；消息渲染时用 `.message-image-sticker` 按原图比例缩略显示，短边复用 `--sticker-thumb-size`。
- 表情包弹窗使用无横向溢出的响应式 Grid：桌面端根据可用宽度在 4-6 列间自适应，移动竖屏固定最多 5 列。

## 2026-07-02 Responsive Navigation Gestures

- 桌面横屏主布局新增 `#conversation-resizer`，允许拖拽或用方向键调整消息/角色/群聊列表宽度，并写入 `localStorage.fritia_conversation_list_width`。
- 列表宽度下限为 272px，并同步约束列表项正文列和时间列，保证最小宽度下仍能显示“5 个全角字符 + 省略号 + 时间”的摘要结构。
- 移动竖屏新增触控左缘右滑返回规则：打开全屏二级页面时关闭最上层 modal；没有二级页面时从聊天页返回列表页。
- 分隔条视觉改为单线窄边框，拖拽热区与可见边框分离；移动返回手势改为 Pointer Events + Touch Events 双路径，并扩大左缘触发区。
- 修复移动返回手势的结构性失效点：新增透明 `#mobile-edge-back-zone` 作为左缘触控目标，并让 JS 手势判定使用与移动布局一致的 `max-width: 760px` 断点。
- 手势关闭二级页面后会调用触控态清理：主动 blur 当前焦点，并短暂添加 `.is-clearing-touch-activation`，移动端普通按钮 hover 不再留下灰色激活背景。
- 修复移动端聊天头部返回按钮被透明手势热区遮挡的问题：`#mobile-edge-back-zone` 从聊天头部下方开始覆盖，顶部返回按钮点击与手势返回共用 `closeMobileChatPage()`。

## 2026-07-02 Group Rename

- 群聊成员悬浮面板新增“群聊名称”配置行，位于成员宫格和聊天设置之间，当前标题会在右侧以省略号形式展示。
- 点击该配置行会调用 `renameActiveGroupConversation()`，通过 `updateGroupConversation(..., { title })` 写入当前群聊标题。
- 群聊名称作为 `conversation.title` 持久化保存；保存后通过 `updateStore()` 立即刷新聊天头、会话列表和群聊成员面板。

## 2026-07-02 Group Info Scroll

- 群聊成员悬浮面板的 `.group-info-shell` 明确作为内部滚动容器，限制在当前视口高度内滚动，不再依赖页面滚动。
- 面板和成员编辑列表统一使用蓝紫 Soft UI 自绘滚动条，支持内容超出时上下滑动。
- 修复低高度窗口下 flex 子块被压缩成细条的问题：面板头部、成员卡片、设置区和底部按钮均固定为不收缩，由 `.group-info-shell` 统一滚动。
- 成员编辑模式下，搜索框右侧同一行显示“取消 / 保存成员”图标按钮，并设置 sticky 展示，避免低高度窗口或长列表场景下无法应用成员更改。

## 2026-07-03 Send And Model Save Fixes

- 大模型页的单个 provider “保存配置”、新增和删除操作都会携带当前默认对话 / TTS / 图像转述模型选择，避免设置刷新时回滚到旧默认值。
- 发送流程拆为统一出站提交和异步 bot 回复两个阶段；文字、图片、附件、表情包都会先通过 `commitOutgoingMessage()` 写入当前会话。
- 输入区、附件预览、提及浮层和表情包弹窗只在本地消息提交成功后清理；如果本地提交失败，草稿会保留，避免静默吞消息。
- 私聊回复拆出 `completePrivateMessageReply()`，群聊圆桌回复和私聊回复都在用户消息成功展示后后台执行；API 失败不会阻塞下一次发送。
- 群聊圆桌回复异常被限制在本轮 bot 回复内：错误目标缺失时统一回落到“分析员”。

## 2026-07-03 Persistent Media Storage

- 新增 `src/js/media_store.js`，使用 IndexedDB `fritia_media_store/media` 持久化图片、附件、表情包、角色头像和参考声音等大体积媒体。
- `localStorage` 继续作为必须成功的元数据存储，只保存会话、消息文本、角色字段和 `idb-media:*` 引用；`saveAppStore()` 不再提供运行时兜底，写入失败会让发送停止并保留草稿。
- `src/js/storage.js` 新增 `migrateLegacyAppMediaToIndexedDb()`，启动时把旧消息附件、旧角色头像/音频、会话头像中的 data URL 搬到 IndexedDB。
- `src/js/stickers.js` 新增 `migrateLegacyStickersToIndexedDb()`，表情包原图不再写入 `localStorage.fritia_sticker_store`，发送表情包时消息只记录 `dataRef`。
- `src/js/ui.js` 的附件选择、角色导入、表情包发送统一先保存媒体数据，再提交轻量消息元数据；图片渲染通过 `setImageSource()` 异步解析 IndexedDB 引用。

## 2026-07-03 Preset Character Voice Samples

- `src/js/characters.js` 的 `PRESET_CHARACTER_SOURCES` 为芙提雅、芬妮、琴诺补齐 `voiceSample` 字段，使预置角色与用户导入角色共用同一角色数据结构。
- 芙提雅预置 `examples` 示例对话；芬妮和琴诺保留空示例对话。
- `ensurePresetCharacters()` 现在会把已有预置角色的 `examples` 和 `voiceSample` 更新写回 `fritia_next_chat_store`，避免旧用户数据启动后仍缺少参考语音字段。

## 2026-07-03 LLM Media Payload Resolution

- 新增 `src/js/llm_media.js`，作为模型请求前的统一媒体解析层：`idb-media:*`、data URL 和项目内静态资源路径都会解析成真实 `data:` 内容。
- 私聊 `requestCharacterReply()` 会把当前用户消息和近期历史中的附件转换为 OpenAI-compatible 多模态 content parts；图片使用 `image_url`，音频使用 `input_audio`，文本文件解码为文本，其他二进制以 `file_data` 形式传递。
- 群聊圆桌 `buildRequestBody()` 保持原圆桌 prompt 结构，但最后一个 user message 会在圆桌状态后追加真实媒体 content parts；只发送图片/表情时也会通过附件摘要触发圆桌回复。
- `buildMimoVoiceCloneRequest()` 改为异步构建，TTS 参考语音会先解析为真实音频 data URL，再按 MiMO 文档传给 `audio.voice`。

## 2026-07-03 Private Voice Reply Mode

- 私聊聊天头 `#voice-reply-toggle-btn` 使用电话图标切换当前私聊会话的 `voiceReplyEnabled`，该字段随 `conversation` 持久化；群聊隐藏该按钮，不进入语音回复模式。
- `completePrivateMessageReply()` 新增 `voiceReplyEnabled` 和 `onVoiceNotice` 参数。语音模式下先完成 LLM 文本回复，再调用 `synthesizeMimoVoiceClone()` 生成声音克隆音频。
- TTS 返回音频会写入 IndexedDB 媒体库，bot 消息以 `meta.voiceReply` 和 `source: "tts-reply"` 音频附件记录；`message.text` 仍保存后台回复文字，供长期记忆和后续上下文使用。
- UI 新增语音气泡、倒计时播放、语音模式切换提示条和 TTS 错误提示条；TTS 失败时聊天头会在电话按钮左侧显示感叹号，点击可查看脱敏后的原始请求/响应/网络错误日志。会话列表对语音回复显示 `[语音]`，不泄露隐藏文字。
