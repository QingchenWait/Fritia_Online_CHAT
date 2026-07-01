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
├── README.md
├── DEVELOP.md
├── STRUCTURE.md
├── LICENSE
└── src/
    ├── _char/
    │   ├── Profile_Adjutant.png
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

- `#app`：应用根节点。移动端通过 `.is-chat-open` 切换列表/聊天视图。
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
- `#send-btn`：发送按钮。
- `#mobile-back-btn`：移动端返回会话列表。

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

- `#group-editor-panel`：群聊成员弹窗。
- `#group-name`：群聊名称。
- `#group-member-list`：角色成员选择器。
- `#create-group-btn`：创建或更新群聊。
- `#roundtable-autoplay-btn`：让群聊角色主动接话。

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
- `#kb-detail-head`：当前知识库说明。
- `#kb-file-list`：文件列表。
- `#kb-chunk-preview`：分块预览。

### 长期记忆

- `#memory-node-panel`：记忆节点弹窗。
- `#memory-node-stats`：记忆和关系数量。
- `#memory-search-input`：实体/关系搜索输入。
- `#memory-search-btn`：搜索按钮。
- `#memory-result-list`：关系搜索结果。
- `#memory-archive-list`：未入图谱原文记忆。
- `#memory-graph-canvas`：记忆关系图谱画布。
- `#memory-node-detail`：选中节点详情。
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
  createdAt,
  updatedAt,
  unread
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

### `src/js/storage.js`

- `loadAppStore()`：读取并规范化聊天主存储。
- `saveAppStore(store)`：保存聊天主存储并派发 `fritia-next-chat-store-updated`。
- `normalizeCharacterRecord(raw)`：规范化角色记录。
- `normalizeConversation(raw)`：规范化会话。
- `normalizeMessage(raw)`：规范化消息。
- `ensurePrivateConversation(store, character)`：确保角色拥有私聊会话。
- `createGroupConversation(store, title, memberIds, characters)`：创建或更新群聊。
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

- `ensurePreloadedKnowledgeBases()`：导入 `src/_rag_data` 预置知识库。
- `listKnowledgeBases()`：列出知识库。
- `createKnowledgeBase(name)`：创建知识库。
- `importFilesToKnowledgeBase(kbId, files)`：导入文本文件。
- `importTextToKnowledgeBase(kbId, fileName, rawText, options)`：把文本分块并保存。
- `rebuildKnowledgeBaseIndex(kbId)`：重建 BM25/CJK 索引。
- `searchKnowledgeBase(query, options)`：检索启用知识库。
- `buildRagReferenceMessage(options)`：生成 OpenAI messages 中的 RAG system 消息。
- `exportKnowledgeBaseArchive()` / `importKnowledgeBaseArchive(archive)`：导出/导入旧项目兼容 archive。
- `getKnowledgeBaseFiles(kbId)` / `getKnowledgeBaseChunks(kbId, fileId)`：UI 查询接口。

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
- `runRoundtableTurn({ store, conversation, characters, triggerText, onStore })`：选择 speaker 并让一个角色接话。

发言人选择规则：

- 优先处理 @ 提及。
- 避免连续选择上一位发言者。
- 无提及时在群成员中随机加权选择。

### `src/js/ui.js`

- `initUi()`：绑定所有 UI 事件并刷新页面。
- `renderAll()`：刷新会话列表、消息、详情、群聊成员和状态。
- `renderConversationList()`：渲染左侧列表。
- `renderMessages()`：渲染消息流。
- `renderDetail()`：渲染桌面右侧详情。
- `refreshKnowledgePanel()`：刷新知识库管理 UI。
- `renderMemoryNodePanel()`：刷新长期记忆图谱和档案。
- `renderMemoryGraph()`：绘制记忆节点 canvas。

## CSS 结构

`src/styles/app.css` 使用单文件样式，主要分区：

- 根变量：颜色、间距、尺寸、三栏宽度。
- 主布局：`.app-shell`、`.rail`、`.conversation-list`、`.chat-pane`、`.detail-pane`。
- 消息 UI：`.message-row`、`.message-content`、`.composer`。
- 弹窗：`.modal`、`.modal-shell`、`.settings-layout`。
- 知识库：`.kb-layout`、`.kb-list`、`.kb-files-panel`、`.kb-chunks-panel`。
- 记忆节点：`.memory-layout`、`.memory-graph-wrap`、`.memory-node-detail`。
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
