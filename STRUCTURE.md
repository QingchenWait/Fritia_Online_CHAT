# STRUCTURE

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
- `index.html`：左侧导航第三个按钮改为 `data-panel-open="archive-panel"`，图标为 `src/_logo/icons/database.svg`，原导入角色入口保留在加号菜单和详情快捷操作。
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
    ├── js/
    │   ├── main.js
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
        └── app.css
```

## 页面元素映射

### 主框架

- `#app`：应用根节点。移动端通过 `.is-chat-open` 切换列表/聊天视图，桌面端通过 `.is-detail-open` 展开私聊角色卡片。
- `.rail`：桌面左侧导航栏。
- `.conversation-list`：会话、联系人、群聊列表区域。
- `.chat-pane`：聊天窗口区域。
- `.detail-pane`：桌面右侧详情与快捷操作。

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
- `#group-member-search`：好友搜索输入。
- `#group-member-total`：好友总数显示。
- `#group-member-list`：单列好友多选列表。
- `#create-group-btn`：创建群聊按钮，按钮文案显示当前选择数量。
- `#group-info-backdrop`：群聊信息侧边面板背景遮罩。
- `#group-info-panel`：群聊成员与规则侧边悬浮面板。
- `#group-info-member-grid`：当前群成员头像宫格，包含邀请和移出入口。
- `#group-info-name-row`：群聊名称配置行，点击后修改当前群聊标题。
- `#group-info-name-label`：群聊名称配置行右侧当前标题显示。
- `#group-info-member-editor`：当前群聊成员增减编辑区。
- `#group-info-member-search`：侧边面板内好友搜索输入。
- `#group-info-member-list`：侧边面板内所有好友单列多选列表。
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

- `boot()`：启动流程。先加载预置角色，再初始化 UI，最后注册 service worker。

### `tools/static_server.mjs`

- `npm run dev` 使用的无依赖本地静态服务器，默认监听 `127.0.0.1:3000`，为 ES Module、CSS、图片、manifest、文本资源设置基础 MIME 类型。

### `sw.js`

- `CACHE_NAME = 'fritia-next-chat-v2'`：更新离线缓存版本，旧缓存会在 activate 阶段删除。
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
- `renderGroupMemberPicker()`：渲染单列好友多选列表。
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

`src/styles/app.css` 使用单文件样式，主要分区：

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

## 事件

- `fritia-next-chat-store-updated`：聊天主存储更新。
- `fritia-settings-updated`：模型设置更新。
- `fritia-advanced-settings-updated`：高级设置更新。
- `fritia-knowledge-base-updated`：知识库更新。
- `fritia-long-term-memory-updated`：长期记忆更新。

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
