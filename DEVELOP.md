# DEVELOP

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
