# STRUCTURE

## 2026-07-17 New User Onboarding Mapping

- 新增模块 `src/js/onboarding.js`：导出 `initOnboarding(options)` 和 `buildImportedSettings(providerKey, apiKey, settings)`，负责欢迎窗、本地偏好、三步向导、剪贴板/手动 Key 导入、官方 API 检查、错误映射和提供商持久化。
- 新增布局模块 `src/js/onboarding_desktop.js` / `src/js/onboarding_mobile.js`：分别导出 `initOnboardingDesktopLayout()` / `initOnboardingMobileLayout()`，通过互斥 media query 处理横屏和竖屏交互。
- 新增样式 `src/styles/onboarding.css`、`src/styles/onboarding-desktop.css`、`src/styles/onboarding-mobile.css`：公共 Soft UI 与 iOS 开关、桌面横屏双列按钮、移动竖屏单列按钮、两套自绘滚动条和矮视口滚动边界。
- 新增欢迎 DOM：`#onboarding-welcome-panel`、`#onboarding-dismiss-toggle`、`#onboarding-deepseek`、`#onboarding-help`、`#onboarding-mimo`、`#onboarding-close`。
- 新增向导 DOM：`#quick-setup-panel`、`[data-quick-setup-progress]`、`[data-quick-setup-step]`、`[data-quick-setup-actions]`、`#quick-setup-key-input`、`#quick-setup-check`、`#quick-setup-top-up`、`#quick-setup-finish`、`#quick-setup-view-settings`。
- 新增存储键 `localStorage.fritia_chat_onboarding_dismissed`。值为 `1` 时启动不显示欢迎窗；关闭开关会删除该键。模型配置继续保存到 `localStorage.fritia-settings`。
- DeepSeek 导入映射：`DeepSeek_Import` / `https://api.deepseek.com` / `deepseek-v4-flash`，更新 `defaultChatProviderId`。
- MiMo 导入映射：`MiMo_Import` / `https://api.xiaomimimo.com/v1` / `mimo-v2.5`，更新 `defaultChatProviderId` 与 `defaultImageCaptionProviderId`；`MiMoTTS_Import` / `mimo-v2.5-tts-voiceclone`，更新 `defaultTtsProviderId`。
- `src/js/ui.js` 监听 `fritia-ui-open-panel`，供欢迎窗打开帮助窗口或导入后的模型设置页；`src/js/main.js` 在 `initUi()` 后执行 `initOnboarding({ autoShow: true })`。
- `src/js/llm_request.js`：`providerImageInputSupport()` 识别 `mimo-v2.5`；Xiaomi MiMo 请求增加 `api-key` 头。`sw.js` 缓存版本为 `fritia-next-chat-v29`，缓存新增三份 JS 与三份 CSS。

## 2026-07-11 App Help Mapping

- 新增资源：`src/_logo/icons/help-circle.svg`，作为主菜单“使用说明”和帮助目录的帮助图标，来源为联网下载的 Lucide SVG。
- `index.html`：主菜单新增 `#main-menu-help`；新增帮助弹窗 DOM：`#app-help-panel`、`#app-help-layout`、`#app-help-status`、`#app-help-doc-list`、`#app-help-back`、`#app-help-doc-title`、`#app-help-content`。
- `src/js/ui.js`：新增常量 `APP_HELP_DOCS_GITHUB_API`、`APP_HELP_DOC_FILENAME_RE`；新增状态 `appHelp`，字段包含 `docs`、`selectedId`、`loading`、`error`、`contentLoading`、`contentError`、`contentHtml`、`mobilePage`、`requestId`、`contentRequestId`。
- `src/js/ui.js`：新增函数 `bindAppHelpPanel()`、`openAppHelpPanel()`、`loadAppHelpDocs()`、`discoverAppHelpDocs()`、`fetchLocalHelpDocIndex()`、`fetchGitHubHelpDocIndex()`、`normalizeAppHelpDocEntries()`、`normalizeAppHelpDocEntry()`、`normalizeAppHelpDocName()`、`selectAppHelpDoc()`、`loadAppHelpDocument()`、`fetchAppHelpMarkdown()`、`withNoCache()`、`renderAppHelpPanel()`、`appHelpStatusText()`、`isAppHelpTwoLevelLayout()`。
- `src/js/ui.js`：`#main-menu-help` 点击会关闭主菜单并打开 `#app-help-panel`；`openPanel('app-help-panel')` 每次都会重新发现 `src/docs/doc_*.md`；移动/竖屏内容层返回优先切回目录层。
- `src/styles/app.css`：新增 `.app-help-*` 桌面双栏、竖屏两级页面和自绘滚动条样式；帮助正文复用 `.markdown-body`，支持标题、列表、引用、表格、链接、图片、代码块和公式文本。
- `tools/static_server.mjs`：`/src/docs/` 请求返回 `{ name, type }` JSON 文件清单并设置 `Cache-Control: no-store`，用于本地开发实时枚举帮助文档。
- `sw.js`：缓存版本 `fritia-next-chat-v28`，核心缓存新增 `help-circle.svg`；`src/docs/doc_*.md` 请求直接走网络，避免 PWA 缓存复用旧帮助文档。

## 2026-07-09 v0.4.4 Quick Add Menu Mapping

- `package.json`：版本 `0.4.4`。
- `sw.js`：缓存版本 `fritia-next-chat-v27`。
- `src/styles/app.css`：`.quick-create-menu` / `.quick-create-item` 的桌面端和 `max-width: 760px` 移动端尺寸、选项间距、选项高度与图标尺寸对齐 `.main-menu` / `.main-menu-item`；不新增 DOM、JS API 或打包文件。

## 2026-07-09 Role Plugin Store Mapping

- 新增资源：`src/_logo/icons/girl.svg`，作为角色插件卡片的通用女孩 logo，来源为联网下载的开源 Twemoji SVG。
- `index.html`：插件商店默认激活“角色插件”；新增角色插件 DOM：`#role-plugin-refresh`、`#role-plugin-status`、`#role-plugin-grid`、`.role-plugin-toolbar`、`.role-plugin-heading`。
- `src/js/ui.js`：新增常量 `ROLE_PLUGIN_CATALOG_URL`、`ROLE_PLUGIN_RESOURCE_BASE_URL`、`ROLE_PLUGIN_ACCESS_TOKEN`、`ROLE_PLUGIN_CARD_ICON`；`pluginStoreSection` 默认值改为 `roles`；新增状态 `rolePluginStore`，字段包含 `items`、`loading`、`loaded`、`error`、`requestId`、`installingId`、`installStatus`。
- `src/js/ui.js`：新增角色插件函数 `loadRolePluginCatalog()`、`normalizeRolePluginCatalog()`、`renderRolePluginStoreGrid()`、`getSortedRolePluginItems()`、`createRolePluginCardHtml()`、`installRolePlugin()`、`fetchRolePluginText()`、`fetchRolePluginBlob()`、`buildRolePluginResourceUrl()`、`withRolePluginToken()`、`getExistingCharacterNameSet()`、`hasCharacterWithName()`、`normalizeRolePluginName()`、`createRolePluginCharacterId()`。
- `src/js/ui.js`：`openPanel('plugin-store-panel')` 每次打开都会调用 `loadRolePluginCatalog({ force: true })`，强制重新同步云端 `plugin_char.json`；当前分组为 MCP 时才检测魔搭登录态和加载 MCP 列表。`renderAll()` 会刷新角色插件卡片的已安装状态。
- 角色插件安装映射：远程目录 `https://chat.fritia.online/api/downloads/fritia-online-source/char/<key>/<filename>?token=cyandust_workshop`；`prompt` / `dialog_sample` 以文本读取，`profile` / `voice` 以 Blob 读取后通过 `saveBlobAsMedia()` 保存到 IndexedDB；最终调用 `normalizeCharacterRecord()`、`upsertCharacter()` 和 `ensurePrivateConversation()` 写入角色与私聊会话。
- `src/styles/app.css`：新增 `.role-plugin-*` 样式；角色插件卡片沿用 `.plugin-card` 网格，已安装角色使用禁用灰色安装按钮；移动端安装按钮压缩为图标按钮。`.plugin-store-nav` 与 `.plugin-store-grid` 均拥有自绘滚动条。
- `sw.js`：缓存版本 `fritia-next-chat-v26`，核心缓存新增 `src/_logo/icons/girl.svg` 和 `src/_logo/icons/download.svg`。

## 2026-07-08 Windows v0.4.3 Package Mapping

- `package.json`：版本 `0.4.3`。
- `sw.js`：缓存版本 `fritia-next-chat-v24`。
- 外部打包映射：`D:\Models\vibe_coding\fritia_online_next_desktop\chat_v0.4.3\win_x64`，从 `chat_v0.4.2\win_x64` 复制 Tauri/WebView2 壳层后同步当前项目源码和手动文案修改。
- 桌面入口仍需加载 `desktop_fetch_proxy.js?v=0.4.3`、`desktop_mcp_relay.js?v=0.4.3`、`main.js?v=0.4.3` 和 `app.css?v=0.4.3`，并禁用桌面端 Service Worker，避免 CORS/MCP relay 回退到浏览器路径。

## 2026-07-08 MCP Client UI Reset Mapping

- `src/styles/app.css`：`.tool-shell`、`.tool-layout`、`.tool-content` 和 `.tool-view[data-tool-view="client"]` 重新约束工具窗口高度、内部网格和滚动边界，避免 MCP 客户端页产生页面级横向溢出。
- `src/styles/app.css`：`.tool-client-workbench` 桌面端为 `服务列表 / 编辑器` 双列 Soft UI 工作台；`.tool-client-list-card`、`.tool-client-list`、`.tool-client-editor` 各自拥有明确滚动边界；`#mcp-client-json` 通过 `.tool-client-editor .tool-json-field textarea` 获得响应式固定编辑高度。
- `src/styles/app.css`：`@media (max-width: 760px)` 下，MCP 客户端页改为单列卡片流，服务列表卡片和编辑器卡片上下排列；`@media (min-width: 761px) and (max-width: 980px)` 为横屏窄窗口提供上下分段兜底。
- `src/styles/app.css`：横屏窄窗口兜底中 `.tool-client-editor` 改为 `overflow: visible`，让 `.tool-view[data-tool-view="client"]` 统一提供页面滚动；`.tool-client-editor .tool-json-field textarea` 限制为约 8 行高度；移动端 `.tool-client-list` 使用 `max-height: 228px` 和内部滚动，最多直接显示 3 个服务项。
- 本轮没有新增 DOM、JS API 或打包文件。

## 2026-07-08 Tool Client Layout / Markdown Mapping

- `index.html`：权限设置“对话”分组新增 `#mcp-permission-complete-tool-result`，用于控制工具模式是否追加完整回复隐藏提示。
- `src/js/mcp_tools.js`：`DEFAULT_MCP_CONFIG.permissions` 新增 `completeToolResultReply: true`，`normalizeMcpConfig()` 会为旧配置自动补齐默认开启值。
- `src/js/ui.js`：`renderMcpPermissionPanel()` / `saveMcpPermissionsFromForm()` 映射 `#mcp-permission-complete-tool-result`；`renderMessageText()` 改为调用 `renderMarkdownDocument()` 后执行 `enhanceMarkdownMentions()`，新增 `renderMarkdownBlockquote()`、`renderMarkdownAutoLink()`、`renderMarkdownInlineMath()` 和 `renderMarkdownMathBlock()`。
- `src/js/tool_chat_engine.js`：`requestToolAwareCompletion()` 新增 `completeToolResultReply` 参数；`withCompleteToolResultPrompt()`、`appendHiddenPromptToMessageContent()` 和 `appendCompleteToolPromptText()` 只在工具模式 LLM 请求体里向最后一条 user message 追加完整回复提示。
- `src/styles/app.css`：`.tool-view[data-tool-view="client"].is-active` 改为由整页纵向滚动承载；`.tool-client-workbench`、`.tool-client-editor` 和 `.tool-client-editor .tool-json-field textarea` 保证 JSON 编辑区最小高度。移动端 `@media (max-width: 760px)` 下 `.tool-client-list` 不再固定高度，服务列表与详情上下自然排列。`.message-content .markdown-body`、`.markdown-math*` 和 `blockquote` 样式用于聊天气泡 Markdown 展示。
- `sw.js`：缓存版本 `fritia-next-chat-v23`。`package.json`：版本保持 `0.4.1`。

## 2026-07-08 ModelScope MCP Install Mapping

- `src/js/plugin_store.js`：`deployModelScopeMcp()` 的魔搭连接链路更新为 `listByStatus -> asyncDeploy -> deployStatus`。`listByStatus` 读取 `Data.McpDeployServers` 中 `InfraSource === "platform"` 的 `DeploymentJobId`；`asyncDeploy` 请求体携带环境变量、传输类型、鉴权类型、有效期和 `DeploymentJobId`；`deployStatus` 轮询 `Data.McpDeployInfo.Url` 作为 Streamable HTTP MCP URL。
- `sw.js`：缓存版本 `fritia-next-chat-v22`。`package.json`：版本 `0.4.1`。

## 2026-07-08 Tool Panel / Official Site Mapping

- `src/styles/app.css`：`.tool-view[data-tool-view="client"].is-active` 改为三行网格，`.tool-client-workbench` 不再固定 `52dvh` 高度；`.tool-client-editor` 使用 `auto auto auto minmax(0, 1fr) auto` 行布局，`#mcp-client-json` 在编辑区内自滚动。
- `src/js/ui.js`：新增 `openExternalUrl(url)`，复用 `getTauriInvoke()` 调用打包壳层 `open_external_url`；`#main-menu-official-site` 点击改走该函数，普通网页回退 `window.open()`。
- 该项功能已并入当前 `0.4.1` 补丁线；历史缓存版本为 `fritia-next-chat-v21`。

## 2026-07-08 MCP Agent Output Mapping

- `src/js/tool_chat_engine.js`：工具模式运行中的 `commit()` 不再写入中间轮 `visibleText`；流式 delta 只累计到当前 step，用于 tool call message 或最终回复判定。新增 `splitToolOutputAttachments()` 和 `toolAttachmentKey()`，按最后一个带附件的 MCP step 拆分最终附件与中间附件。
- `src/js/tool_chat_engine.js`：最终 MCP 文件写入 `message.attachments`；中间文件写入 `message.meta.toolOtherAttachments`，并继续在 `toolTrace.calls[].attachments` 中保留摘要。
- 新增 DOM：`#tool-other-files-panel`、`#tool-other-files-title`、`#tool-other-files-count`、`#tool-other-files-list`。
- `src/js/ui.js` 新增状态 `toolOtherFiles`；新增函数 `getToolOtherAttachments()`、`createToolOtherFilesButton()`、`openToolOtherFilesPanel()`、`renderToolOtherFilesPanel()`。消息正文渲染在可见附件后追加 `.tool-other-files-button`，悬浮窗口内部复用 `createMessageAttachmentNode()`。
- `src/styles/app.css` 新增 CSS：`.tool-other-files-button`、`.tool-other-files-shell`、`.tool-other-files-list`、`.tool-other-file-item`、`.tool-other-files-empty`。
- `sw.js`：缓存版本 `fritia-next-chat-v20`。`package.json`：版本 `0.4.1`。
- `src/js/ui.js`：`renderPluginStoreGrid()` 的错误态使用 `isPureFrontendToolRuntime()` 区分浏览器静态页和打包端；浏览器静态页显示手动配置提示，打包端保留“无法读取魔搭 MCP 列表”。

## 2026-07-07 Plugin Store / ModelScope MCP Mapping

- 新增 `src/js/plugin_store.js`：导出 `MODELSCOPE_LOGIN_URL`、`MODELSCOPE_MCP_PAGE_URL`、`checkModelScopeLogin()`、`fetchHostedModelScopeMcps()`、`fetchModelScopeMcpDetail()`、`deployModelScopeMcp()`、`buildModelScopeMcpConfig()`、`normalizeModelScopeMcp()` 和 `normalizeModelScopeMcpDetail()`。详情归一化会生成 `serviceFields`，其中 schema 字段使用 `scope: "env"`，传输类型、鉴权类型和有效期使用 `scope: "deploy"`。
- `src/js/plugin_store.js` 使用 `PUT https://www.modelscope.cn/api/v1/dolphin/mcpServers` 读取 hosted MCP 列表，使用 `GET https://www.modelscope.cn/api/v1/mcpServers/{Path}/{Name}` 读取详情，并优先通过 `POST https://www.modelscope.cn/api/v1/mcpServers/deploy` 获取 Streamable HTTP 远程 MCP URL，失败后再尝试 `/{Path}/{Name}/asyncDeploy`。Tauri 桌面端通过 `modelscope_fetch` 命令把这些请求放到魔搭登录 WebView2 同源上下文执行；请求头包含 `X-Requested-With` 和 `x-modelscope-accept-language`。
- 新增主菜单 DOM：`#main-menu-wrap`、`#main-menu`、`#main-menu-plugin-store`、`#main-menu-official-site`；菜单按钮继续复用 `#mobile-menu-btn`。
- 新增插件源登录 DOM：`#plugin-source-login-panel`、`.plugin-login-guide`、`#modelscope-login-frame`、`#modelscope-login-status`、`#modelscope-login-open`、`#modelscope-login-check`。
- 新增插件详情 DOM：`#plugin-detail-panel`、`#plugin-detail-content`、`#plugin-detail-install-status`、`#plugin-detail-add`。
- 新增官方详情 DOM：`#plugin-official-browser-panel`、`#plugin-official-browser-title`、`#plugin-official-open-external`、`#plugin-official-frame`。
- 新增插件商店 DOM：`#plugin-store-panel`、`[data-plugin-store-section]`、`[data-plugin-store-view]`、`#plugin-store-search`、`#plugin-source-trigger`、`#plugin-source-menu`、`#plugin-source-modelscope`、`#modelscope-source-dot`、`#plugin-store-refresh`、`#plugin-store-status`、`#plugin-store-grid`、`#plugin-store-prev`、`#plugin-store-pages`、`#plugin-store-next`。
- `src/js/ui.js` 新增状态：`mainMenuOpen`、`pluginStoreSection`、`pluginSourceMenuOpen` 和 `pluginStore`；新增函数：`bindMainMenu()`、`renderMainMenu()`、`closeMainMenu()`、`bindPluginStore()`、`showPluginStoreSection()`、`renderPluginStorePanel()`、`renderPluginSourceMenu()`、`closePluginSourceMenu()`、`openModelScopeLoginPanel()`、`getTauriInvoke()`、`openModelScopeDesktopWindow()`、`closeModelScopeDesktopWindow()`、`openModelScopeOfficialDesktopWindow()`、`startModelScopeLoginPoll()`、`stopModelScopeLoginPoll()`、`checkModelScopeLoginStatus()`、`loadPluginStorePage()`、`renderPluginStoreGrid()`、`renderPluginStorePagination()`、`openPluginDetail()`、`renderPluginDetail()`、`openPluginOfficialDetail()`、`openPluginOfficialPanel()`、`createPluginConfigFieldHtml()`、`normalizePluginConfigOptions()`、`installSelectedPluginDetail()`、`readPluginServiceConfig()`、`writePluginDeployOption()`、`copyTextToClipboard()`。`readPluginServiceConfig()` 返回 `{ environmentVariables, options }`，用于区分魔搭环境变量和部署控制项。
- `src/js/ui.js` 的 `openPanel()` 会在打开 `#plugin-store-panel` 时检测魔搭登录态并按需加载 MCP 列表；`closeTransientBackSurface()` 支持 Android/移动返回优先关闭主菜单和插件源菜单。
- `src/styles/app.css` 新增 CSS 分区：`.main-menu-*`、`.plugin-store-*`、`.plugin-source-*`、`.plugin-card`、`.plugin-login-*`、`.plugin-detail-*`、`.plugin-official-*`、`.plugin-config-*`，并追加 `max-width: 1180px` / `max-width: 760px` 响应式规则。`.plugin-card header` 采用图标、标题、更多按钮三列布局，描述区域固定两行以避免标题和简介被挤压；`#plugin-store-panel`、`#plugin-detail-panel`、`#plugin-source-login-panel`、`#plugin-official-browser-panel` 分别使用递增 z-index 保持窗口层级。
- `sw.js`：缓存版本 `fritia-next-chat-v19`，核心缓存新增 `src/js/plugin_store.js`、`menu.svg`、`chevron-down.svg`、`circle-alert.svg`、`monitor-up.svg`、`network.svg`、`plus.svg`、`search.svg` 和 `users.svg`。
- `package.json`：`check` 脚本加入 `node --check src/js/plugin_store.js`。

## 2026-07-06 Tool Calling / WebMCP / MCP Relay Mapping

- 新增 `src/js/mcp_tools.js`：导出 `MCP_CONFIG_EVENT`、`MCP_LOG_EVENT`、`getMcpConfig()`、`saveMcpConfig()`、`createDefaultMcpClient()`、`upsertMcpClient()`、`deleteMcpClient()`、`parseMcpServerConfigJson()`、`formatMcpServerConfigJson()`、`getAvailableMcpClients()`、`getSelectedMcpClientIds()`、`setSelectedMcpClientIds()`、`isMcpEnabledForConversation()`、`collectMcpToolDefinitions()`、`listMcpTools()`、`callMcpToolByRegistryEntry()`、`initWebMcpServer()`、`getWebMcpTools()`、`buildWebMcpManifest()`、`addMcpLog()`、`clearMcpLogs()` 和 `formatMcpContentText()`。
- 新增 `src/js/tool_chat_engine.js`：导出 `completeToolPrivateMessageReply()`，用于启用 MCP 后的独立私聊回复流程。该流程支持流式输出、OpenAI-compatible tool calls、MCP 工具结果回填和 `message.meta.toolTrace`。
- `src/js/tool_chat_engine.js` 的工具流程为通用多步 agent loop：`MAX_TOOL_AGENT_STEPS = 50`，每步都允许模型继续选择任意 MCP tool；工具结果作为本轮临时 `role: "tool"` message 回填给模型，不写入长期记忆或后续聊天上下文。异常、用户停止或达到上限时，`toolTrace.resumeState` 保存压缩后的续跑上下文。
- 新增 `backend/mcp_relay.mjs`：通用 Node.js stdio MCP Relay，供 Tauri/Electron/Capacitor/WebView 壳层启动或直接运行。
- 新增资源 `src/_logo/icons/ai-agent.svg`：左侧工具调用入口和聊天头工具开关共用的 AI Agent 图标。`src/_logo/icons/wrench.svg` 保留给工具调用状态栏。v0.3.3 额外新增联网下载的 `tool-server.svg`、`tool-skills.svg`、`tool-streamable-http.svg`、`tool-stdio.svg`，用于工具窗口导航、transport tabs、MCP 客户端列表和编辑器图标。v0.3.5 新增 `refresh-cw.svg` 作为主侧栏存档备份入口图标，并新增 `role-card.svg` 作为聊天头私聊角色卡按钮图标。本次 UI 修正新增 `save-config.svg` 和 `tool-help.svg`，分别用于 MCP 客户端保存配置按钮和工具窗口“使用说明”入口。
- 新增存储键 `localStorage.fritia_mcp_tool_config`：保存 WebMCP 服务端开关、MCP 客户端配置、用户填写的 `configJson` 配置文本、会话选中 MCP、权限和系统日志。
- 新增 DOM：左侧导航 `data-panel-open="tool-call-panel"`；聊天头 `#external-tools-toggle-btn`；工具多选浮层 `#mcp-picker-popover`；配置窗口 `#tool-call-panel`。
- `#tool-call-panel` 内部 DOM：`[data-tool-section]` / `[data-tool-view]` 切换 MCP 客户端、MCP 服务端、Skills、权限设置、系统日志、使用说明。
- MCP 客户端 DOM：`[data-mcp-transport]`、`#mcp-client-list`、`#mcp-client-add`、`#mcp-client-name`、`#mcp-client-enabled`、`#mcp-client-json`、`#mcp-client-save`、`#mcp-client-delete`、`#mcp-client-json-status`。
- WebMCP 服务端 DOM：`#webmcp-server-enabled`、`#webmcp-server-confirm`、`#webmcp-server-json`、`#webmcp-server-save`、`#webmcp-server-manifest`；运行时还会在 `<head>` 写入 `#fritia-webmcp-manifest` JSON script。
- 权限、日志和帮助 DOM：`#mcp-permission-level`、`#mcp-permission-manual`、`#mcp-permission-remote`、`#mcp-permission-stdio`、`#mcp-permission-share-character`、`#mcp-permission-share-memory`、`#mcp-permission-isolate-tool-context`、`#mcp-permission-file-write`、`#mcp-log-count`、`#mcp-log-clear`、`#mcp-log-list`、`#mcp-help-content`。权限页按 `.permission-group` 分为“功能 / 权限 / 对话”，组内项目使用高级设置式行列表，开关统一通过 `.tool-toggle-control` 自绘。
- `src/js/ui.js` 新增状态：`toolPanelSection`、`mcpTransport`、`selectedMcpClientId`、`mcpPickerOpen`、`mcpHelpLoaded`、`mcpHelpHtml`、`activeToolRun`。新增 UI 函数：`bindToolCallPanel()`、`showToolSection()`、`renderToolCallPanel()`、`renderMcpClientEditor()`、`toggleSelectedMcpClientEnabled()`、`saveSelectedMcpClientFromForm()`、`renderWebMcpServerPanel()`、`renderMcpPermissionPanel()`、`renderMcpLogPanel()`、`renderMcpHelpPanel()`、`renderMcpPicker()`、`createToolTraceNode()`、`createToolCallGroupNode()`、`createToolStopButton()`、`stopActiveToolRun()`、`createMessageAttachmentNode()`、`createVideoAttachmentNode()`、`saveAttachmentToUserDevice()`。纯网页运行时通过 `isPureFrontendToolRuntime()` 隐藏 Stdio MCP 配置页签。
- `src/js/ui.js` 的 `continueConversationAfterOutgoing()` 在私聊中检测当前会话的 MCP 选择；选中 MCP 时调用 `completeToolPrivateMessageReply()`，否则保持原 `completePrivateMessageReply()` 日常聊天路径。
- `src/styles/app.css` 新增 CSS 分区：`.mcp-picker-*`、`.mcp-picker-title`、`.message-tool-trace`、`.tool-trace-card`、`.tool-trace-call-group`、`.tool-trace-call-list`、`.tool-runtime-row`、`.tool-stop-row`、`.tool-stop-button`、`.message-attachment-file`、`.message-video`、`.tool-shell`、`.tool-layout`、`.tool-nav`、`.tool-client-*`、`.tool-help-content`、`.markdown-body`、`.permission-group`、`.tool-icon-only-btn`、`.tool-card`、`.tool-log-*`、`.tool-skill-*`；移动端追加 `@media (max-width: 760px)` 工具窗口单列布局和 MCP 客户端页滚动条，竖屏 MCP 客户端服务列表至少保留 3 个服务项高度，桌面端 MCP 客户端服务列表通过固定工作台高度获得独立纵向滚动条。
- `sw.js`：缓存版本 `fritia-next-chat-v18`，核心缓存新增工具调用模块、`src/docs/mcp_help.md`、`ai-agent.svg`、`refresh-cw.svg`、`role-card.svg`、`save-config.svg`、`tool-help.svg`、`wrench.svg`、`x.svg` 和 `tool-server.svg` / `tool-skills.svg` / `tool-streamable-http.svg` / `tool-stdio.svg`。
- `src/js/mcp_tools.js` 配置解析：`parseMcpServerConfigJson()` 接受标准 `{ "mcpServers": { "<name>": { ... } } }`，并为历史存档兼容扁平 `{ "transport": "...", ... }`；`formatMcpServerConfigJson()` 只生成标准 `mcpServers` 结构，不再生成扁平模板。Streamable HTTP 新建、删除兜底和空白保存时，`configJson` / `#mcp-client-json` 保持空白。
- `src/js/mcp_tools.js` Streamable HTTP：桌面打包端检测 `window.__FRITIA_MCP_HTTP_RELAY__` 后优先走原生 HTTP MCP relay；纯网页端继续走浏览器 `fetch`，并支持按 JSON-RPC `id` 读取 `application/json` 或 `text/event-stream`。原生 relay 返回的 `sessionId` / `session_id` 都会写回会话缓存；`getRemoteUrlCandidates()` / `withClientUrl()` 只在运行时对 `localhost` / `127.0.0.1` 做同机 fallback，不改写保存的 `configJson`。列表读取和 HTTP 请求支持可选 `AbortSignal`。
- `src/js/mcp_tools.js` Legacy SSE：`MCP_TRANSPORTS.SSE` 通过 GET 打开 SSE 流、解析 endpoint、POST JSON-RPC 消息，并按 JSON-RPC `id` 从 SSE message 事件匹配响应。SSE endpoint 等待、message 等待和 POST 请求支持可选 `AbortSignal`。
- `src/js/mcp_tools.js` 内置 `BUILTIN_FILESYSTEM_MCP_ID = "builtin-filesystem"`：服务器名固定为 `Filesystem`，`configJson` 为标准 stdio `mcpServers` JSON，打包端默认启用、网页端始终禁用，`hiddenFromPicker: true`。`collectMcpToolDefinitions()` 会在会话已有至少一个可见 MCP 选择时通过 `withImplicitFilesystemClientIds()` 隐式加入它。
- `backend/mcp_relay.mjs`：首次请求前自动初始化 stdio MCP session；Windows 下 `createSpawnCommand()` 会对 `.cmd` / `.bat` / 无扩展命令使用 `cmd.exe /d /s /c` 包装，解决 `npx` 类 MCP server 无法稳定启动的问题。`tools/call` 会返回原始 JSON-RPC `response` 加 `changedFiles`，其中包含本轮新建/修改文件的路径、名称、MIME、大小和小文件 base64 数据。
- `src/js/tool_chat_engine.js` 工具选择策略保持通用：依据 MCP 工具列表的名称、描述和参数 schema 让模型选择工具，不绑定具体 MCP Server。
- `src/js/tool_chat_engine.js` 会识别“我继续处理 / 要我继续吗 / 下一步我会操作”等中间话术，通过追加临时 system 指令继续推进工具调用，避免 bot 输出一句自然语言后提前结束 MCP 流程。
- `src/js/tool_chat_engine.js` 续跑映射：`getResumableToolState()` 识别用户“继续”请求，读取最近一条 `toolTrace.interrupted` 消息的 `resumeState`；`setTraceResumeState()` / `compactResumeMessages()` 保存中断点；成功完成时 `finishTrace()` 清理 `resumeState`。
- `src/js/tool_chat_engine.js` 附件映射：`extractMessageAttachments()` 读取模型 content parts；`extractMcpResultAttachments()` 读取 MCP `image` / `audio` / `video` / `resource` / `resource_link` / file-like content、`structuredContent`、Relay `changedFiles` 以及结果文本/参数中的远程文件 URL / 本地文件引用；`normalizeGeneratedAttachments()` 尝试写入 IndexedDB 媒体库，并过滤 `.log`、临时文件和无法由 `dataRef` / `dataUrl` / 远程 URL / 打包端本地文件桥读取的空占位；最终消息附件由 `createMessageAttachmentNode()` 渲染。
- `src/js/mcp_tools.js` 权限映射：`assertMcpPermission()` 使用全局 `permissions.level` 与 `permissions.requireManualApproval` 决定是否弹窗，客户端 `permission: "off"` 作为单客户端禁用开关；`assertMcpFileWritePermission()` 在 `permissions.requireFileWriteApproval` 开启时，对文件写入/删除/移动/复制意图单独请求授权。
- `src/js/chat_engine.js` / `src/js/roundtable.js` 上下文隔离：当 `permissions.isolateToolContext` 为 `true` 时，普通私聊和群聊 LLM 上下文过滤 `message.meta.toolMode === true` 的历史；工具模式自身不使用该过滤。
- `src/js/ui.js` 工具刷新映射：`completeToolPrivateMessageReply()` 传入 `onStore` 元信息后，`updateStoreFromToolReply()` 在工具运行中只刷新 `#message-list`，完成或失败时再刷新会话列表和聊天头；`activeToolRun` 只在当前 typing 工具回复上显示停止按钮，未生成内容时与 typing 提示同排，已有内容时移动到内容下方；`MCP_LOG_EVENT` 只触发 `renderMcpLogPanel()`。`renderMcpPicker()` 会在下拉顶部渲染 `.mcp-picker-title`。
- `src/js/ui.js` 工具附件映射：`setAttachmentImageSource()`、`createVideoAttachmentNode()`、`resolveAttachmentDataUrl()` 和 `saveAttachmentToUserDevice()` 支持 `dataRef`、`dataUrl`、远程 URL，以及打包端 `window.__FRITIA_NATIVE_FILE__.readFile()` 读取的本地路径。远程 URL 保存会在用户点击时尝试 fetch 成数据，失败时保留直接下载链接。
- `src/js/storage.js` 附件存储映射：`normalizeAttachment()` 保留 `url` / `path` 并允许 `video` 类型，避免工具附件经过消息存储后丢失可查看或可保存的数据来源。
- Windows v0.3.6 Tauri 外部打包壳层映射：`desktop_mcp_relay.js` 暴露 `window.__FRITIA_MCP_RELAY__`、`window.__FRITIA_MCP_HTTP_RELAY__`、`window.__FRITIA_NATIVE_FILE__` 并监听 `F12`；Rust command 包含 `mcp_stdio_request`、`mcp_http_request`、`read_local_file`、`open_devtools`。stdio `mcp_stdio_request` 对通用 `tools/call` 做文件快照，不包含任何特定 MCP Server 判断。

## 2026-07-05 Runtime Environment Detection And WebDAV CORS Mapping

- 新增 `src/js/runtime_env.js`：导出 `RUNTIME_ENV_TYPES`、`initRuntimeEnvironment()`、`detectRuntimeEnvironment()`、`getRuntimeEnvironment()`、`getRuntimeEnvironmentType()`、`isBrowserFrontendRuntime()`。
- `src/js/main.js`：启动时先调用 `initRuntimeEnvironment()`，再执行媒体迁移、预置角色同步和 UI 初始化。
- 运行环境类型：`web`、`localhost`、`file` 表示普通浏览器纯前端；`tauri`、`electron`、`webview` 表示打包或 WebView 环境；`unknown` 用于无法判断的环境。
- `src/js/archive_sync.js`：新增 `ensureWebDavCorsSupport(config, options)`。纯前端环境下用当前 WebDAV 配置发起 CORS 探测；Tauri/Electron/WebView 环境直接返回通过。
- `src/js/archive_sync.js`：`testWebDavConnection()` 会先调用 `ensureWebDavCorsSupport()`，因此用户点击“连接测试”也会执行 CORS 检测。
- `src/js/archive_sync.js`：`webDavFetch()` 会把非 GET 请求中 `Response with null body status cannot have body` 的空响应异常合成为 `204 No Content`，适配返回空 body 的 WebDAV 服务商。
- `src/js/archive_sync.js`：同步成功文案由 `formatSyncSuccessMessage()` 生成，格式为 `同步成功，时间：YYYY/MM/DD HH:MM`。
- `src/js/ui.js`：`#archive-webdav-enabled` 和 `#archive-config-save` 在启用 WebDAV 前调用 `ensureWebDavCorsSupport()`；CORS 不支持时保持未启用，并通过 `#archive-progress-label` / `#archive-config-progress-label` 显示固定错误文本。
- `package.json`：`check` 脚本加入 `node --check src/js/runtime_env.js`。
- `sw.js`：缓存版本更新到 `fritia-next-chat-v6`，核心资源加入 `src/js/runtime_env.js`。

## 2026-07-05 Archive Backup And WebDAV Sync Mapping

- 新增 `src/js/archive_sync.js`：负责 `getWebDavConfig()`、`saveWebDavConfig()`、`startArchiveSync()`、`getArchiveStats()`、`exportArchiveZip()`、`importArchiveZipFile()`、`testWebDavConnection()`、`syncWebDavNow()`、`resolveArchiveConflict()`、`formatArchiveSize()` 和 `formatArchiveDate()`。
- `src/js/archive_sync.js` 的 ZIP 备份范围：`localStorage` 中 `fritia_` / `fritia-` 前缀的用户数据、`fritia_media_store/media`、`fritia_knowledge_base_db/knowledgeBases/files/chunks/indexes`。
- WebDAV 同步文件布局：远端路径为 `<配置路径>/fritia-sync-v1/`，包含 `manifest.json`、`localStorage/<key>.json` 和 `indexeddb/<db>/<store>.json`。同步按文件 hash 增量 PUT/GET，冲突基于上次同步的本地/远端 manifest hash。
- `index.html`：左侧导航第三个按钮改为 `data-panel-open="archive-panel"`，v0.3.5 起图标为 `src/_logo/icons/refresh-cw.svg`，并与 `data-panel-open="tool-call-panel"` 的工具调用按钮互换位置；原导入角色入口保留在加号菜单和详情快捷操作。
- 新增 DOM：`#archive-panel`、`#archive-import-file`、`#archive-export-btn`、`#archive-webdav-enabled`、`#archive-config-open`、`#archive-webdav-test`、`#archive-webdav-sync`。
- 新增 DOM：`#archive-config-popover` 及 `#archive-config-url`、`#archive-config-path`、`#archive-config-username`、`#archive-config-password`、`#archive-config-interval`、`#archive-config-test`、`#archive-config-sync`。
- 新增 DOM：`#archive-conflict-overlay`、`#archive-conflict-local`、`#archive-conflict-remote`，用于云端和本地数据同时变化时的顶层冲突选择。
- `src/js/ui.js`：新增存档窗口绑定、进度渲染、WebDAV 配置浮层、ZIP 导入/导出按钮、冲突窗口渲染，并监听 `fritia-archive-sync-updated`、`fritia-archive-sync-status`、`fritia-archive-conflict`。
- `src/styles/app.css`：新增 `.archive-*` 样式，桌面端使用左侧状态栏 + 右侧滚动内容，移动端使用单列全屏窗口；`.archive-content` 和 `.archive-config-popover` 使用自绘滚动条。
- `sw.js`：缓存版本更新到 `fritia-next-chat-v5`，核心资源加入 `src/js/archive_sync.js`。
- `package.json`：`check` 脚本加入 `node --check src/js/archive_sync.js`。

## 2026-07-05 Quick Add Menu Mapping

- `index.html`：会话列表搜索框右侧新增 `#quick-create-wrap` / `#quick-create-menu`，加号按钮 `#quick-new-group` 改为添加菜单触发器。
- `#quick-create-group`：浮动菜单中的“创建群聊”入口，点击后打开现有 `#group-editor-panel` 并传入 `{ fresh: true }`。
- `#quick-import-character`：浮动菜单中的“导入角色”入口，点击后打开现有 `#character-import-panel`。
- `src/js/ui.js`：新增 `state.quickCreateMenuOpen`、`bindQuickCreateMenu()`、`renderQuickCreateMenu()` 和 `closeQuickCreateMenu()`；支持点击触发、空白点击关闭、Escape 关闭，并在任意 `openPanel()` 前收起菜单。
- `src/styles/app.css`：新增 `.quick-create-wrap`、`.quick-create-trigger`、`.quick-create-menu`、`.quick-create-item` 和移动端覆盖样式，使用本地 Lucide 图标、白色半透明背景、圆角、细边框和柔和阴影。

## 2026-07-04 Preset Roles And Time Display Mapping

- `src/js/characters.js`：`PRESET_CHARACTER_SOURCES` 新增安卡希雅、凯茜娅、里芙、苔丝、肴，字段包含 `avatar`、`promptPath`、`voiceSample`、`description` 和 `tags`。
- `src/js/storage.js`：新增 `formatConversationListTime()` 和 `formatMessageTime()`，分别服务会话列表和消息气泡时间展示。
- `src/js/ui.js`：会话列表 `meta` 使用 `formatConversationListTime()`；消息气泡 `.message-meta` 使用 `formatMessageTime()`。

## 2026-07-04 Role Card And Image Model Routing Mapping

- 新增 `src/js/llm_request.js`：导出 `requestLlmCompletion()`、`messagesContainImages()`、`providerSupportsImageInput()`，统一处理 OpenAI-compatible 请求、流式/JSON 响应解析、图片请求模型路由和错误标注。
- `src/js/chat_engine.js`：私聊模型请求改为调用 `requestLlmCompletion()`，不再直接拼接 `fetch(.../chat/completions)`。
- `src/js/roundtable.js`：圆桌群聊 `requestRoundtableCompletion()` 复用 `requestLlmCompletion()`，仍保留 `buildRequestBody().messages` 作为圆桌专用 prompt 来源。
- `src/js/ui.js`：新增 `closeDetailPane()`；角色卡片内快速操作打开二级窗口或群聊成员面板后会自动关闭角色卡片。
- `src/styles/app.css`：`#detail-close-btn` 所在的 `.detail-close-btn` 补充底部间距。
- `sw.js`：核心缓存清单新增 `src/js/llm_request.js`，缓存版本更新到 `fritia-next-chat-v4`。

## 2026-07-03 Private Voice Reply Mapping

- `conversation.voiceReplyEnabled`：私聊会话级语音回复开关，保存在 `fritia_next_chat_store`；群聊不会使用该字段。
- `src/js/chat_engine.js`：`completePrivateMessageReply()` 新增 `voiceReplyEnabled` 和 `onVoiceNotice`，语音模式下 LLM 先生成文字，再调用 TTS，成功后用 `meta.voiceReply` + 音频附件替换 typing 消息。
- `src/js/tts_engine.js`：新增 `synthesizeMimoVoiceClone()`，负责按 MiMO `chat/completions` 音色复刻协议请求默认 TTS 提供商，并把音频响应规范成 data URL。
- `src/js/ui.js`：新增 `#voice-reply-toggle-btn` 绑定、`#voice-error-btn`/`#voice-error-popover` 错误详情入口、`.voice-notice` 提示条、`.voice-bubble` 播放气泡和单条语音倒计时播放状态。
- `src/_logo/icons/volume-2.svg`：语音气泡使用的本地图标。

## 2026-07-03 LLM Media Payload Mapping

- 新增 `src/js/llm_media.js`：导出 `resolveMediaDataUrl()`、`buildModelMessageContent()`、`buildAttachmentContentParts()`、`attachmentLabelText()`，负责在请求模型前把 `idb-media:*`、data URL 和静态资源路径解析成真实模型输入数据。
- `src/js/chat_engine.js`：私聊请求的当前用户消息和近期历史消息会调用 `buildModelMessageContent()`，图片作为 `image_url` content part 发送给 OpenAI-compatible LLM。
- `src/js/roundtable.js`：圆桌请求在 `buildRequestBody().messages` 的最后一个 user message 中追加 `buildAttachmentContentParts()` 输出的真实媒体内容；`runRoundtableTurn()` 新增 `triggerAttachments`，只发图片/表情也能触发模型读取。
- `src/js/tts_engine.js`：`buildMimoVoiceCloneRequest()` 改为 async，TTS 参考语音通过 `resolveMediaDataUrl()` 解析后按 MiMO 文档传给 `audio.voice`。

## 2026-07-03 Preset Character Voice Mapping

- `src/js/characters.js`：`PRESET_CHARACTER_SOURCES` 为芙提雅、芬妮、琴诺补齐 `voiceSample`，路径分别指向各自 `src/_char/<角色>/..._Voice.mp3`。
- 芙提雅预置 `examples` 示例对话；芬妮、琴诺示例对话为空，保持与用户导入角色相同的字段结构。
- `ensurePresetCharacters()` 会在已有预置角色启动同步时比较并保存 `examples`、`voiceSample` 等字段，确保旧 store 中的预置角色也完成配置迁移。

## 2026-07-02 Model Provider Settings Mapping

- `src/js/settings.js`：设置结构新增 `chatProviders`、`ttsProviders`、三个默认模型 id，并继续输出兼容字段 `apiKey/baseUrl/model`。
- `src/js/tts_engine.js`：预留 `getActiveTtsProvider()` 和 `buildMimoVoiceCloneRequest()`，用于后续把角色参考声音文件传给 MiMO TTS。
- 新增大模型 DOM：`[data-model-tab]`、`[data-model-pane]`、`#model-chat-provider-list`、`#model-tts-provider-list`、`#model-chat-provider-select`、`#model-tts-provider-select`、`#chat-provider-*`、`#tts-provider-*`、`#default-chat-provider`、`#default-tts-provider`、`#default-image-caption-provider`。
- 新增 UI 函数：`renderModelSettings()`、`showModelProviderTab()`、`addModelProvider()`、`deleteModelProvider()`、`saveCurrentModelProvider()`、`saveModelSettings()`。
- 新增 UI 函数：`enhanceCustomSelects()`、`updateCustomSelect()`、`closeCustomSelects()`，负责把原生 select 渲染为自绘下拉菜单。
- 新增 CSS：`.model-settings-shell`、`.model-tabs`、`.model-provider-workbench`、`.model-provider-sidebar`、`.model-provider-detail`、`.model-provider-form`、`.model-defaults-card`、`.custom-select`；移动端下默认模型卡片作为第三个同级标签页显示。

## 2026-07-02 Responsive Navigation Mapping

- 新增 DOM：`#conversation-resizer` 位于 `.conversation-list` 和 `.chat-pane` 之间，作为横屏列表宽度拖拽分隔条；`#mobile-edge-back-zone` 作为移动端左缘返回手势透明热区，竖屏下从聊天头部下方开始覆盖，避免挡住左上角返回按钮。
- 新增 CSS 变量和类：`--list-min-width`、`--list-resizer-width`、`.conversation-resizer`、`.app-shell.is-resizing-list`、`.app-shell.is-clearing-touch-activation`；分隔条保留可拖动热区，但只渲染单线窄边框；`@media (orientation: portrait)` 和 `@media (max-width: 760px)` 会隐藏分隔条。
- `src/js/ui.js` 新增布局交互：`bindConversationListResizer()`、`applyStoredConversationListWidth()`、`setConversationListWidth()`、`bindMobileBackGesture()`、`syncMobileBackAvailability()`、`performMobileBackGesture()`、`clearMobileTouchActivationState()`、`closeMobileChatPage()`；移动返回手势同时监听 Pointer Events 和 Touch Events，且判定断点与 `@media (max-width: 760px)` 移动布局一致。
- 列表宽度保存到 `localStorage.fritia_conversation_list_width`；移动竖屏左缘右滑优先关闭最上层 `.modal`，然后关闭聊天页返回列表。

## 2026-07-02 Static Hosting Deployment Mapping

- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署 workflow，push 到 `main` / `master` 或手动触发后发布 `dist/`。
- `tools/build_static.mjs`：静态构建脚本，复制站点文件到 `dist/` 并生成 `.nojekyll`。
- `wrangler.toml`：Cloudflare Pages Git 集成配置，声明 `pages_build_output_dir = "dist"`。
- `.nvmrc`：部署环境 Node.js 版本提示，当前为 `22`。
- `.gitignore`：忽略 `node_modules/`、`dist/` 和本地 `.env*`。
- `package.json` 新增脚本：`build` 生成静态产物，`preview` 预览 `dist/`。

## 2026-07-02 Sticker Packs Mapping

- 新增 `src/js/stickers.js`：导出 `listStickers()`、`addStickerFiles()`、`deleteSticker()`、`stickerToAttachment()`、`isWideSticker()`、`migrateLegacyStickersToIndexedDb()`。
- 新增 DOM：`#sticker-toggle-btn`、`#sticker-popover`、`#sticker-popover-grid`、`#sticker-upload-input`。
- 新增表情包管理窗口：`#sticker-manager-panel`，内部使用 `[data-sticker-section]` / `[data-sticker-view]` 切换“表情管理”和“自动标签”。
- 新增 CSS：`.sticker-popover`、`.sticker-grid`、`.sticker-tile`、`.sticker-action-tile`、`.sticker-manager-grid`、`.sticker-manager-item`；表情弹窗网格桌面端 4-6 列自适应且禁用横向滚动，移动竖屏最多 5 列。
- 新增消息表情样式：`.message-image-sticker`、`.is-sticker-square`、`.is-sticker-landscape`、`.is-sticker-portrait`、`.message-content--sticker-only`。
- 表情原图保存到 IndexedDB 媒体库，`localStorage.fritia_sticker_store` 只保存轻量元数据和 `dataRef`。

## 2026-07-03 Persistent Media Storage Mapping

- 新增 `src/js/media_store.js`：导出 `saveFileAsMedia()`、`saveDataUrlAsMedia()`、`getMediaDataUrl()`、`deleteMedia()`、`isMediaRef()`，使用 IndexedDB `fritia_media_store/media` 存储大体积媒体。
- `src/js/storage.js`：`normalizeAttachment()` 新增 `dataRef`；有 `dataRef` 时不会把 `dataUrl` 写入 `localStorage`。`saveAppStore()` 必须成功写入 localStorage，否则调用方会停止发送。
- `src/js/storage.js`：新增 `migrateLegacyAppMediaToIndexedDb()`，启动时迁移旧 app store 中的 data URL 附件、角色头像、角色声音和会话头像。
- `src/js/main.js`：启动顺序先执行 app/store 和表情包媒体迁移，再确保预置角色和初始化 UI。
- `src/js/ui.js`：新增 `setImageSource()` 解析 `idb-media:*` 引用；附件上传、角色导入和表情发送会先写 IndexedDB，再写轻量消息或角色元数据。

## 2026-07-02 Advanced Settings And Localization Mapping

- 新增 `src/js/deepseek_intimate_mode.js`：导出 `buildDeepSeekIntimateUserMessage()`、`isDeepSeekIntimateReply()`、`shouldKeepMessageForCurrentDeepSeekMode()`。
- `src/js/settings.js` 新增主设置字段：`localizationSensitivity`、`deepseekIntimateMode`、`deepseekIntimateModeStartedAt`、`deepseekIntimateModeDisabledAt`；新增导出 `isDeepSeekIntimateModeAvailable()`、`shouldUseDeepSeekIntimateMode()`。
- `src/_queries/deepseek_special_prompt.txt`：DeepSeek 亲密模式追加提示词，运行时作为额外 `user` 消息读取。
- 新增高级设置 DOM：`#adv-kb-overlap`、`#adv-kb-candidate-limit`、`#adv-kb-inject-limit`、`#adv-memory-limit`、`#adv-edge-limit`、`#localization-sensitivity`、`#localization-sensitivity-value`、`#deepseek-intimate-mode-card`、`#deepseek-intimate-mode`、`#deepseek-intimate-mode-value`。
- 高级设置 UI 类：`.advanced-config-card`、`.advanced-config-head`、`.advanced-setting-list`、`.advanced-setting-row`、`.advanced-setting-copy`、`.advanced-value-pill`、`.advanced-ios-switch`。
- 私聊 `src/js/chat_engine.js` 和群聊 `src/js/roundtable.js` 会在条件满足时插入 DeepSeek 亲密模式 user 消息，并用 `meta.deepseekIntimateMode` 标记回复；长期记忆由 `includeIntimate` 决定是否录入这些回复。

## 2026-07-02 Long-Term Memory Node Rewrite Mapping

- `src/js/long_term_memory.js` 由旧项目 `js/long_term_memory.js` 重新迁移，负责 `fritia_long_term_memory` 的 store normalize/save、记忆抽取、关系边生成、topic promotion、生命周期维护、检索、档案、设置和 canvas 图谱绘制。
- `src/js/long_term_memory.js` 新增/恢复面板导出：`initLongTermMemoryPanel()`、`openMemoryNodePanel()`、`closeMemoryNodePanel()`、`isMemoryNodePanelVisible()`；同时导出 `buildGraphData()` 以兼容本项目旧 UI 插槽。
- `src/js/ui.js` 的 `bindMemoryPanel()` 只初始化迁移模块，`openPanel('memory-node-panel')` 和 `closePanel('memory-node-panel')` 改为调用迁移模块的打开/关闭函数。
- `#memory-node-close`：记忆节点关闭按钮 id，兼容迁移模块 `ui.close`。
- `#memory-archive-btn`、`#memory-settings-btn`、`#memory-search-btn`、`#memory-result-close`、`#memory-archive-close`、`#memory-settings-close`：改为图标按钮。
- 新增/更新 CSS：`.memory-search-submit`、`.memory-danger-icon`、`.memory-edge-pill`、`.memory-archive-body`、`.memory-archive-meta`；`.memory-settings-popover .memory-toggle-row input[type="checkbox"]` 负责 iOS 风格自绘开关。

## 2026-07-02 Roundtable Core Refactor Mapping

- 新增 `src/_logo/icons/circle-alert.svg`：聊天头圆桌异常感叹号图标。
- 新增聊天头 DOM：`#roundtable-error-btn`、`#roundtable-error-popover`、`#roundtable-error-title`、`#roundtable-error-detail`、`#roundtable-error-close`。
- 新增高级设置 DOM：`#adv-roundtable-token-limit`、`#adv-roundtable-call-limit`、`#adv-roundtable-follow-up-rate`，位于“设置 / 高级 / 圆桌密语”子栏目。
- `src/js/settings.js` 新增高级设置字段：`roundtableCallLimit`、`roundtableTokenHardLimit`、`roundtableFollowUpRate`。
- `src/js/roundtable.js` 新增导出：`buildRequestBody()`、`getRoundtableError()`、`clearRoundtableError()`；群聊请求由 `buildRequestBody().messages` 直接生成，不再使用通用私聊/群聊 prompt。
- `src/js/roundtable.js` 内部保留圆桌常量：`BUILTIN_DEFS`、`FALLBACK_PROMPTS`、`SAFE_FALLBACKS`、`HOSTILE_PATTERNS`，并包含 3 分钟预算窗口、流式读取、JSON 提取修复、敌意内容过滤和 handoff 回退。
- `src/js/ui.js` 监听 `fritia-roundtable-error-updated`，调用 `renderRoundtableErrorIndicator()` 渲染错误按钮与详情浮层。
- 新增事件：`fritia-roundtable-error-updated`，detail 为当前圆桌错误对象或 `null`。
- 新增 CSS：`.roundtable-error-btn`、`.roundtable-error-popover`、`.roundtable-error-head`、`.advanced-section`、`.advanced-section-head`；`.settings-content` 增加自绘滚动条。

更新时间：2026-07-01

本文记录当前插件完整文件结构、内部 API、页面元素映射和主要函数职责。

## 文件结构

```text
fritia_online_next_chat/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── .gitignore
├── .nvmrc
├── index.html
├── manifest.webmanifest
├── package.json
├── wrangler.toml
├── sw.js
├── tools/
│   ├── build_static.mjs
│   └── static_server.mjs
├── README.md
├── DEVELOP.md
├── STRUCTURE.md
├── LICENSE
└── src/
    ├── _char/
    │   ├── Profile_Adjutant.png
    │   ├── Profile_GroupChat.png
    │   ├── Fritia/
    │   │   ├── Profile_Fritia.png
    │   │   ├── Firtia_Voice.mp3
    │   │   └── fritia_prompt.txt
    │   ├── Fenny/
    │   │   ├── Profile_Fenny.png
    │   │   ├── Fenny_Voice.mp3
    │   │   ├── char_fenny_dialog_sample.txt
    │   │   └── char_fenny_prompt.txt
    │   └── Cherno/
    │       ├── Profile_Cherno.png
    │       ├── Cherno_Voice.mp3
    │       └── char_cherno_prompt.txt
    ├── _logo/
    │   ├── emoji/
    │   │   ├── robot_3d.png
    │   │   ├── sparkles_3d.png
    │   │   └── speech_balloon_3d.png
    │   └── icons/
    │       └── *.svg
    ├── _rag_data/
    │   └── chenbai_character_settings_260622.json
    ├── docs/
    │   └── mcp_help.md
    ├── js/
    │   ├── main.js
    │   ├── onboarding.js
    │   ├── onboarding_desktop.js
    │   ├── onboarding_mobile.js
    │   ├── storage.js
    │   ├── settings.js
    │   ├── characters.js
    │   ├── knowledge_base.js
    │   ├── long_term_memory.js
    │   ├── media_store.js
    │   ├── llm_media.js
    │   ├── llm_request.js
    │   ├── stickers.js
    │   ├── tts_engine.js
    │   ├── chat_engine.js
    │   ├── roundtable.js
    │   └── ui.js
    └── styles/
        ├── app.css
        ├── onboarding.css
        ├── onboarding-desktop.css
        └── onboarding-mobile.css
```

## 页面元素映射

### 主框架

- `#app`：应用根节点。移动端通过 `.is-chat-open` 切换列表/聊天视图，桌面端通过 `.is-detail-open` 展开私聊角色卡片。
- `.rail`：桌面左侧导航栏。
- `.conversation-list`：会话、联系人、群聊列表区域。
- `.chat-pane`：聊天窗口区域。
- `.detail-pane`：桌面右侧详情与快捷操作。

### 新用户引导

- `#onboarding-welcome-panel`：每次启动按本地偏好显示的无标题栏欢迎小窗。
- `#onboarding-dismiss-toggle`：自绘 iOS 开关，控制 `fritia_chat_onboarding_dismissed`。
- `#onboarding-deepseek` / `#onboarding-mimo`：进入对应官方 API 三步配置。
- `#onboarding-help`：关闭欢迎窗并通过 `fritia-ui-open-panel` 打开 `#app-help-panel`。
- `#quick-setup-panel`：DeepSeek/MiMo 共用的三步配置悬浮窗。
- `[data-quick-setup-progress]` / `[data-quick-setup-step]` / `[data-quick-setup-actions]`：进度、正文和底部操作的步骤映射。
- `#quick-setup-read-clipboard` / `#quick-setup-key-input`：剪贴板读取与手动 Key 输入。
- `#quick-setup-check`：发起极小官方请求，成功后才调用 `saveSettings()`。
- `#quick-setup-top-up`：余额不足时在系统默认浏览器打开官方充值页面。
- `#quick-setup-finish` / `#quick-setup-view-settings`：进入 APP 或打开已导入提供商的模型设置页。

### 会话列表

- `#conversation-search`：搜索会话、联系人和群聊。
- `#quick-new-group`：搜索框右侧添加菜单触发按钮。
- `#quick-create-menu`：搜索框加号触发的浮动添加菜单。
- `#quick-create-group`：打开创建群聊窗口。
- `#quick-import-character`：打开导入角色窗口。
- `[data-list-tab="chats"]`：显示全部会话。
- `[data-list-tab="friends"]`：显示角色。
- `[data-list-tab="groups"]`：显示群聊。
- `#conversation-list`：列表渲染容器。
- `#conversation-item-template`：列表项模板。

### 存档导入导出

- `#archive-panel`：存档导入导出与 WebDAV 同步主窗口。
- `#archive-import-drop` / `#archive-import-file`：ZIP 备份导入拖放区和文件选择框。
- `#archive-export-btn`：导出本地 ZIP 备份。
- `#archive-webdav-enabled`：启用 WebDAV 自动同步开关。
- `#archive-config-open`：打开 WebDAV 配置小浮层。
- `#archive-webdav-test`：测试 WebDAV 连接。
- `#archive-webdav-sync`：立即执行一次 WebDAV 同步。
- `#archive-config-popover`：WebDAV 配置小浮层，包含地址、路径、账户、密码和同步间隔。
- `#archive-progress` / `#archive-config-progress`：主窗口和配置浮层内的同步进度条。
- `#archive-conflict-overlay`：位于所有页面控件顶部的数据冲突选择窗口。
- `#archive-conflict-local`：冲突时上传本地版本覆盖云端。
- `#archive-conflict-remote`：冲突时恢复云端版本覆盖本地。

### 聊天窗口

- `#chat-avatar`：当前会话头像。
- `#chat-title`：当前会话标题。
- `#chat-subtitle`：当前会话副标题。
- `#message-list`：消息渲染容器。
- `#message-input`：消息输入框。
- `#image-input`：图片附件选择。
- `#file-input`：普通附件选择。
- `#attachment-preview`：待发送附件预览。
- `#mention-popover`：群聊输入框 `@` 候选浮层。
- `#send-btn`：发送按钮。
- `#mobile-back-btn`：移动端返回会话列表。
- `#chat-info-btn`：右上角会话信息按钮。私聊时切换右侧角色卡片，群聊时打开群聊成员窗口。
- `#voice-reply-toggle-btn`：私聊语音回复开关，群聊隐藏。
- `#voice-error-btn` / `#voice-error-popover` / `#voice-error-detail`：私聊 TTS 生成或播放异常详情入口，显示脱敏后的原始错误日志。

### 角色导入

- `#character-import-panel`：导入角色弹窗。
- `#character-form`：导入角色表单。
- `#char-name`：角色名称。
- `#char-description`：角色简介。
- `#char-avatar-file`：头像文件。
- `#char-voice-file`：TTS 参考语音。
- `#char-prompt`：人格设定提示词。
- `#char-examples`：示例对话。
- `#char-load-prompt-file` / `#char-prompt-file`：从文本文件读取提示词。

### 群聊

- `#group-editor-panel`：创建群聊弹窗，也可作为兼容入口编辑已有群聊成员。
- `#group-selected-strip`：已选成员头像预览条。
- `#group-member-search`：角色搜索输入。
- `#group-member-total`：角色总数显示。
- `#group-member-list`：单列角色多选列表。
- `#create-group-btn`：创建群聊按钮，按钮文案显示当前选择数量。
- `#group-info-backdrop`：群聊信息侧边面板背景遮罩。
- `#group-info-panel`：群聊成员与规则侧边悬浮面板。
- `#group-info-member-grid`：当前群成员头像宫格，包含邀请和移出入口。
- `#group-info-name-row`：群聊名称配置行，点击后修改当前群聊标题。
- `#group-info-name-label`：群聊名称配置行右侧当前标题显示。
- `#group-info-member-editor`：当前群聊成员增减编辑区。
- `#group-info-member-search`：侧边面板内角色搜索输入。
- `#group-info-member-list`：侧边面板内所有角色单列多选列表。
- `#group-info-save-members`：保存当前群聊成员变更。
- `#group-setting-auto-talk`：允许角色自动接话。
- `#group-setting-idle-talk`：允许空闲时主动搭话。
- `#group-setting-bot-at`：Bot 开头 @ 也触发回复。
- `#group-setting-max-members`：当前群聊最大人数。
- `#group-setting-chain-limit`：玩家未介入时 bot-to-bot 最大连续回复次数，范围 1-6。
- `#group-info-chain-label`：当前 bot-to-bot 上限显示。
- `#group-info-more-settings`：跳转设置页高级配置。

### 设置

- `#settings-panel`：设置弹窗。
- `[data-settings-section]`：左侧设置分组按钮。
- `[data-settings-view]`：设置内容页。
- `[data-model-tab]`：大模型页内“对话 / 文字转语音 / 默认模型”切换按钮。
- `#chat-provider-id` / `#chat-provider-api-key` / `#chat-provider-base-url` / `#chat-provider-model`：当前对话提供商源表单。
- `#tts-provider-id` / `#tts-provider-api-key` / `#tts-provider-base-url` / `#tts-provider-model` / `#tts-provider-speed`：当前文字转语音提供商源表单。
- `#default-chat-provider` / `#default-tts-provider` / `#default-image-caption-provider`：默认对话、默认文字转语音和默认图像转述模型选择。
- `#settings-save`：保存模型设置。
- `#adv-kb-chunk-size`：知识库分块长度。
- `#adv-roundtable-max`：群聊最大角色数。
- `#adv-history-limit`：上下文消息上限。
- `#advanced-save`：保存高级设置。

### 知识库

- `#kb-name-input`：新知识库名称。
- `#kb-create-btn`：创建知识库。
- `#kb-file-input`：上传 `.txt/.md` 文件。
- `#kb-list`：知识库列表。
- `#kb-empty`：未选择或未创建知识库时的空状态。
- `#kb-detail`：当前知识库详情工作台。
- `#kb-detail-head`：当前知识库标题、元信息和操作区。
- `#kb-current-title`：当前知识库名称。
- `#kb-current-meta`：当前知识库文件数与分块数。
- `#kb-enable-toggle`：启用或停用当前知识库。
- `#kb-delete-btn`：删除当前知识库及其文件、分块和索引。
- `#kb-active-status`：当前启用状态与操作提示。
- `#kb-upload-btn`：打开文件选择器。
- `#kb-upload-status`：上传、删除和索引状态提示。
- `#kb-file-list`：文件列表。
- `#kb-preview-title`：当前分块预览标题和分块数量。
- `#kb-chunk-list`：当前选中文件的分块预览，最多渲染前 80 块并压缩长文本。
- `.knowledge-workbench`：知识库工作台，左侧 `.kb-sidebar` 管理知识库，右侧 `.kb-main` 展示详情、上传区、文件列表和分块预览。

### 长期记忆

- `#memory-node-panel`：记忆节点弹窗。
- `#memory-node-stats`：记忆和关系数量。
- `#memory-archive-btn`：打开记忆档案浮层。
- `#memory-settings-btn`：打开长期记忆设置浮层。
- `#memory-search-toggle`：折叠或展开搜索控制台。
- `#memory-search-input`：实体/关系搜索输入。
- `#memory-search-btn`：搜索按钮。
- `#memory-search-results`：悬浮关系搜索结果面板。
- `#memory-result-title`：搜索结果标题。
- `#memory-result-close`：关闭搜索结果面板。
- `#memory-result-list`：关系搜索结果，可定位节点或删除关系。
- `#memory-archive-popover`：悬浮记忆档案面板。
- `#memory-archive-search`：档案搜索输入。
- `#memory-archive-filter`：档案过滤器，支持孤立、全部、私有和圆桌公共。
- `#memory-archive-list`：原文记忆档案，可删除单条记忆。
- `#memory-settings-popover`：长期记忆设置浮层。
- `#memory-setting-enabled`：记忆节点内启用开关。
- `#memory-setting-retention`：记忆节点内保留天数。
- `#memory-setting-keywords`：记忆节点内屏蔽关键词。
- `#memory-setting-intimate`：记忆节点内亲密内容采集开关。
- `#memory-node-settings-save`：保存记忆节点内设置。
- `#memory-graph-canvas`：记忆关系图谱画布。
- `#memory-node-detail`：选中节点详情。
- `.memory-command-panel`：记忆节点左侧实体搜索和节点详情。
- `.memory-graph-wrap`：记忆节点中央画布区域，支持滚轮缩放、拖动画布和拖动单个节点。
- `.memory-result-panel`：悬浮搜索结果卡片。
- `.memory-archive-popover`：悬浮档案卡片。
- `.memory-settings-popover`：悬浮设置卡片。
- `#memory-enabled`：长期记忆启用开关。
- `#memory-retention`：记忆保留天数。
- `#memory-blocked`：屏蔽关键词。
- `#memory-settings-save`：保存长期记忆设置。

## 内部数据结构

### `fritia_next_chat_store`

```js
{
  version: 1,
  characters: Character[],
  conversations: Conversation[],
  messages: Record<conversationId, Message[]>,
  activeConversationId: string,
  updatedAt: number
}
```

### `Character`

```js
{
  id,
  name,
  description,
  prompt,
  examples,
  avatar,
  voiceSample,
  source,
  tags,
  createdAt,
  updatedAt
}
```

### `Conversation`

```js
{
  id,
  type: "private" | "group",
  title,
  avatar,
  memberIds,
  groupSettings,
  createdAt,
  updatedAt,
  unread
}
```

`groupSettings` 仅用于群聊：

```js
{
  autoBotChat: true,
  idleTalk: false,
  botAtMentionTriggersReply: false,
  maxParticipants: 6,
  botChainLimit: 3
}
```

### `Message`

```js
{
  id,
  role: "user" | "assistant" | "system",
  speakerId,
  speakerName,
  text,
  attachments,
  createdAt,
  status,
  meta
}
```

## JavaScript API

### `src/js/main.js`

- `boot()`：启动流程。先加载预置角色，再初始化 UI 与新用户引导，最后注册 service worker。

### `src/js/onboarding.js`

- `initOnboarding({ autoShow })`：绑定欢迎窗与通用三步配置向导；返回打开、关闭和销毁控制器。
- `buildImportedSettings(providerKey, apiKey, settings)`：生成不破坏其他提供商的增量设置 patch；DeepSeek 只更新默认对话，MiMo 更新对话、图像转述与 TTS 默认项。

### `src/js/onboarding_desktop.js` / `src/js/onboarding_mobile.js`

- `initOnboardingDesktopLayout()`：桌面横屏布局标记和步骤滚动复位。
- `initOnboardingMobileLayout()`：移动/竖屏布局标记、`visualViewport` 高度同步、步骤滚动复位和输入框软键盘可见性。

### `tools/static_server.mjs`

- `npm run dev` 使用的无依赖本地静态服务器，默认监听 `127.0.0.1:3000`，为 ES Module、CSS、图片、manifest、文本资源设置基础 MIME 类型。

### `sw.js`

- `CACHE_NAME = 'fritia-next-chat-v29'`：更新离线缓存版本，旧缓存会在 activate 阶段删除。
- `install` 阶段调用 `skipWaiting()`，`activate` 阶段调用 `clients.claim()`，让新缓存策略尽快接管页面。
- HTML / JS / CSS / JSON 请求使用 network-first，避免前端更新后继续返回旧代码。
- 图片、图标等静态资源优先走 cache-first，降低重复加载成本。

### `src/js/storage.js`

- `loadAppStore()`：读取并规范化聊天主存储。
- `saveAppStore(store)`：保存聊天主存储并派发 `fritia-next-chat-store-updated`。
- `normalizeCharacterRecord(raw)`：规范化角色记录。
- `normalizeConversation(raw)`：规范化会话。
- `normalizeGroupSettings(raw)`：规范化群聊圆桌规则。
- `normalizeMessage(raw)`：规范化消息。
- `ensurePrivateConversation(store, character)`：确保角色拥有私聊会话。
- `createGroupConversation(store, title, memberIds, characters)`：创建或更新群聊，头像固定为 `src/_char/Profile_GroupChat.png`。
- `updateGroupConversation(store, conversationId, patch)`：在原 conversation id 上更新已存在群聊的成员、标题和 `groupSettings`。
- `appendMessage(store, conversationId, message)`：追加消息。
- `replaceMessage(store, conversationId, messageId, patch)`：替换消息，主要用于 typing -> sent/error。
- `readFileAsDataUrl(file)`：读取图片/音频/附件。
- `readFileAsText(file)`：读取提示词或知识库文本。

### `src/js/settings.js`

- `getSettings()` / `saveSettings(next)`：读取/保存模型设置。
- `getAdvancedSettings()` / `saveAdvancedSettings(next)`：读取/保存高级设置。
- `normalizeSettings(raw)`：规范化模型设置，迁移旧版扁平模型配置为 `chatProviders`。
- `getDefaultChatProvider()` / `getDefaultTtsProvider()` / `getDefaultImageCaptionProvider()`：读取三个默认模型提供商源。
- `normalizeAdvancedSettings(raw)`：规范化高级设置。

### `src/js/tts_engine.js`

- `getActiveTtsProvider(settings)`：读取默认文字转语音提供商源。
- `buildMimoVoiceCloneRequest({ text, voiceSample, provider })`：异步构造 MiMO `chat/completions` voice clone TTS 请求，参考语音会先解析为真实 data URL 并写入 `audio.voice`。
- `synthesizeMimoVoiceClone({ text, voiceSample, provider })`：发起 TTS 请求，并把 `choices[0].message.audio.data`、二进制、JSON/base64 或远程 URL 音频响应规范为可持久化 data URL；失败时生成脱敏原始日志。
- `getTtsErrorLog(error)`：从 TTS 异常中提取可展示的脱敏原始错误日志。

### `src/js/llm_media.js`

- `resolveMediaDataUrl(source)`：把 IndexedDB 媒体引用、data URL 或静态资源路径解析为真实 data URL。
- `buildModelMessageContent({ speakerName, text, attachments })`：构造私聊 OpenAI-compatible 文本/多模态 message content。
- `buildAttachmentContentParts(attachments)`：把附件数组转换为 `image_url`、`input_audio`、文本或 `file_data` content parts。
- `attachmentLabelText(attachments)`：生成稳定的附件摘要文本，用于列表摘要和纯附件触发。

### `src/js/llm_request.js`

- `requestLlmCompletion({ settings, messages, body })`：统一发起 OpenAI-compatible chat completions 请求。图片请求会按默认对话模型能力单次路由到默认图像转述模型，或在默认模型返回图片不支持错误后回退。
- `messagesContainImages(messages)`：检测 `image_url` content part，用于判断本次请求是否需要图像输入能力。
- `providerSupportsImageInput(provider)`：根据模型名识别明确的多模态模型；内部请求路由对未知模型采用先试默认模型、失败再回退的策略。
- Xiaomi MiMo 域名请求同时发送 `Authorization: Bearer` 与 `api-key`；`mimo-v2.5` 被识别为明确支持图片输入。

### `src/js/characters.js`

- `ensurePresetCharacters()`：读取预置角色头像与提示词，写入主存储并创建私聊。
- `PRESET_CHARACTER_SOURCES`：当前内置芙提雅、芬妮、琴诺、安卡希雅、凯茜娅、里芙、苔丝、肴，并为每个角色配置头像、提示词和 TTS 参考语音路径。
- `getCharacterById(characters, id)`：按 id 查找角色。
- `characterAvatar(character)`：获取角色头像。
- `characterDisplayName(character)`：获取角色显示名。

### `src/js/knowledge_base.js`

- `openDb()`：打开 `fritia_knowledge_base_db` version 2，并为既有 `files.kbId`、`chunks.kbId`、`chunks.fileId` 补齐索引。
- `ensurePreloadedKnowledgeBases()`：导入 `src/_rag_data` 预置知识库。
- `listKnowledgeBases()`：列出知识库。
- `createKnowledgeBase(name)`：创建知识库。
- `deleteKnowledgeBase(kbId)`：删除知识库、文件、分块、索引和启用状态。
- `importFilesToKnowledgeBase(kbId, files)`：导入文本文件。
- `deleteKnowledgeBaseFile(fileId)`：删除单个文件及其分块，并重建该知识库索引。
- `importTextToKnowledgeBase(kbId, fileName, rawText, options)`：把文本分块并保存。
- `rebuildKnowledgeBaseIndex(kbId)`：重建 BM25/CJK 索引。
- `searchKnowledgeBase(query, options)`：检索启用知识库。
- `buildRagReferenceMessage(options)`：生成 OpenAI messages 中的 RAG system 消息。
- `exportKnowledgeBaseArchive()` / `importKnowledgeBaseArchive(archive)`：导出/导入旧项目兼容 archive。
- `getKnowledgeBaseFiles(kbId)` / `getKnowledgeBaseChunks(kbId, fileId)`：UI 查询接口。
- `getAllByIndex(storeName, indexName, value)`：通过 IndexedDB index 查询文件和分块记录。

### `src/js/long_term_memory.js`

- `getLongTermMemoryStore()`：读取长期记忆。
- `getLongTermMemorySettings()` / `updateLongTermMemorySettings(next)`：读取/保存长期记忆设置。
- `buildMemoryScope(characterId, options)`：构建私聊或公共 scope。
- `recordLongTermMemoryTurn(options)`：采集一轮对话记忆。
- `searchLongTermMemory(options)`：检索文本记忆和关系边。
- `buildLongTermMemoryMessage(options)`：生成 OpenAI messages 中的长期记忆 system 消息。
- `buildGraphData(store)`：为记忆节点画布生成 nodes/edges。
- `getOrphanMemories(store)`：列出未入图谱记忆。
- `deleteLongTermMemoryEdge(edgeId)`：删除关系并级联来源记忆。
- `deleteLongTermMemoryMemory(memoryId)`：删除单条原文记忆。
- `exportLongTermMemory()` / `importLongTermMemory(data)`：导出/导入长期记忆。

### `src/js/chat_engine.js`

- `sendPrivateMessage({ store, conversation, character, text, attachments, voiceReplyEnabled, onVoiceNotice, onStore })`：私聊发送主流程，可透传语音回复开关。
- `requestCharacterReply({ store, conversation, character, userText, mode, event, userMessage })`：构建上下文并调用 OpenAI 兼容接口，`userMessage.attachments` 会在请求前解析为真实模型输入。
- `completePrivateMessageReply({ store, conversation, character, text, userMessage, voiceReplyEnabled, onVoiceNotice, onStore })`：私聊 bot 回复流程；语音模式下保存文字上下文并渲染持久化语音气泡。

请求拼接顺序：

1. 当前角色 system prompt。
2. 知识库 RAG system message。
3. 长期记忆 system message。
4. 最近聊天历史。
5. 当前用户消息。

### `src/js/roundtable.js`

- `sendGroupPlayerMessage({ store, conversation, text, attachments, onStore })`：群聊玩家消息。
- `runRoundtableTurn({ store, conversation, characters, triggerText, triggerAttachments, onStore })`：把玩家消息或提及拆成圆桌事件，串行处理 speaker 队列；纯附件消息用附件摘要触发，并在模型请求中附带真实媒体内容。

发言人选择规则：

- 优先处理 @ 提及。
- 玩家 @ 多个成员或 @ 全体时为每个被点名成员入队强制回复事件。
- 避免连续选择上一位发言者。
- 无提及时在群成员中随机加权选择。
- 玩家 @ 某角色时，被 @ 角色优先回复，回复前缀目标解析为玩家“分析员”，避免 @ 自己。
- 当前群聊 `groupSettings.autoBotChat` 关闭时，无 @ 的普通消息不会自动触发角色接话。
- 当前群聊 `groupSettings.idleTalk` 打开时，UI 会在群聊静默约 45 秒后入队一次空闲圆桌事件。
- bot 回复使用结构化 JSON 解析 `text`、`targetId`、`wantsFollowUp`、`suggestedFollowUpTargetId` 等字段。
- bot-to-bot 后续事件由消息中的有效 @、`wantsFollowUp` 和 `roundtableFollowUpRate` 共同决定。
- `groupSettings.botChainLimit` 限制玩家未介入时的连续机器人回复总量，到达上限前会要求模型把话题交还玩家。

### `src/js/ui.js`

- `initUi()`：重新读取最新本地 store，绑定所有 UI 事件并刷新页面。
- `renderAll()`：刷新会话列表、消息、详情、群聊成员和状态。
- `renderConversationList()`：渲染左侧列表。
- `renderMessages()`：渲染消息流。
- `renderDetail()`：渲染聊天头和桌面右侧详情。
- `handleChatInfoToggle()`：私聊时切换角色卡片，群聊时打开成员与规则侧边面板。
- `closeDetailPane()`：关闭右侧角色卡片并同步移动端返回状态；角色卡片内快速操作会调用该函数收起原窗口。
- `renderGroupMemberPicker()`：渲染单列角色多选列表。
- `openGroupInfoPanel()` / `closeGroupInfoPanel()`：打开/关闭群聊侧边悬浮面板。
- `renderGroupInfoPanel()`：刷新群聊成员宫格、群聊名称、圆桌规则开关和最大人数。
- `renameActiveGroupConversation()`：修改当前群聊 `conversation.title`，通过 `updateGroupConversation()` 持久化并刷新 UI。
- `renderGroupInfoMemberEditor()`：渲染当前群聊成员增减列表。
- `updateMentionPicker()` / `renderMentionPicker()`：根据输入框光标前 `@` token 渲染候选列表。
- `insertMentionText(name, options)`：向群聊输入框插入或替换 `@成员名`。
- `renderMessageText(container, text)`：渲染消息正文并高亮可点击 @ 片段。
- `refreshKnowledgePanel()`：刷新知识库管理 UI。
- `renderKnowledgeChunks(kbId, fileId)`：预览选中文件的分块，限制前 80 块并压缩长文本。
- `renderMemoryNodePanel()`：刷新长期记忆图谱、档案、搜索结果和设置浮层状态。
- `renderMemoryGraph()`：绘制记忆节点 canvas，保留用户拖动后的节点位置。
- `findMemoryNodeAtPoint(point)` / `screenToGraph(x, y)`：记忆图谱点击、拖动和缩放坐标转换。
- `scheduleRoundtableIdle()`：当前群聊启用 `idleTalk` 与 `autoBotChat` 时，静默约 45 秒后触发空闲圆桌接话。

## CSS 结构

`src/styles/app.css` 保留应用主样式；新用户引导拆分为独立公共、桌面横屏和移动竖屏样式：

- 根变量：颜色、间距、尺寸、三栏宽度。
- 主布局：`.app-shell`、`.rail`、`.conversation-list`、`.chat-pane`、`.detail-pane`、`.is-detail-open`。
- 消息 UI：`.message-row`、`.message-content`、`.composer`。
- @ UI：`.mention-popover`、`.mention-row`、`.message-mention`。
- 快速添加菜单：`.quick-create-wrap`、`.quick-create-menu`、`.quick-create-item`。
- 存档窗口：`.archive-shell`、`.archive-layout`、`.archive-sidebar`、`.archive-content`、`.archive-section`、`.archive-webdav-card`、`.archive-config-popover`、`.archive-conflict-overlay`。
- 弹窗：`.modal`、`.modal-shell`、`.settings-layout`。
- 知识库：`.knowledge-workbench`、`.kb-sidebar`、`.kb-main`、`.kb-list`、`.kb-detail`、`.kb-files-panel`、`.kb-chunks-panel`。
- 群聊创建：`.group-editor`、`.group-create-search`、`.member-picker`、`.member-item`、`.group-create-actions`。
- 群聊侧边面板：`.group-info-panel`、`.group-info-shell`、`.group-info-member-grid`、`.group-info-member-editor`、`.toggle-row`、`.group-setting-row`。
- 记忆节点：`.memory-layout`、`.memory-command-panel`、`.memory-graph-wrap`、`.memory-result-panel`、`.memory-archive-popover`、`.memory-settings-popover`、`.memory-node-detail`。
- 响应式：`@media (max-width: 1180px)` 隐藏详情栏，`@media (max-width: 760px)` 切换移动竖屏布局。
- `src/styles/onboarding.css`：欢迎窗、向导、iOS 开关、进度、状态和按钮公共视觉。
- `src/styles/onboarding-desktop.css`：`min-width: 761px + landscape` 双列操作、桌面窗口约束和横屏自绘滚动条。
- `src/styles/onboarding-mobile.css`：`max-width: 760px 或 portrait` 单列操作、可视视口高度、安全区和竖屏自绘滚动条。

## 事件

- `fritia-next-chat-store-updated`：聊天主存储更新。
- `fritia-settings-updated`：模型设置更新。
- `fritia-advanced-settings-updated`：高级设置更新。
- `fritia-knowledge-base-updated`：知识库更新。
- `fritia-long-term-memory-updated`：长期记忆更新。
- `fritia-ui-open-panel`：跨模块请求打开帮助或设置悬浮窗口，可携带设置分组、模型页签和提供商 id。
- `fritia-onboarding-step-changed`：向横屏/竖屏布局模块广播当前向导步骤。
- `fritia-onboarding-closed`：欢迎窗或快速配置向导关闭通知。

## 资源许可记录

- Lucide Icons：ISC License。
- Microsoft Fluent UI Emoji：MIT License。
- 项目自身：保留仓库现有 `LICENSE`。

## 2026-07-02 UI Layout Mapping

- `.message-list`：聊天消息独立滚动容器，带自绘滚动条，底部留出悬浮输入栏空间。
- `.composer`：聊天底部悬浮输入栏，桌面端和移动聊天页固定在聊天主列底部。
- `.rail`：桌面端为左侧导航栏，移动端列表页转为底部悬浮 Tab Bar。
- `.detail-pane`：私聊角色卡片右侧悬浮窗口，与群聊成员侧边窗口保持同类玻璃卡片样式。
- `#detail-close-btn`：关闭私聊角色卡片悬浮窗口。

## 2026-07-02 Group Info Scroll Mapping

- `.group-info-shell`：群聊成员悬浮面板的内部滚动容器，使用 `overflow-y: auto`、`scrollbar-gutter: stable` 和自绘滚动条；直接子块设置为 `flex: 0 0 auto`，避免低高度时被压缩。
- `.group-info-member-list`：群聊成员编辑列表滚动容器，与 `.group-info-shell` 共享滚动条样式。
- `.group-info-editor-toolbar`：群聊成员编辑顶部工具栏，左侧为搜索框，右侧为取消和保存成员图标按钮，sticky 保持可见。
- `.group-info-editor-actions` / `.group-info-action-btn`：群聊成员编辑图标动作区与图标按钮，用于取消或保存成员更改。

## 2026-07-02 Knowledge UI Refinement Mapping

- `.message-row.is-self .message-mention`：用户深色气泡内的浅色 `@` 提及样式。
- `.kb-management-grid`：宽屏知识库文件列表和分块预览等宽双栏。
- `.kb-icon-btn`：知识库操作图标按钮，复用 `src/_logo/icons` 中的 `plus.svg`、`database.svg`、`x.svg`、`trash-2.svg`。
- `#kb-upload-status`：旧上传等待横条保留兼容但隐藏，状态提示转由 `#kb-active-status` 展示。

## 2026-07-02 Settings Save Flow Mapping

- `#memory-settings-save`：保存设置页“长期记忆”配置后关闭 `#settings-panel`。
- `#advanced-save`：保存高级设置和本地化配置后关闭 `#settings-panel`。

## 2026-07-02 Memory Node Mobile Portrait Mapping

- `@media (max-width: 760px) and (orientation: portrait) #memory-node-panel`：记忆节点竖屏专用布局覆盖，限制作用域不影响其他弹窗和横屏模式。
- `.memory-search-console.is-compact-open`：竖屏左下角悬浮实体搜索展开态，沿用旧项目长期记忆模块的交互类名。
- `.memory-result-panel` / `.memory-archive-popover` / `.memory-settings-popover`：竖屏底部浮层，用于搜索结果、记忆档案和长期记忆设置。
