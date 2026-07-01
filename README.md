# Fritia Online NEXT Chat

仿 QQ / Telegram 布局的角色扮演 AI 聊天软件首版。当前版本是静态 PWA，可直接通过 HTTP 服务运行；后续可封装到 Tauri 或 Capacitor，以同一套 HTML/CSS/ES Module 代码支持桌面端和移动端。

## 功能

- 私聊：预置芙提雅、芬妮、琴诺，点击好友即可创建私聊。
- 群聊：可把多个角色拉入“圆桌密语”群聊，群聊调度继承旧项目“圆桌密语”的单角色轮流发言方式。
- 角色导入：支持上传头像、人格设定提示词、示例对话和 TTS 参考语音；保存后角色会出现在好友列表。
- 图片与附件：聊天输入区支持图片和文件附件，本地以 data URL 保存。
- 知识库：继承旧项目的 `fritia_knowledge_base_db` IndexedDB 结构、`fritia_knowledge_base_state` 启用状态、BM25 + CJK 1/2-gram 检索和 RAG 注入方式。
- 长期记忆：继承旧项目 `fritia_long_term_memory` 的文本记忆、关系边、私有 scope 和公共圆桌 scope 组织方式，并提供“记忆节点”图谱界面。
- UI：桌面端横屏三栏布局；移动端竖屏会切换为会话列表和聊天窗口滑入式单栏布局。
- 离线壳层：包含 `manifest.webmanifest` 和 `sw.js`，便于后续作为 PWA 或 WebView 应用使用。

## 运行

如果本机有 Node.js：

```bash
npm run dev
```

如果没有 Node.js，也可以使用 Python：

```bash
python -m http.server 3000 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:3000/
```

不能直接双击 `index.html`，因为预置角色提示词、知识库 JSON 和 ES Module 需要通过 HTTP 加载。

## 模型设置

打开右侧快捷操作或左侧设置按钮，进入“设置 / 大模型”：

- `API Key`：OpenAI 兼容服务密钥，只保存在当前浏览器 `localStorage`。
- `Base URL`：默认 `https://api.openai.com/v1`，也可填 DeepSeek、Qwen、Kimi 等兼容服务。
- `模型名称`：默认 `gpt-4.1-mini`。

未配置模型时，聊天会使用本地占位回复，方便检查 UI 和数据流。

## 角色导入

点击左侧“导入角色”：

1. 填写角色名称和简介。
2. 上传头像图片。
3. 粘贴或从 `.txt/.md` 读取人格设定提示词。
4. 可选填写示例对话。
5. 可选上传 TTS 参考语音。
6. 保存后角色会作为好友出现在列表，可私聊，也可加入群聊。

## 知识库

首次启动会从 `src/_rag_data/chenbai_character_settings_260622.json` 自动导入预置知识库。设置页的“知识库”支持：

- 创建多个知识库。
- 上传 `.txt` / `.md` 文件并自动分块。
- 双击知识库条目切换启用状态。
- 对话请求前自动检索启用知识库并注入参考片段。

## 长期记忆

长期记忆保存在 `localStorage.fritia_long_term_memory`。私聊记忆使用 `private:<characterId>`，群聊公共记忆使用 `public:roundtable`。记忆节点面板提供：

- 关系图谱。
- 实体/关系搜索。
- 未入图谱原文记忆档案。
- 双击搜索结果或档案项可删除对应记忆。

## 资源来源

- 图标：Lucide Icons，下载到 `src/_logo/icons`。
- 表情美术：Microsoft Fluent UI Emoji，下载到 `src/_logo/emoji`。
- 预置角色头像与提示词：`src/_char`。
- 预置知识库：`src/_rag_data`。

## 当前限制

- 这是前端首版骨架，尚未接入真实 TTS 播放、语音录制、服务端同步和端到端加密。
- 浏览器直接调用模型 API 可能受 CORS 限制，需要服务商允许浏览器跨域请求。
- 图片和音频以 data URL 存入浏览器，移动端长期大量使用时应改为 IndexedDB Blob 存储。
