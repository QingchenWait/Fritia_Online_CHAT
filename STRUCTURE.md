# STRUCTURE

更新时间：2026-07-01

本文记录当前插件完整文件结构、内部 API、页面元素映射和主要函数职责。

## 文件结构

```text
fritia_online_next_chat/
├── index.html
├── manifest.webmanifest
├── package.json
├── sw.js
├── tools/
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
    │   │   └── fritia_prompt.txt
    │   ├── Fenny/
    │   │   ├── Profile_Fenny.png
    │   │   └── char_fenny_prompt.txt
    │   └── Cherno/
    │       ├── Profile_Cherno.png
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
- `.conversation-list`：会话、好友、群聊列表区域。
- `.chat-pane`：聊天窗口区域。
- `.detail-pane`：桌面右侧详情与快捷操作。

### 会话列表

- `#conversation-search`：搜索会话、好友和群聊。
- `[data-list-tab="chats"]`：显示全部会话。
- `[data-list-tab="friends"]`：显示角色好友。
- `[data-list-tab="groups"]`：显示群聊。
- `#conversation-list`：列表渲染容器。
- `#conversation-item-template`：列表项模板。

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
- `#api-key`：模型 API Key。
- `#base-url`：模型 Base URL。
- `#model-name`：模型名称。
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
- `normalizeSettings(raw)`：规范化模型设置。
- `normalizeAdvancedSettings(raw)`：规范化高级设置。

### `src/js/characters.js`

- `ensurePresetCharacters()`：读取预置角色头像与提示词，写入主存储并创建私聊。
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

- `sendPrivateMessage({ store, conversation, character, text, attachments, onStore })`：私聊发送主流程。
- `requestCharacterReply({ store, conversation, character, userText, mode, event })`：构建上下文并调用 OpenAI 兼容接口。

请求拼接顺序：

1. 当前角色 system prompt。
2. 知识库 RAG system message。
3. 长期记忆 system message。
4. 最近聊天历史。
5. 当前用户消息。

### `src/js/roundtable.js`

- `sendGroupPlayerMessage({ store, conversation, text, attachments, onStore })`：群聊玩家消息。
- `runRoundtableTurn({ store, conversation, characters, triggerText, onStore })`：把玩家消息或提及拆成圆桌事件，串行处理 speaker 队列。

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
- `renderGroupMemberPicker()`：渲染单列好友多选列表。
- `openGroupInfoPanel()` / `closeGroupInfoPanel()`：打开/关闭群聊侧边悬浮面板。
- `renderGroupInfoPanel()`：刷新群聊成员宫格、圆桌规则开关和最大人数。
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

## 2026-07-02 Knowledge UI Refinement Mapping

- `.message-row.is-self .message-mention`：用户深色气泡内的浅色 `@` 提及样式。
- `.kb-management-grid`：宽屏知识库文件列表和分块预览等宽双栏。
- `.kb-icon-btn`：知识库操作图标按钮，复用 `src/_logo/icons` 中的 `plus.svg`、`database.svg`、`x.svg`、`trash-2.svg`。
- `#kb-upload-status`：旧上传等待横条保留兼容但隐藏，状态提示转由 `#kb-active-status` 展示。
