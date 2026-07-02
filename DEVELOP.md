# DEVELOP

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

- 预置角色：芙提雅、芬妮、琴诺头像和人格提示词。
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

- 会话列表、好友列表、群聊列表。
- 消息窗口和附件预览。
- 角色导入表单。
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

- 接入真实 TTS：使用角色 `voiceSample` 作为参考音频字段，增加 TTS provider 设置和播放队列。
- 把图片/音频附件从 localStorage data URL 迁移到 IndexedDB Blob，降低移动端 localStorage 压力。
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
