# Fritia Online NEXT Chat

## 2026-07-07 Plugin Store / ModelScope MCP

- 会话列表右上角“菜单”现在会打开密集浮动菜单，包含“插件商店”和“访问官网”；“访问官网”通过浏览器新窗口打开 `https://fritia.online`。
- 新增“插件商店”悬浮窗口，桌面端为左侧分类 + 右侧卡片网格，移动端切换为顶部分类和两列 MCP 卡片；角色插件暂留空，MCP 插件页接入魔搭社区 hosted MCP 列表、搜索、分页、详情和服务配置表单。MCP 卡片标题与图标同排展示，简介固定为两行信息。
- “添加插件源 / 魔搭社区”会打开魔搭登录检测窗口；Tauri 桌面端会优先打开独立的魔搭 WebView2 插件源窗口，并通过壳层 `modelscope_fetch` 在该窗口的同源浏览器上下文请求 hosted MCP 接口。检测到登录态后，来源菜单项前显示绿色连接圆点。若浏览器 CORS、登录态或 WAF 限制阻断魔搭 API，会保留错误提示和跳转官方 MCP 页的入口。
- MCP 插件详情页点击“添加到 MCP 服务”后，会请求魔搭远程部署配置，复制标准 `mcpServers` JSON，并自动新建一个启用的 Streamable HTTP MCP 客户端服务。服务配置会同时显示魔搭 schema 字段和部署控制项，包括传输类型、鉴权类型、有效期以及各 MCP 自己声明的环境变量或参数。

## 2026-07-07 Android WebView Shell Fix

- Android v0.3.6 壳层改用系统栏 Insets 给 WebView 根容器加 padding，修复状态栏显示后页面内容仍覆盖到状态栏下的问题。
- Android 系统返回改为先调用前端暴露的 `window.__FRITIA_HANDLE_ANDROID_BACK__`，再由壳层兜底执行 WebView history 或退出 APP；聊天页返回会回到会话 / 角色消息列表，列表页无上级时退出 APP。
- 返回逻辑不再因为输入框获得焦点就直接吞掉返回手势；弹层、群聊信息、角色详情、临时浮层仍会优先关闭。
- 已重新生成 `D:\Models\vibe_coding\fritia_online_next_desktop\chat_v0.3.6\android_arm\dist\FritiaNextChat-v0.3.6-android-arm-signed.apk`，详细构建与验证记录见外部 Android 打包目录的 `BUILD_PROCESS.md`。

## 2026-07-06 Tool Calling / WebMCP / MCP Relay

- 左侧主导航在“记忆节点”和“设置”之间新增“工具调用”入口，可配置 WebMCP 服务端、Streamable HTTP MCP 客户端、Stdio MCP 客户端、权限设置和系统日志。
- 纯网页部署时，聊天头右上角原“视频通话占位”按钮会作为外部工具选择入口，只显示可用的 Streamable HTTP MCP 客户端；打包到 Tauri/Electron/Capacitor/WebView 后可同时显示本地 Stdio MCP。
- 私聊启用外部工具后，会切换到独立的 `tool_chat_engine.js` 流式工具对话流程，消息中展示可折叠“思考中”和合并后的“MCP 调用”状态栏；状态详情保存到聊天历史，但不会写入长期记忆或后续 LLM 上下文。
- 工具模式现在使用多步 agent loop：工具结果返回后会继续允许模型发起后续 MCP 调用，直到任务完成、工具不可用、权限被拒绝、明确失败或达到 50 步保护上限；“我继续处理 / 要我继续吗 / 下一步我会操作”这类中间话术不会直接结束 MCP 流程。达到上限或网络异常后，发送“继续”可从中断点续跑。
- 工具模式回复支持文本以外的输出：图片直接展示，音频显示为可播放语音条，视频显示为可播放视频，其他类型作为可保存附件展示。MCP 工具返回的 `image` / `audio` / `resource` / `resource_link` / `structuredContent`、Relay 捕获到的本轮新建/修改文件，以及结果文本或参数中出现的远程文件 URL / 本地文件路径都会合并到 bot 最后一条回复里；没有可读取数据、可下载 URL 或打包端本地文件桥支持的空占位不会进入最终附件列表。
- 工具调用运行中，当前工具回复旁会显示圆形“停止工具调用”按钮。点击后会中止本轮 LLM / Streamable HTTP / SSE / 开发 relay fetch，并阻止后续 MCP 步骤继续执行；native stdio relay 不支持硬取消时，会在返回后立即停止本轮流程。
- WebMCP 服务端通过 `window.FritiaWebMCP` 和页面内 `#fritia-webmcp-manifest` 暴露角色列表、角色上下文和按角色对话能力，让支持的浏览器 agent 继承本 APP 的人物人格、知识库、长期记忆和默认 LLM 配置。
- 新增 `backend/mcp_relay.mjs`，作为打包客户端可复用的轻量 stdio MCP Relay。启动后默认监听 `127.0.0.1:17373`，前端 Stdio MCP 配置通过 relay 调用本地 MCP Server。
- MCP 客户端 JSON 使用标准 `mcpServers` 配置文本，运行时按 `url` / `command` / `transport` / `type` 识别 Streamable HTTP、SSE 或 stdio；Streamable HTTP 新建、删除兜底和空白保存时不会预置模板，也不会把用户输入改写成内部扁平格式。对 `localhost` / `127.0.0.1` 会做运行时 loopback fallback，不改写存档。
- Windows v0.3.6 Tauri 打包端对 Streamable HTTP MCP 使用原生 HTTP relay，按 JSON-RPC `id` 读取 `application/json` 或 `text/event-stream` 响应；stdio relay 会自动完成 MCP `initialize` / `notifications/initialized` 握手，并在 Windows 上兼容 `npx`、`npm` 等无扩展命令。
- Windows v0.3.6 Tauri 打包端支持按 `F12` 呼出 WebView2 DevTools，并提供通用本地文件读取桥，让 stdio MCP 工具创建/修改的图片、音频、视频和普通文件可以回传到聊天附件。
- 打包端预置隐藏的 `Filesystem` stdio MCP 客户端，服务器配置为 `npx -y @modelcontextprotocol/server-filesystem .`。它不会出现在聊天头 MCP 多选下拉中，但当用户至少选择一个可见 MCP 客户端进入工具模式时会一并激活；网页端只保留该预置配置并始终禁用。
- 权限设置新增“调用工具记录不注入日常对话上下文”和“每次文件写入时都需要授权”。前者会让工具模式历史只在工具模式上下文中使用；后者会在 MCP 工具写入、移动、复制、删除文件前合并列出目标文件并请求授权。
- v0.3.5 调整工具调用 UI：左侧工具入口和聊天头“调用外部工具”按钮统一使用联网下载的 AI Agent 图标；工具窗口移动端 MCP 客户端页、transport 横向页签和 JSON 区域都有自绘滚动条；配置 JSON 输入/预览改为横向滚动且不自动换行。
- 权限设置按“功能 / 权限 / 对话”分组展示，停止按钮移动到当前 bot 工具回复内容下方；工具尚未生成内容时，停止按钮与“正在输入”提示位于工具状态栏下方同一行。
- v0.3.5 追加 UI 修正：权限设置分组内项目改为高级设置式行列表，不再逐项包裹卡片；聊天头角色卡按钮使用联网下载的身份卡图标；MCP 多选下拉顶部显示“可调用 MCP 列表”；MCP 客户端新增、保存配置和系统日志清空按钮按图标/文字要求精简；主侧栏中“工具调用”和“存档备份”位置互换。
- 本次工具调用 UI 修正：激活状态下的语音回复和外部工具按钮在 hover / touch hover 时保持可见；MCP 客户端服务列表拥有独立纵向滚动条，竖屏下至少保留 3 个服务项高度；保存配置按钮补回联网下载的保存图标；工具窗口新增“使用说明”页，渲染 `src/docs/mcp_help.md` 的 Markdown 内容。

## 2026-07-05 Runtime Environment Detection And WebDAV CORS Check

- 新增通用运行环境检测机制，项目启动时会识别当前运行在普通浏览器网页、localhost、本地 file 页面、Tauri、Electron、通用 WebView 或未知环境。
- WebDAV 在普通浏览器/localhost/file 等纯前端环境下启用同步或点击“连接测试”时，会先执行浏览器 CORS 探测。
- 如果 WebDAV 服务商不允许浏览器跨域同步，进度文本会显示：“错误：该 WebDAV 服务商不支持浏览器同步，请更换服务商或下载客户端。”
- 对于部分 WebDAV 服务端返回 `204 No Content` / 空响应时触发的浏览器 Response 构造异常，非 GET 同步请求会按无内容成功响应处理；同步完成后显示“同步成功，时间：YYYY/MM/DD HH:MM”。
- Tauri、Electron 或其他打包 WebView 环境会跳过该浏览器 CORS 探测，交由客户端网络能力处理。

## 2026-07-05 Archive Backup And WebDAV Sync

- 左侧主导航原“导入角色”按钮改为“存档备份”入口，使用与项目一致的 Lucide 图标；v0.3.5 起主侧栏入口改为刷新图标，点击打开“导入和导出存档”悬浮窗口。
- 存档窗口支持导出本地 ZIP 备份，覆盖聊天记录、角色资料、设置、高级设置、知识库、长期记忆、表情包元数据和 IndexedDB 媒体文件。
- 支持导入本客户端导出的 ZIP 备份；导入会覆盖当前本地数据，建议导入前先创建一次备份。
- 新增 WebDAV 同步配置，可填写服务器地址、同步路径、用户名、密码和自动同步间隔。同步时按具体 JSON 数据文件增量上传/下载，不使用 ZIP 包。
- WebDAV 冲突会弹出顶层“存档冲突”窗口，展示本地和云端的上次修改时间、数据大小，并由用户选择上传本地版本或恢复云端版本。

## 2026-07-05 Quick Add Menu

- 会话列表搜索框右侧的 `+` 改为浮动添加菜单，菜单包含“创建群聊”和“导入角色”两个入口。
- “创建群聊”会打开现有创建群聊窗口，并保持全新选择状态；“导入角色”会打开现有导入角色窗口。
- 添加菜单沿用 `src/ui_rules/ui_design_rules.md` 的 Soft UI 风格，使用本地 Lucide SVG 图标、白色半透明背景、圆角、细边框和柔和阴影。

## 2026-07-04 Preset Roles And Time Display

- 新增内置角色：安卡希雅、凯茜娅、里芙、苔丝、肴。头像、人格提示词和 TTS 参考语音均从 `src/_char/<角色>` 对应目录加载。
- 会话列表时间改为当天显示 `HH:MM`，非当天显示 `MM/DD`；消息气泡下方时间改为当天显示 `HH:MM`，历史消息显示 `MM/DD HH:MM`。

## 2026-07-04 Role Card And Image Model Routing

- 角色卡片右侧悬浮窗口的“快速操作”按钮会在打开目标窗口后自动关闭角色卡片，避免两个侧边窗口叠在一起。
- 角色卡片左上角关闭按钮与头像简介卡片之间补充间距，保持和群聊成员悬浮窗口一致的玻璃卡片呼吸感。
- 私聊和群聊的模型请求统一经过 `src/js/llm_request.js`。当消息包含图片且默认对话模型明确不支持图片时，会仅本次请求切换到“默认图像转述模型”；未知模型会先尝试默认对话模型，收到图片不支持错误后再回退到默认图像转述模型。

## 2026-07-02 Advanced Settings And Localization

- “设置 / 高级设置”改为按“上下文与知识库 / 圆桌密语 / 本地化”分组的玻璃卡片行列表，数值胶囊、数字输入和滑块会实时同步显示。
- 高级设置行项目已按旧项目密集表单参考压缩字号、行高、控件高度和间距，保留本项目蓝紫 Soft UI 配色。
- 修复高级设置保存时 Localization 与亲密模式被同步重置的问题；设置页主保存按钮保存后会自动关闭设置窗口，深色主按钮 hover 会保持深色轻微变亮。
- 新增本地化配置：`Localization 强度` 滑块。只有该值为 `1.00x` 且模型名称包含 `deepseek` 时，才显示“亲密模式”开关。
- 亲密模式开启并保存后，私聊和群聊请求会以额外 `user` 消息追加 `src/_queries/deepseek_special_prompt.txt`；条件不满足时不会追加。亲密模式回复会被标记，长期记忆默认不录入，除非在记忆节点设置里开启“允许录入亲密模式内容”。

## 2026-07-02 Long-Term Memory Node Rewrite

- `src/js/long_term_memory.js` 已从旧项目 `js/long_term_memory.js` 重新迁移，恢复旧项目的长期记忆存储、关系抽取、图谱构建、生命周期维护、档案和设置面板机制。
- “记忆节点”面板实际打开、搜索、删除、档案筛选、设置保存和 canvas 图谱绘制改为调用迁移模块，不再走本项目原先的弱版图谱绘制入口。
- 记忆节点 UI 按本项目 Soft UI 规则重绘：顶部操作、搜索、关闭、删除改为图标按钮；设置中的长期记忆开关和亲密内容开关改为 iOS 风格自绘开关；图谱颜色改为本项目蓝紫/冷色体系。

## 2026-07-02 Roundtable Core Refactor

- 群聊模型请求改为圆桌密语专用 `buildRequestBody()`，使用旧项目同类 `messages` 结构、流式读取、JSON 解析、敌意文本过滤和安全回退。
- 群聊新增 3 分钟窗口预算：最大 token 消耗、最大发言次数和自动接话概率在“设置 / 高级 / 圆桌密语”中配置。
- 群聊请求异常会在聊天头右上角按钮组左侧显示感叹号图标，点击后展开带自绘滚动条的错误详情浮层。

仿 QQ / Telegram 布局的角色扮演 AI 聊天软件首版。当前版本是静态 PWA，可直接通过 HTTP 服务运行；后续可封装到 Tauri 或 Capacitor，以同一套 HTML/CSS/ES Module 代码支持桌面端和移动端。

## 功能

- 私聊：预置芙提雅、芬妮、琴诺、安卡希雅、凯茜娅、里芙、苔丝、肴，点击联系人即可创建私聊。
- 群聊：通过单列好友多选窗口创建群聊，群聊头像固定使用 `src/_char/Profile_GroupChat.png`，群聊调度继承旧项目“圆桌密语”的单角色轮流发言与 bot-to-bot 链式接话方式。
- 群聊成员与规则：群聊右上角“群聊成员”会打开侧边悬浮面板，可在当前群聊内修改群聊名称、增减成员、设置自动接话/空闲搭话/Bot 开头 @ 触发、群聊最大人数和玩家未介入时最大互聊次数，不会新建另一个群聊。
- @ 机制：群聊输入框输入 `@` 会弹出成员候选列表，支持键盘选择、点击头像插入 @，bot 回复会按正确回复对象补 @ 前缀，避免角色 @ 自己。
- 表情包：点击聊天输入栏“表情”按钮会打开表情包悬浮窗口，支持上传图片添加表情包，点击表情后按图片消息发送。表情管理窗口可添加、删除表情包，并预留“自动标签”页面。
- 多模型配置：“设置 / 大模型”支持多个 OpenAI Compatible 对话提供商和多个 MiMO 文字转语音提供商，并可分别设置默认对话、默认文字转语音和默认图像转述模型。
- 工具调用：支持 WebMCP 服务端、Streamable HTTP / SSE MCP 客户端和打包端 Stdio MCP Relay；工具调用配置、权限和日志保存在浏览器本地。
- 插件商店：主菜单可打开插件商店，MCP 插件页接入魔搭社区 hosted MCP，支持搜索、分页、详情配置，并可把远程 MCP 配置写入 Streamable HTTP MCP 服务列表。
- 存档备份：左侧“存档备份”窗口可导出/导入 ZIP 全量备份，并可通过 WebDAV 按具体数据文件增量同步到云端。
- 私聊语音回复：私聊聊天头的电话按钮可切换语音回复模式。开启后，bot 会先生成回复文字，再按 MiMO `chat/completions` 音色复刻协议调用默认文字转语音模型生成声音克隆音频，并以语音气泡展示；后台仍保存回复文字供后续上下文使用。
- 角色导入：支持上传头像、人格设定提示词、示例对话和 TTS 参考语音；保存后角色会出现在好友列表。
- 图片与附件：聊天输入区支持图片和文件附件，大体积媒体通过 IndexedDB 持久化，聊天主存储只保存轻量引用。
- 知识库：继承旧项目的 `fritia_knowledge_base_db` IndexedDB 结构、`fritia_knowledge_base_state` 启用状态、BM25 + CJK 1/2-gram 检索和 RAG 注入方式，设置页提供知识库启用/删除、文件上传/删除和按文件分块预览。
- 长期记忆：继承旧项目 `fritia_long_term_memory` 的文本记忆、关系边、私有 scope 和公共圆桌 scope 组织方式，并提供左侧搜索/详情、中间可缩放图谱、悬浮搜索结果/档案/设置的“记忆节点”界面。
- UI：桌面端横屏为导航、会话列表和聊天主窗口布局，列表与聊天区之间可拖拽调整宽度并记忆；私聊默认不显示右侧角色卡，点击右上角角色卡片按钮后展开。移动端竖屏会切换为会话列表和聊天窗口滑入式单栏布局，并支持左侧边缘右滑返回上一层页面。
- 离线壳层：包含 `manifest.webmanifest` 和 `sw.js`，便于后续作为 PWA 或 WebView 应用使用；HTML/JS/CSS/JSON 使用 network-first 缓存策略，避免更新后继续加载旧代码。

## 运行

如果本机有 Node.js：

```bash
npm run dev
```

然后打开：

```text
http://127.0.0.1:3000/
```

不能直接双击 `index.html`，因为预置角色提示词、知识库 JSON 和 ES Module 需要通过 HTTP 加载。

## 部署

本项目是静态站点，统一通过 `npm run build` 生成 `dist/`。构建产物会自动包含 `.nojekyll`，确保 GitHub Pages 正常发布 `src/_char`、`src/_logo`、`src/_rag_data` 等下划线目录。

### GitHub Pages

1. 将仓库上传到 GitHub，并推送到 `main` 或 `master`。
2. 在仓库 `Settings / Pages` 中把 Source 设为 `GitHub Actions`。
3. `.github/workflows/deploy-pages.yml` 会自动运行 `npm run check`、`npm run build`，并把 `dist` 发布到 GitHub Pages。

也可以在 Actions 页面手动运行 `Deploy GitHub Pages` workflow。

### Cloudflare Pages

在 Cloudflare Pages 中选择 `Connect to Git` 并链接该 GitHub 仓库：

- Framework preset：`None` 或静态站点。
- Build command：`npm run build`
- Build output directory：`dist`
- Node.js：使用仓库 `.nvmrc` 中的 `22`。

仓库根目录的 `wrangler.toml` 已声明 `pages_build_output_dir = "dist"`，用于 Cloudflare Pages 识别同一构建产物。

## 模型设置

打开右侧快捷操作或左侧设置按钮，进入“设置 / 大模型”：

- “对话”：可新增多个 OpenAI Compatible 提供商源，每个源包含 `ID`、`API Key`、`API Base URL` 和模型名称。
- “文字转语音”：可新增多个 MiMO TTS 提供商源，每个源包含 `ID`、`MiMO TTS API Key`、`Base URL`、TTS 模型名称和语音速度。默认模型为 `mimo-v2.5-tts-voiceclone`，语音复刻请求使用 `chat/completions`、`api-key` 请求头、`messages + audio.voice` 结构。
- “默认模型”：可指定默认对话模型、默认文字转语音模型和默认图像转述模型。桌面端显示在模型连接页下方，移动端作为同级标签页进入。
- 图片请求路由：当一次私聊或群聊请求包含图片，而默认对话模型明确不支持图片时，会自动改用“默认图像转述模型”处理这一次请求；普通后续对话仍回到默认对话模型。
- 模型页的提供商选择和默认模型选择使用自绘下拉菜单，桌面端详情区可直接用垃圾桶图标删除当前提供商源。

旧版本保存的 `API Key`、`Base URL` 和模型名称会在读取设置时自动迁移为一个“对话”提供商源。

未配置模型时，聊天会使用本地占位回复，方便检查 UI 和数据流。

## 工具调用

点击左侧“工具调用”按钮打开配置窗口：

- “MCP 客户端”：新增或编辑服务器，填写标准 `mcpServers` 服务器配置 JSON。网页端可使用 Streamable HTTP / SSE；打包端可同时使用 Streamable HTTP / SSE 和 stdio。Streamable HTTP 的“服务器配置 JSON”默认保持空白，用户需要自行粘贴真实配置。
- “MCP 服务端”：启用后页面会暴露 `window.FritiaWebMCP`，外部浏览器 agent 可读取 manifest 或调用角色工具。
- “权限设置”：按“功能 / 权限 / 对话”分组，可设置默认调用级别、是否每次手动授权、是否允许远程 HTTP MCP 和本地 Stdio MCP、工具记录是否隔离于日常上下文，以及文件写入/删除是否每次额外授权。保存权限设置后工具调用窗口会关闭。
- “系统日志”：记录调用来源、工具名、参数、结果、时间和状态。
- “使用说明”：只读渲染 `src/docs/mcp_help.md`，支持分级标题、列表、行内代码、代码块、表格和 URL 图片。

推荐直接粘贴标准 MCP 客户端配置。保存后，配置框会保存你填写的标准 JSON 文本，不会改写成 APP 内部格式；如果 JSON 为空、格式错误或缺少 `url` / `command`，运行时会报错而不是自动套用模板。

启用工具后，私聊会进入独立的工具对话流程。模型可以在同一轮回复中连续执行多个 MCP 工具步骤；如果模型先输出了“我继续帮你处理”“下一步我会点击”等中间文本，APP 会继续推进工具调用，而不是把这句文本当成最终回复。连续 MCP 调用会合并显示在同一个折叠框里，展开后可逐条查看参数和结果。工具运行中的日志和消息增量只刷新相关区域，不会反复刷新联系人头像和聊天主框架。运行中可点击当前 bot 工具回复下方的圆形停止按钮中止本轮工具流程；未生成文字时停止按钮会与输入中提示同排显示。最终回复会写入长期记忆，但不会生成知识图谱节点；工具 trace 只保存到该条聊天记录中。

如果 MCP 工具返回图片、音频、视频、resource、resource_link、structuredContent 或 file-like content，APP 会把可查看或可保存的内容作为 bot 最终回复附件展示。打包端 stdio Relay 和开发用 `backend/mcp_relay.mjs` 会在 `tools/call` 前后记录配置 `cwd` 内的新建/修改文件，并把可读取文件随响应回传；远程 `http(s)` 文件 URL 会直接用于预览，用户点击保存时会优先拉取真实数据写入选择目录，若跨域限制导致无法读取则保留直接下载链接。`.log`、常见临时文件和确实没有可保存数据的空占位不会进入附件列表。

权限设置中的“默认调用级别”和“工具调用前需要手动授权”会直接决定实际授权流程：设置为“允许已启用 MCP”且关闭手动授权时，不会每次弹出确认框。

工具流程最多连续执行 50 步。若因为网络、模型输出、用户点击停止或达到上限中断，消息 trace 会保存续跑状态；用户发送“继续”即可让工具模式从上次中断点继续处理。

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

Playwright MCP 的 HTTP 端口有 Host 检查，官方启动日志通常打印 `http://localhost:<port>/mcp`。如果写成 `127.0.0.1`，部分版本会返回 `403 Access is only allowed at localhost:<port>`；本 APP 会在运行时对 `localhost` 和 `127.0.0.1` 做同机 fallback，但推荐仍按 MCP 服务端打印的 URL 填写。

Legacy SSE transport 可显式声明 `transport`：

```json
{
  "mcpServers": {
    "sse-server": {
      "transport": "sse",
      "url": "http://localhost:8931/sse"
    }
  }
}
```

或 stdio：

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx.cmd",
      "args": ["-y", "your-mcp-server-package"],
      "env": {},
      "cwd": ""
    }
  }
}
```

打包端内置隐藏的 Filesystem 客户端使用以下配置，网页端仅保留该预置内容且保持禁用：

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

历史版本保存过的扁平配置仍可读取，但新建和保存不会再生成扁平 JSON。若工具列表读取失败，先确认 MCP 服务进程正在监听对应地址；纯网页端还需要 MCP HTTP 服务允许浏览器 CORS，打包端会走原生 HTTP relay 并携带 `Mcp-Session-Id`。

Stdio 配置会由 relay 自动初始化 MCP Server。Windows 下可以直接写 `"command": "npx"`；relay 会用通用 Windows shell 包装启动 `.cmd` / 无扩展命令，不需要把配置写死成某个 MCP 工具专用格式。

Stdio Relay 可在打包壳层里启动，也可开发时单独运行：

```bash
node backend/mcp_relay.mjs
```

默认地址为：

```text
http://127.0.0.1:17373/mcp
```

## 角色导入

点击会话列表搜索框右侧 `+`，在浮动添加菜单中选择“导入角色”；也可以点击左侧“导入角色”：

1. 填写角色名称和简介。
2. 上传头像图片。
3. 粘贴或从 `.txt/.md` 读取人格设定提示词。
4. 可选填写示例对话。
5. 可选上传 TTS 参考语音。
6. 保存后角色会作为好友出现在列表，可私聊，也可加入群聊。

## 群聊

点击会话列表搜索框右侧 `+`，在浮动添加菜单中选择“创建群聊”进入窗口：

- 在搜索框中筛选好友。
- 在单列好友列表中勾选多个角色。
- 底部按钮会显示当前选择数量，至少选择 2 位好友后可创建群聊。
- 已创建的群聊点击聊天头右上角“群聊成员”按钮，会在右侧打开成员与圆桌规则面板。
- 点击面板中的“群聊名称”可修改当前群聊标题，保存后会同步到聊天头和会话列表。
- 圆桌规则支持配置自动接话、空闲搭话、Bot 开头 @ 触发、最大人数和 bot-to-bot 最大连续回复次数。
- 点击面板中的 `+` 或 `-` 可展开当前群聊成员编辑列表，保存后直接更新当前群聊。
- 群聊输入框输入 `@` 后选择成员即可插入提及；发送 `@成员名` 会优先由该角色回复。

## 知识库

首次启动会从 `src/_rag_data/chenbai_character_settings_260622.json` 自动导入预置知识库。设置页的“知识库”支持：

- 创建多个知识库，并在详情区启用、停用或删除当前知识库。
- 上传 `.txt` / `.md` 文件并自动分块。
- 文件列表显示分块数和更新时间，支持删除单个文档并重建索引。
- 点击文件可在右侧预览对应文档的分块内容，默认限制前 80 个分块并压缩长文本。
- 对话请求前自动检索启用知识库并注入参考片段。

## 长期记忆

长期记忆保存在 `localStorage.fritia_long_term_memory`。私聊记忆使用 `private:<characterId>`，群聊公共记忆使用 `public:roundtable`。记忆节点面板提供：

- 可缩放、可拖动画布和单个节点的关系图谱，点击节点查看详情。
- 可折叠搜索控制台和悬浮搜索结果，支持删除关系边。
- 记忆档案浮层，支持按孤立、全部、私有和圆桌公共过滤并删除原文记忆。
- 设置浮层，可配置启用状态、保留天数、屏蔽关键词和亲密内容采集。

## 资源来源

- 图标：Lucide Icons，下载到 `src/_logo/icons`。
- 表情美术：Microsoft Fluent UI Emoji，下载到 `src/_logo/emoji`。
- 预置角色头像与提示词：`src/_char`。
- 预置知识库：`src/_rag_data`。

## 当前限制

- 这是前端首版骨架，尚未接入语音录制、服务端同步和端到端加密。
- 浏览器直接调用模型 API 可能受 CORS 限制，需要服务商允许浏览器跨域请求。
- 大体积媒体已迁移到 IndexedDB；浏览器仍可能按站点配额限制长期大量媒体存储。
- WebDAV 同步在纯前端浏览器环境中需要服务器允许浏览器跨域请求；启用同步和连接测试会先做 CORS 探测。ZIP 和 WebDAV 数据目前不加密，配置和 API Key 会随本地备份数据保存。

## 2026-07-02 UI Layout Fix

- 桌面端聊天记录区独立滚动，底部输入栏为悬浮胶囊卡片，不会被长聊天记录挤出窗口。
- 移动端竖屏列表页底部保留聊天、好友、导入、记忆节点和设置入口，进入聊天页时自动收起以避免遮挡输入栏。
- 私聊右上角“角色卡片”会打开与群聊成员面板一致的右侧悬浮窗口。

## 2026-07-02 Knowledge UI Refinement

- 深色用户聊天气泡内的 `@` 提及改为浅色胶囊，提升可读性。
- 知识库文件列表和分块预览在宽屏下改为等宽双栏。
- 知识库创建、启用/停用、删除知识库和删除文档按钮改为图标按钮；上传等待横条不再显示。

## 2026-07-02 Settings Save Flow

- “长期记忆”和“高级设置”保存后会自动关闭设置悬浮窗口，保存成功后不再停留在设置面板内。

## 2026-07-02 Memory Node Mobile Portrait

- “记忆节点”窗口在移动端竖屏下继承旧项目布局：顶部栏压缩、节点详情置于上方、图谱占据主区域，实体搜索改为左下角可展开悬浮胶囊。
- 搜索结果、记忆档案和长期记忆设置在竖屏下作为底部浮层展示，避免遮挡主图谱操作区。

## 2026-07-02 Sticker Packs

- 聊天输入栏新增表情包悬浮窗口，桌面端按窗口宽度在每行 4-6 个表情之间自适应且不出现横向滚动，移动竖屏每行最多 5 个表情并与输入框同宽。
- 上传的表情包以原图 data URL 保存；缩略图显示时统一为正方形，宽高比大于 1.2:1 的图片仅在窗口内中心裁剪。
- 发送表情包时仍发送原图，但聊天前台按原图比例缩略显示，短边与表情包窗口中的正方形表情格一致；纯表情消息不会渲染空文本行。
- 新增“表情包管理”窗口，复用设置页布局，包含“表情管理”和预留的“自动标签”分区。
