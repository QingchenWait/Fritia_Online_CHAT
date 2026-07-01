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
- 新增 `package.json`，提供 `npm run dev` 和 `npm run check` 脚本；当前开发机未检测到 Node/npm，可用 Python HTTP 服务替代运行。

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
- 群聊：沿用“圆桌密语”的核心对话方式，即每轮只选择一个 bot，模型请求只扮演当前发言角色，可处理 @ 提及和角色间接话。

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
- bot 接话入口：`runRoundtableTurn()`。
- 发言人选择会考虑 @ 提及、上一位发言者和随机权重。
- 每次模型请求只传当前 speaker 的人格设定。

### `src/js/ui.js`

新增全部 DOM 绑定和渲染：

- 会话列表、好友列表、群聊列表。
- 消息窗口和附件预览。
- 角色导入表单。
- 群聊成员选择。
- 设置页。
- 知识库管理页。
- 长期记忆节点画布。

## 运行与验证

已执行：

- 下载 `src/_logo` 下 28 个开源图标/表情资源。
- 检查 HTML 重复 id：未发现重复。
- 检查 ES Module 相对导入目标：未发现缺失。

未执行：

- `npm run check` 未能执行，因为当前 PowerShell 环境找不到 `node` 和 `npm`。

替代验证：

- 可通过 `python -m http.server 3000 --bind 127.0.0.1` 启动静态服务进行浏览器验证。

## 下一步

- 接入真实 TTS：使用角色 `voiceSample` 作为参考音频字段，增加 TTS provider 设置和播放队列。
- 把图片/音频附件从 localStorage data URL 迁移到 IndexedDB Blob，降低移动端 localStorage 压力。
- 增加导出/导入 ZIP，覆盖聊天、角色、知识库、长期记忆。
- 增加 Playwright 截图检查，覆盖桌面横屏和移动竖屏。
- 选择 Tauri 或 Capacitor 壳层并补充原生权限配置。
