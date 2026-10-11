# DEVELOP

## 2026-10-11 v1.1.0 分享 PNG 原生保存修复（缓存 v53）

- PNG 原路径优先使用 showDirectoryPicker，触发 WebView2 敏感目录限制；Android 未接入 SAF，且原桥硬编码 application/zip。现在优先复用 ZIP 原生保存桥，浏览器仅使用 showSaveFilePicker 或下载回退；文件名可在系统窗口修改，默认保存时本地时间 `海姆休息室_YYMMDD_HHMMSS.png`。
- archive_io.js 抽出 chooseFileDestination，ZIP 入口与既有命令调用参数保持；仅 PNG 传 image/png。Windows optional mime 限定 ZIP/PNG，保留原路径一次性授权、覆盖确认及取消流程；Android 同样限定 MIME 并沿用 128 KiB 顺序分块/偏移确认/close 完成校验。取消不写入，失败不显示成功。
- 未更改图片生成、尺寸、UI 布局、剪贴板、存储结构和公共版本。规范原生源码位于 tools/native；重新打包时需同步进入外部 Windows/Android 壳体，旧 APK/EXE 无法仅通过网页代码获得新桥能力。构建与原生系统窗口验收记录放在外部 chat_v1.1.0 的 BUILD_PROCESS.md / validation 目录。
- tools/archive_export.test.mjs 新增 5 项 PNG 回归：默认名称、原生优先与重命名路径、Android 图像分块字节完整性、取消/失败、网页版 PNG 类型及写入中止。既有 4 项 ZIP 回归继续通过；对话管理浏览器保存桩改用可重命名的文件保存选择器。

## 2026-10-11 v1.1.0 旧版 WebView dvh 高度补丁

- 仅向 `chat-scroll-desktop.css` / `chat-scroll-mobile.css` 追加 `@supports not (height: 100dvh)` 规则。桌面回退主窗口/聊天区高度；窄屏回退主窗口/会话列表/聊天区及输入框 max-height，使用 vh 和既有 --chat-viewport-height。限定聊天布局，不泛化替换其他窗口中的 dvh。
- 支持 dvh 时新规则不参与层叠，既有规则原样保留；不新增 JS、监听器、持久化字段或 UI，不修改问题 2 的视口测量/缓存/恢复逻辑。版本仍 1.1.0，未打包。
- 复用已有 CSS 入口及 SW 核心资源，沿用 network-first 更新策略，缓存仍 v52。`tools/dvh_fallback_browser.mjs` 比较支持环境中启用/移除补丁前后的全部 APP 元素计算样式与位置，并在隔离 CSS 解析模拟中复核旧内核下长会话列表的输入栏可见性。
- 验证通过：支持 dvh 的 320×568、390×844、760×700、761×700、844×390、1440×900、3840×2160，每组 563 个 APP 元素的全部计算样式和矩形坐标逐项一致；4 组不支持单位的解析模拟覆盖窄屏/宽屏、有/无 VisualViewport、空私聊/群聊、40 条额外会话和视口缩小，并先移除补丁复现输入栏越界，再恢复补丁确认可见。既有 test:chat-scroll 7 组视口通过；语法、git diff --check 及生产变更范围检查通过。未在真实旧版 Android WebView 或 APK 上验证。


## 2026-10-10 v1.1.0 对话删除确认窗口（缓存 v52）

- 标题改为加粗“对话删除确认”，通过 conversation-delete-title 标注 dialog；原数量提示仍保留。取消/确认按钮局部 inline-flex、nowrap，让图标与文字同排，不改通用按钮样式。
- 删除确认覆写移动 .modal 的 stretch 为 center，卡片 height:auto；桌面与移动独立 CSS 保留可视区域边距，仅正文在矮屏滚动，关闭和操作按钮固定。未改变删除逻辑、分享或其他弹窗，版本仍 1.1.0，未打包。
- 验证：既有对话管理浏览器回归通过，新增 1440×900、390×844、320×568、844×390、1024×280 的标题、上下留白、底部无拉伸空白及按钮图文中心对齐检查；桌面/手机截图完成视觉核对。SW 7 项、脚本语法与 git diff --check 通过。


## 2026-10-10 v1.1.0 私聊对话管理（版本不变，缓存 v51）

- 按 `.agents/fritia_chat_dev_agent.md` 与 UI 规范接入角色卡片快速操作；管理状态只存在运行期。消息列表委托捕获点击与键盘多选，附件下载、语音播放、工具面板和链接在管理选择期间不会意外触发。底部输入栏整体隐藏，固定提示与删除/分享/X 代替原操作；群聊入口不变。
- `conversation_management_data.js` 基于原始存储做精确 ID 删除，避免全存储规范化和图谱重建。只处理当前私聊，其他消息桶、角色、会话、未知字段原样保留。记忆来源必须全部属于选中 ID，scope/角色匹配；现有 extractor 将 private 源规范为 daily。跨会话重号、未知来源、未选中引用、共享边及元数据引用均保留；共享关系连同其全部来源记忆保留，不做语义拆分。
- 保存记忆和聊天前校验原始快照；聊天写入失败回滚记忆，之后才通知 UI 和清理媒体。文件扫描涵盖嵌套工具结果、全部消息/角色/会话、长期记忆及所有其他 localStorage 数据；IDB 打开后再次同步核对引用。共享、损坏的归属信息或清理失败时保留文件。只删除 APP 媒体库明确独占记录，不删除磁盘路径、知识库、云端或存档副本。运行中的回复/语音生成/工具流程阻止删除，避免旧快照复写。
- 本地 html-to-image 1.11.13（MIT）复用现有 DOM/Markdown/语音气泡，通过浏览器原生 foreignObject 排版保留中文字体基线、Grid/Flex 对齐；SVG 白色滤镜先栅格化。导出时恢复用户行 margin-left:auto，左右头像外缘均只留 20 CSS 像素，修正文字向右下偏移与右侧空白。远程图片先检查 CORS，图片读取失败明确报错。默认 768×432（16:9），768 像素画布分段渲染、fflate Zlib 与 PNG Sub filter 增量编码一张 PNG，无人为高度截断；最终仍受设备内存及图片解码能力约束。
- 公共样式、桌面/移动布局 CSS 与各自交互模块独立；固定标题和预览自绘滚动条，矮屏确认正文滚动，安全区/VisualViewport/Esc/焦点循环。目录/文件选择与图片剪贴板使用前端 Web API 或现有 Tauri 插件；不具备能力的环境明确下载回退/复制失败。现有 ZIP 专用原生桥不冒用为 PNG 保存桥；未新增后端、未改原生源码、未打包。
- 文档：README、STRUCTURE、帮助 1–7、vendor 依赖来源与哈希同步维护。Lucide 图标来源固定官方 npm 包 0.468.0（ISC）。MoeTalk 用户给定仓库与根 package.json 联网未取得可用内容，因此没有复制其代码或声称使用其规则。
- 验证：`npm run check`、`git diff --check`；`test:conversation-management` 7 项（含写入失败回滚、重号拒绝、共享/未知关系保留及 40,000 高 PNG 编码）；`test:conversation-management:browser` 在 1440×900 / 390×844 完整操作，另验证 320×568、760×360、1024×280、1280×720、1536×864、1920×1080、2560×1440、3840×2160 布局。PNG 像素检查验证原图存在、文字基线、用户头像右侧留白与最后消息；实测短图 768×432、复合消息图 768×1136、24 段长图 768×9648。目录保存/剪贴板使用受控接口验证，取消、导航与刷新均覆盖；SW 7 项与既有聊天滚动 7 组视口通过。使用本机 Playwright/Chromium，独立上下文，无真实模型调用、未运行原生实机或打包。


## 2026-10-09 v1.1.0 撤回 DeepSeek JSON 方案、恢复兜底

- 用户真实界面确认上一方案导致正常对话出现“DeepSeek 未返回约定的最终回复 JSON”。此前模拟测试只证明预设 JSON 成功路径，不能证明真实模型总遵守该约定；该方案已撤回。版本仍为 1.1.0，未打包。
- 删除强制 json_object、reply 字段解析及空正文/非 JSON 流式载荷的新增拒绝条件。普通正文、模型自行返回的 JSON、原始 JSON 响应兜底和非 JSON 文本兜底恢复；真正 HTTP / API error 仍按原规则处理，不把它们伪装成成功。
- 官方 DeepSeek thinking=max 请求改用原生 stream=true；读取 delta.content 与 delta.reasoning_content 各自字段。请求端仅保留直接作答、避免自我复盘的自然语言约束，保留用户明确要求的分析/评论和既有群聊/工具格式，不加入关键词删句、思考降档、生成截断或额外模型调用。
- 兼容服务端忽略流式参数后返回普通 JSON，也兼容 JSON 响应头下的原始文本。空 JSON 正文继续返回完整原始响应；极限档纯思考 SSE 返回已有字段组成的可用响应兜底，避免只剩新增的格式报错。原始兜底可含思考信息，这是用户要求保留的既有兼容行为，不能宣称兜底时已保证不含思考。
- 修改不涉及角色、特殊模式源提示词、历史消息、设置字段、其他模型/档位或持久化版本。SW 升为 v50，更新同名模块，防止旧 JSON 解析代码继续加载。
- 6 项针对性单元和桌面 1440×1000 / 手机 390×844 回归通过，覆盖特殊模式开关、原始文本、无 reply 的 JSON、误标 JSON 的文本、非 JSON SSE、空 JSON / SSE 兜底、独立思考字段、刷新和无新增格式错误；既有思考协议 9 项与 Grok 单元 5 项通过。验证为受控响应，未调用真实收费接口。此次已修复人为 JSON 报错回归；原始偶发点评是否在官方 content 内生成，仍需原始响应判断，原生流式与提示约束不构成零概率保证。

## 2026-10-09 v1.1.0 DeepSeek 极限档正文与思考边界（JSON 方案已撤回）

- 用户确认模型为官方 `deepseek-flash / https://api.deepseek.com/v1`，特殊模式开关均可能发生。请求的 `thinking.type=enabled / reasoning_effort=max` 与官方文档一致，正常 JSON/SSE 读取没有直接拼接 reasoning_content。截图不足以确定该次原始响应的字段归属；特殊模式中要求展示计划/分析/反思的指令属于潜在诱因，不能作为关闭该模式时问题的唯一解释。
- 确认一处协议隐患：普通 JSON 响应正文为空时会返回 JSON.stringify(整个响应)，可能连同 reasoning_content 展示。极限档修复此兜底；流式格式异常也不再将未解析的载荷拼入正文。错误提示不携带原始思考文本，不扫描或删除历史消息。
- `deepseek_reply.js` 仅对官方 api.deepseek.com 的 DeepSeek thinking=max 请求添加系统级输出通道约定。普通私聊通过官方 `response_format: {type:'json_object'}` 请求只有 reply 一个字段的回复；完整思考保持在 reasoning_content，客户端只做字段解析与结构验证，不做关键词/正则删句，不降低思考强度，不设置 max_tokens，不截断生成内容，也不增加第二次模型请求。
- JSON 回复缺失、空值、额外字段或无效格式按本轮协议错误处理，不回退显示原始包。用户明确要求的分析/点评属于正式回复，保持原文本；原角色设定、特殊模式提示词文件、存储结构、其他档位、其他提供商及已有工具/群聊 JSON 格式均不改写。
- 官方依据：[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode) 规定正文与思考独立字段；[JSON Output](https://api-docs.deepseek.com/guides/json_mode) 支持 json_object 并要求提示词包含 json 与格式示例。没有使用未文档化的“关闭返回思考”参数；极限思考时 API 原始包仍可包含独立思考字段，本次约束的是给用户的正文。
- 版本保持 1.1.0；SW 升为 v49，新增模块加入离线资源。新增 6 项协议回归和桌面 1440×1000 / 手机 390×844 浏览器验证，覆盖原档位、特殊模式开关、原始回复字段、思考独立存储、普通点评保留、空正文/异常 SSE、原格式不变和刷新。既有思考协议 9 项与 Grok 单元 5 项通过。模型响应均为受控夹具，未调用真实收费接口；因此不将测试结果表述为真实官方模型随机问题的统计复现或零概率保证。未做打包。

## 2026-10-09 v1.1.0 Grok、模型元数据兼容与失败轮次隔离

- 遵循 `.agents/fritia_chat_dev_agent.md` 和 UI 规则，版本保持 `1.1.0`，SW 升为 `v48`。仅修改模型配置/请求、发送错误处理、失败轮次及相关文档和回归；未运行 build、原生客户端或打包。
- Grok 预设为 `Grok / https://api.x.ai/v1 / grok-4.7`，获取网站为 `https://console.x.ai/`。X 图标从 [Simple Icons](https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/x.svg) 下载，沿用现有 Logo 尺寸与单色样式，资源项目使用 CC0。聊天模型入口复用现有两端菜单、滚动条与思考进度段，群聊采用独立的临时 `group:<conversation-id>` 运行键，不改配置字段。
- 核对 xAI 官方 [思考参数](https://docs.x.ai/developers/model-capabilities/text/reasoning.md)、[Chat Completions](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions.md)、[图片](https://docs.x.ai/developers/model-capabilities/images/understanding.md)、[STT](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text.md) 和 [函数调用](https://docs.x.ai/developers/tools/function-calling.md)：Grok 4.7 / 4.6 支持 low/medium/high/xhigh、默认 high、不可禁用；4.5 不提供 xhigh。Grok 4 请求清理不接受的 presence_penalty / frequency_penalty / stop，不截断 LLM 输出。
- `grok_inputs.js` 仅对官方 api.x.ai 做音频 / 视频适配：音频使用 `/stt` + `grok-voice-transcribe-2.0`，multipart 的 file 位于最后，认证仍发送给配置的同一端点；最多缓存 8 个转写 Promise，失败移除。视频使用浏览器解码、最多 12 个均匀取样画面（不处理音轨），附时间点并缩放至 768 边长；读取失败显式报错。PDF/Office 继续复用现有本地解析。视频测试采用 WPT 的有效 VP8 文件及 BSD-3-Clause 许可，没有引入运行时媒体库。
- 截图中的 `metadata?.capabilities?.includes is not a function` 来自模型元数据能力字段为对象。新增类型检查兼容数组、字符串、明确的对象布尔/支持字段及缺失/异常值；未知能力不臆测档位。`commitOutgoingMessage()` 仅负责存储提交，后续渲染错误不再被误报为持久化失败；真正 localStorage 写入失败仍阻止发送。
- `failed_turns.js` 只在当前请求确认失败的 catch 分支登记 conversation + message IDs。`saveAppStore()` 写入时过滤这些 ID，返回/广播完整运行中 store 供当前气泡展示；不靠正文关键词或历史 status 推断，不扫描删除历史。私聊/工具/群聊在构造请求及 RAG/记忆历史前过滤已登记 ID，失败不采集本轮记忆。新失败工具 trace 不保存可续跑快照；手动停止、上限暂停及旧历史兼容保持。
- 群聊传递精确 triggerMessageId，失败后跳过尚未处理的同一失败触发事件；如果本次队列已有角色成功响应该输入，则保留正常输入和已成功回复，仅排除失败成员。群聊 Grok MCP 复用原工具请求、工具定义、权限和附件提取函数，最终仍验证群聊 JSON；完成 trace 明确显示完成，原请求预算与 50 步边界保留。
- 正常 LLM 回复后发生 TTS / 记忆保存 / UI 回调错误不应被重新判为模型失败；私聊通过 replyReceived，工具通过 completed 保护已成功消息。成功回复保存 modelReplySucceeded 正向标记，防止正常 JSON 错误示例被旧附件错误文本兼容逻辑误判；历史规则保持兼容。底层附件文件不自动删除，避免波及正常消息及共享媒体；聊天中的失败引用不会进入最终持久化 store。
- 已通过 Node 思考协议回归 9 项、Grok/元数据/失败 ID/STT/正常 JSON 示例 5 项、模型预设 6 项、附件单元 6 项；Grok 浏览器每端 53 项（1440×1000 / 390×844），覆盖截图、四档、图片/音频/文档/真实 VP8 视频、私聊/群聊 MCP、HTTP/网络/200 error/SSE error、下一轮上下文与记忆隔离、刷新、TTS 与部分成功群聊保护。既有预设浏览器 5 个尺寸及附件浏览器每端 51 项通过，包括原文件、旧历史隔离恢复和真实文件选择器。所有模型/MCP/STT 响应为受控夹具，未调用真实付费 xAI 服务。

## 2026-10-09 v1.1.0 公告板

- 遵循 `.agents/fritia_chat_dev_agent.md` 与 `src/ui_rules/ui_design_rules.md`；保留用户已有 agent 文件修改。新增公告板及必要的侧栏适配、文档、版本和离线资源映射，不做打包。
- 导航增加 Lucide 邮件按钮，来源为 [Lucide 0.468.0 mail.svg](https://raw.githubusercontent.com/lucide-icons/lucide/0.468.0/icons/mail.svg)，沿用 ISC 许可。桌面设置按钮上方显示公告入口；移动端七个入口按可用宽度缩放，维持原有导航布局。
- `announcements.js` 每次 UI 启动发起一次官方公告 GET，`cache: no-store`、不携带用户凭据、15 秒超时。窗口重新打开不发请求；网络/HTTP/JSON/条目校验失败均保留已缓存文件与未读状态。ID 按整数数值（BigInt）降序，避免字符串排序和大整数精度问题。
- 独立 IndexedDB `fritia_announcement_board/files` 以 `announcement.json` 为键，原子保存公告对象及 `unreadIds`，不接入聊天 ZIP/WebDAV。首份文件所有 ID 未读，后续比较上次文件 ID 并累积未读。标题至少 60% 进入正文可见区域且页面在前台时记为已读；本次窗口保留新公告强调色，下次打开更新样式。关闭停止观察，未浏览条目保留未读；写入按队列提交，失败明确提示。
- 固定本地依赖 Turndown 7.2.0（MIT）将惰性 template 中的 HTML 转 Markdown，移除可执行/嵌入元素及危险链接；复用 `ui.js` 现有 Markdown 函数，仅公告传入 `preserveBreaks`，原聊天和帮助默认行为不变。公告 HTTP(S) 链接使用 `_blank` / `noopener noreferrer`，Windows 复用既有系统外链委托。
- 公共样式与横屏/竖屏布局分别位于三份 `announcements*.css`，对应两份独立布局交互模块。标题和关闭按钮不参与正文滚动；单列卡片、轻玻璃背景、浅蓝紫强调、自绘滚动条、窄屏安全区、VisualViewport、键盘焦点循环和 Esc 关闭。
- 版本 `1.1.0`，SW 缓存 `v47`，新增模块、CSS、图标及本地转换库加入核心资源。实际公告接口已读取，支持跨域 GET（`Access-Control-Allow-Origin: *`），包含普通文本及 HTML 列表、链接。
- 已通过 `npm run check`、`npm run test:service-worker`（7 项）和 `npm run test:announcements`。公告回归覆盖 11 组视口（320×568 至 3840×2160，包含手机横屏、1024×280 矮窗口，以及 1920 屏幕 125%/150% 缩放对应的 1536×864 / 1280×720 CSS 可用视口），验证数值排序、大整数、HTML/Markdown/换行、危险内容过滤、浏览器新标签/Tauri 外链委托、只读可见条目、未读累积与刷新持久化、每启动一次请求、失败保留、数据隔离、固定标题和七入口导航。另通过首次离线、空公告、IDB 读取受限和写入配额失败四种状态。测试使用本机已有 Playwright/Chromium、独立浏览器上下文和受控公告数据；未调用模型 API，未运行原生客户端或打包。

## 2026-10-03 v1.0.2 Android ZIP 导出内存修复

- 已在旧正式 APK + 全新 API 35 模拟器复现：加入 64 MiB 媒体条目后，使用真实系统路径选择器导出，留下 0 字节 ZIP；fritia-save-archive 线程因 OutOfMemoryError 退出。栈为 String.getBytes → Base64.decode → FritiaArchiveBridge.writeFile，单次申请 93,870,624 字节，Java heap growth limit 为 192 MiB。没有用户设备日志，不能断言所有 ROM 的闪退原因完全相同；此处修复已复现的根因。
- 旧链路把整个 ZIP 同时持有为 Blob、ArrayBuffer、Base64/JSON 字符串，再在 Android 分配完整 UTF-8 和解码数组；catch(Exception) 不会处理 OutOfMemoryError。新链路使用 Blob.slice，每块最多 128 KiB，等待原生确认后继续，避免整包桥参数。不增大堆、不截断备份、不限制总备份大小。
- Android beginWrite/writeChunk/finishWrite/abortWrite 使用单一串行 executor 和一次性目标 URI；校验会话、偏移、块长及最终字节数。成功 flush/close 后才返回 saved；失败释放本次输出流，未匹配会话不能影响另一个写入。Activity 销毁时关闭资源。没有删除源数据、没有自动删除选中文档或其他文件；失败/中断可能留下未完成目标文件，但不计为成功。
- archive_sync 在完整 ZIP 和恢复副本导出完成后复用 showSettingsNotice，显示用户指定文字。Windows 原保存命令和网页保存路径不改；普通浏览器下载 API 无法确认最终落盘，保留原状态说明，提示代表生成并交给浏览器。
- canonical 原生源码及集成/暂存脚本同时维护，防止以后从旧模板覆盖新桥。本轮只写入/构建外部 android_arm，Windows 文件哈希另行核对不变；版本 1.0.2、Android versionCode 10002、原证书不变，SW v46。
- 参考 AOSP Base64 实现的整块分配与复制（https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/util/Base64.java），采用 Java OutputStream 的增量写入。Android 开发文档站点当时超时，未据未取得页面臆测 SAF 完成通知能力。
- 新测试 test:archive-export 验证分块上限/字节一致性、错误中止、取消、旧桥拒绝和 Windows 原命令；test:archive-export:browser 验证两种尺寸的成功提示、失败/取消无提示、恢复副本及浏览器下载。旧 APK 复现日志、新 APK 的真实 SAF/ZIP CRC/内容和数据保留证据见外部 validation/zip-export 与 Android BUILD_PROCESS.md。

## 2026-10-03 v1.0.2 图谱触控 / 恢复副本上限

- 知识图谱已有 Pointer Events 和 pointer capture，但画布未声明 touch-action，浏览器会接管手指平移并触发 pointercancel。仅为 #memory-graph-canvas 增加 touch-action:none，复用现有平移、节点和双指处理，不改全局页面手势及鼠标代码。原生 Android 和移动网页使用相同局部声明。依据 [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property)：取消 pointerdown 默认行为不能代替 touch-action 的手势声明。衍生源 long_term_memory.js 使用相同事件实现，没有另造手势层。
- 恢复上限在独立 IDB state 的 recovery-limit 键保存，合法值仅 5/10/20/40，缺省 20；不随云端同步或 ZIP 覆盖。修改设置只保存偏好，下次 saveRecovery 执行上限。菜单紧接云端导出按钮，通过 flex-wrap 在不足宽度时换行，桌面/手机规则分别维护。
- 新增副本、候选校验、超限旧副本删除和索引更新在同一 readwrite 事务完成；副本时间/id 在事务中取得，避免并发排队导致新副本被当成最旧。按 at 排序；同毫秒使用原索引插入先后，新副本优先保留。每次只读取一个旧快照，减少大存档内存峰值；写入失败时已排队删除也全部回滚。
- 全部索引先检查合法 recovery 键、唯一性及安全整数时间；候选 payload 的 id/at/snapshots 必须匹配。异常设置、异常索引、缺失/错配候选均停止事务；不跳过异常候选去删较新的副本。时间倒退导致新副本进入待淘汰范围时同样停止，避免丢掉操作前的安全副本。没有 clear、媒体级联删除、文件系统删除、云端 DELETE 或基线清理。
- 成功保存后通知列表刷新；刷新有请求序号防止旧异步结果覆盖新列表。控件复用自绘 select，操作期间禁用数量选择。版本保持 1.0.2，离线缓存 v45。
- 验证：真实 Chromium 输入协议复现旧 pointercancel，并在 1440 / 700 / 390 宽度验证完整连续触控、鼠标、双指与菜单布局/持久化；51 项 IndexedDB 检查涵盖四档、乱序时间、同毫秒、并发、两类事务失败、损坏配置/索引和时钟倒退，逐键比较其他状态与 localStorage。原生成品环境、结果和哈希见 chat_v1.0.2 的最新 BUILD_PROCESS.md 和 validation/graph-recovery 报告；没有实体触控屏或 Android 手机验收。

## 2026-10-02 v1.0.2 附件输入与上下文隔离修复

- 根因：llm_media 只识别少量文本扩展名，其余统一生成嵌套 `file.file_data`；DeepSeek 文件内容块的字段在顶层，MiMO 不接受这类通用文件项，OpenAI 也不会把 octet-stream 当成任意可理解文件。每次重建历史和工具 resume 都再次发送该项，形成连续失败。部分兼容接口以 HTTP 200 返回 error，旧逻辑还会把 JSON 当作正常回复。
- 先解码脚本/代码/配置正文，未知扩展名也可按可读 UTF-8 内容识别；UTF-16 BOM/明显字节特征及已识别文本的 GB18030、Windows-1252 回退都采用严格解码，不静默替换坏字节。没有执行附件代码。PDF.js legacy / fflate 按需本地加载，读取 PDF 文字及现代 Office XML；XLSX 保留工作表名称/单元格地址/值/公式，PPTX 按关系清单排序。图像排版与嵌入对象不假装已读取。PDF 官方 OpenAI 用户内容保留规范 application/pdf 文件输入，Responses 显式映射 input_file，不再丢成空 input_text。
- attachment_state 使用独立 fritia_attachment_inputs/blocked IndexedDB，以附件来源/字节 SHA-256 保存拒绝标记。原媒体与聊天不删除、不改写；当前不支持文件立即提示，历史不支持文件跳过并显示本轮说明。附件错误消息不会进入后续历史/RAG 查询/长期记忆采集；兼容旧 status=sent 的 JSON error。仅实际携带附件并返回 400/415/422 的明确文件错误才隔离，401/429/5xx、模型参数错误保留原路径。能定位 message/content 索引时只隔离该项；未指明具体项时隔离本次候选文件输入，文件仍可下载。
- error.meta.attachmentQuarantine 及 attachmentIssues 带恢复所需哈希；正常聊天存档/同步自然携带这些字段。上下文读取时先重建本地隔离，再处理旧消息；不新增同步协议或自动清理数据。完整原始 API error 保存为 attachmentApiError，超过摘要显示长度时以 details/pre 展开，不被存储层 12000 字符正文限制截断。
- 普通、工具和群聊共用请求预处理；_fritiaAttachment 仅留在本地快照，发给 Chat Completions/Responses/LM Studio 前剥离。旧 raw file 续跑项也重新转换。附件正文在 MCP 快照中保持完整；其他原有上下文压缩策略不变。Responses 不支持的音频适配现在明确提示，避免默默变成空文本。图片接口错误延迟到既有转述回退结束后再隔离，防止误伤回退路径。
- 版本保持 1.0.2，SW 缓存 v44。新模块、两套提示样式、解析器脚本进入离线核心资源；字体/CMaps 随客户端内置，网页使用后缓存。没有新增服务器或改变模型配置、同步规则、角色与 MCP 权限。
- 已阅读官方 [OpenAI 文件输入](https://developers.openai.com/api/docs/guides/file-inputs)、[DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion)、[Open WebUI 解析路由](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/retrieval/loaders/main.py) 与 [Mozilla PDF.js](https://github.com/mozilla/pdf.js)。MiMO 文档入口返回站点壳，未据此虚构通用文件支持；采用可验证的正文传输。
- 测试入口：test:attachments（编码/伪装二进制/三类报错/配置区别/SSE）、test:attachments:browser（两种尺寸，每端 51 个运行用例，加真实文件上传、完整错误 UI、刷新及无原隔离缓存的恢复）。所有模型响应均为受控夹具，没有调用真实付费 API；正式 Windows/Android 运行结果、APK 证书和包体校验见外部 chat_v1.0.2 本批 BUILD_PROCESS/validation 报告。

## 2026-10-02 v1.0.2 同步进度、恢复副本删除与安装登录检查

- 同步状态事件新增可选 `detail: { current, completed, total }`，存档页、配置浮层和冲突窗口在状态同行显示小字详情。计数属于当前阶段（版本清单、数据文件、记录校验、增量文件、数据库应用），并非估算全程文件数；长路径省略但计数始终可见，完整内容通过 title 查看。旧版迁移也报告文件进度。上传仍按原先约 512 KiB 分组，没有新增 WebDAV 请求。
- `deleteRecovery(id)` 只接受恢复键格式，并在同一个 IndexedDB readwrite 事务里检查索引唯一成员、快照 id/时间一致性，再删除该键并更新索引；任何失败均回滚。不删除 live LocalStorage/媒体库、基线、缓存、设备标识或远端文件。异常/缺失索引采取保守拒绝。记录数据内嵌于快照，删除一键即释放其本地快照数据；无共享媒体级联删除。
- 下拉行使用独立的选择按钮和垃圾桶按钮，行高维持 32px；原生 HTML dialog 以自绘样式展示确认浮窗，默认焦点为取消。确认锁定点击时的 id，不读取后来改变的选择值。若用户删除正在等待决策的冲突副本，下次比较会检查存在性并重建恢复点。
- MCP 卡片安装通过 `requestPluginInstall()` 重新调用 `/users/login/info`，不使用旧登录标记替代检查。未登录则复用原生浏览器及轮询，地址改为 `/login`；验证成功后继续该插件详情，不直接代替用户部署。网络错误中止并显示原因。原生隐藏 API 浏览器继续使用 MCP 首页，只有可见登录窗口导航到登录页。
- 桌面/手机布局分存于 archive-sync-desktop.css / archive-sync-mobile.css；未改变合并决策、删除传播、聊天、模型或工具请求参数。复用已有 trash-2 图标、IndexedDB 事务与登录桥，未添加运行依赖。联网检索工具当时返回 503，无法取得新的开源页面，未把未读取资料作为实现证据。
- 版本 1.0.2，SW 缓存 v43。原生源码与包只写入获授权的外部 chat_v1.0.2；沿用原包名、Android 签名证书和 Windows 数据目录，旧目录不改动。
- 验证命令：`npm run check`、既有 Node 回归、`test:archive-sync`、`test:v102`。新浏览器测试覆盖精确删除/取消/切换选择/事务回滚/并发新增/非法键与错配、32px 行高、长路径计数、四种登录状态；同步测试覆盖阶段计数及删除冲突副本后重建。成品运行环境、结果和签名哈希记录在 chat_v1.0.2 两端 BUILD_PROCESS.md 与 validation 报告中。 已在正式 Windows EXE 和 Android API 35 模拟器的签名 APK 上通过 20 个成品场景，包括真实 WsgiDAV 双端合并、冲突进度、精确副本删除和两端真实内置 /login 窗口；登录账号接口使用受控响应，未验证真实账号登录和远端部署。Windows 打包保留原生壳的 Service Worker 禁用守卫，避免静态缓存介入客户端更新。

## 2026-10-02 v1.0.1 Cloud Sync Compatibility Patch

- 普通 Markdown/帮助文档 `<a target="_blank">` 之前没有连接壳层 `open_external_url`，与官网按钮的路径不同。`external_links.js` 在文档 click / auxclick 上委托处理外链，动态气泡同样生效；仅原生环境调用现有系统浏览器命令，跳过站内链接、非 HTTP(S) 和 download 链接。
- 恢复按钮在操作完成后被通用 `data-archive-action` 逻辑统一启用，且列表原本只在手工刷新时加载。现在打开存档窗口自动刷新，异步状态更新有请求序号保护，按实际快照分别启用两侧；读取不到快照时不弹空保存窗口。导出只读数据，先验证条目再调用既有系统路径选择器，保留用户点击激活。
- 旧 v1 协议为固定文件名逐个覆盖，manifest 与文件不是事务提交；中断或多设备写入后可能属于不同轮次。新 v2 迁移曾对旧 manifest 做强制紧凑 JSON 哈希匹配，因此即使记忆 JSON 有效也中止。新 `archive_legacy.js` 分别兼容原始 JSON、紧凑 JSON、规范 key/value 顺序；仍不匹配时二次条件读取确认该文件未变化，并重新检查 manifest。只有结构有效且稳定的源数据才进入合并。
- 对于不一致的旧清单，不能声称旧 hash 校验通过。原 manifest、原文件字节和不匹配路径被保存在恢复副本 `legacySource` 中，导出 ZIP 附带 `legacy-source/`；归档页说明清单与文件不一致。损坏 JSON、非法键名/路径、缺失文件、读取中写入均报错，旧云目录完全只读。ZIP 正常导入与 v2 SHA-256 校验未放宽。
- 迁移缓存按端点/路径/用户名隔离，ETag 条件 GET 减少重读传输；同一旧快照只保存一次迁移恢复点。原始恢复文件不加入 v2 数据包，避免重复上传；v2 继续复用已有记录哈希，未变化同步仍为一次目录查询。
- `npm run test:archive-legacy` 覆盖两种 JSON 哈希、清单过期稳定读取、条件缓存、并发变化、损坏/缺失/非法结构；`tools/cloud_fix_browser.mjs` 覆盖桌面/手机同排按钮、缺失侧禁用、外链原生委托和两侧保存路径激活。版本不变，SW `v42`。最终原生成品测试与包体校验记录在外部 `chat_v1.0.1` 的 BUILD_PROCESS.md 和验证报告中。

## 2026-10-02 v1.0.1 Archive Safety / Native Bridges / Settings

- 已读取 `.agents/fritia_chat_dev_agent.md`，保留用户对该文件的已有修改。版本 `1.0.1`，SW 缓存 `v41`。本轮没有运行静态 build、APK/D8、Rust release 或打包命令。
- 旧同步缺陷：manifest 用紧凑 JSON 算 hash，上传用 pretty JSON 再算 hash，导致跳过判断失效；manifest 重复 PUT；每个文件重复 MKCOL；双端变化只允许整份覆盖；恢复 IDB 先独立 clear 再 put，后一步失败会失去原始内容。
- v2 使用稳定 JSON、SHA-256 校验、记录级三方比较、内容寻址压缩包和不可变 commit DAG。相同 ID、只有一方相对基线修改则采用该修改；独立新增取并集；同一记录双方修改提示选择。删除不自动传播。单设备重复/跨标签同步由 in-flight Promise / Web Locks 串行化；跨设备写不同 commit 文件，无共享清单覆盖竞争。并发出现多个 head 时求公共祖先合并。
- 每次 PROPFIND 检查版本；只 GET 新清单/未缓存 pack。小变更聚合为约 512KiB JSON 包后 gzip，大媒体单独进包，引用已知 hash 不重传。无变化路径已验证只有一次 PROPFIND。清单仍包含当前记录引用，不承诺恒定大小；首次同步/设备重置会读取历史清单。保留全部历史不做自动 GC。
- `fritia_archive_state` 独立 IndexedDB 保存每个目标的基线、目录、内容缓存、设备 ID 和恢复副本，不纳入同步/ZIP，避免递归放大。恢复副本与索引在同一事务内写入；失败则停止应用。冲突选择前重新采样数据，出现新修改则重新比较。写入前和 IDB 事务中检查本地是否变化，防止网络等待期间新消息被旧快照覆盖。同步仅 put，不 clear；手动导入 clear/put 合并到同一 IDB 事务，并保存恢复点。ZIP 校验 CRC、路径和 manifest/hash。
- 旧 v1 目录只读迁移、不删除；新旧协议隔离，请多端一起升级。发现已知 commit 缺失或坚果云单次列举达到 750 条时停止写入，不能把服务器截断误判为空目录。用户数据不因失败自动重置。磁盘/服务器物理损坏、用户清除浏览器数据仍需另行 ZIP 备份；不承诺物理故障下绝对不丢数据。
- 参考：Joplin 的按项目/目标保存同步状态、定期轮询与测试方法（[官方同步说明](https://joplinapp.org/help/dev/spec/sync/)）；Syncthing 的哈希校验与冲突副本保留（[官方同步说明](https://docs.syncthing.net/users/syncing.html)）。采用适合静态 APP 的简化记录协议，没有引入完整同步框架或中央服务。
- Android 排查：v1.0.0 原生 `performProxyFetch()` 经 `HttpURLConnection.setRequestMethod()`，失败后反射基类 `method`；该路径对扩展方法/具体 Android 实现不可靠。原 JS 桥还将所有状态构造有 body 的 Response，204 会抛异常，旧 WebDAV 层甚至把这类异常视为成功。新专用桥用 OkHttp 并发送原始方法、同源重定向保留方法，跨源重定向拒绝转发凭据，204/205/304 用 null body。没有实机与服务器日志，不能断言旧 501 只有一个可能原因；此次已消除可见的方法代理/空响应缺陷，非兼容服务返回的真实 501 仍会正常报告。
- 原生保存：Android SAF `ACTION_CREATE_DOCUMENT` → 用户选择 URI → 仅允许该 URI 写入；Windows Tauri 异步命令调用 Win32 GetSaveFileNameW，所选路径加入一次性允许集合后写 ZIP。网页 showSaveFilePicker 在采集存档前触发，保留点击激活；不支持时说明浏览器下载限制。原生剪贴板仅响应点击，不在后台读。
- 用户授权的新目录：`D:\Models\vibe_coding\fritia_online_next_desktop\chat_v1.0.1`。只在新目录接入；旧 `chat_v1.0.0` 没有修改。可重用的原生源码和集成脚本位于 `tools/native/`，依赖来源/哈希见其 README。最初对旧外部目录的写入被自动审批拒绝，用户后来明确授权新目录，实际修改已遵循新范围。
- 桌面和手机冲突 UI 分别由 `archive-sync-desktop.css` / `archive-sync-mobile.css` 定义，两端都有滚动比较区、设备/时间和逐项选择；设置气泡公共逻辑、手机安全区定位。比较仅截短屏幕预览（3000 字符），持久化/传输记录完整；密钥字段隐藏，避免明文出现在冲突窗。
- 验证：7 项 archive 单元测试；模拟 WebDAV 的双隔离浏览器：消息并集、同条编辑冲突、两个写入者并发、失败重试、损坏阻止应用、实际 LocalStorage/IndexedDB 全链路及一次请求 no-op；桌面 1440×1000 / 手机 390×844 的粘贴、保存气泡、ZIP 文件头/取消、冲突窗；Android Activity + 新桥 Java 编译；Windows Rust 模块使用现有 Tauri 依赖做 `--emit metadata` 类型检查。没有 Android 实机（adb 列表为空）、没有真实 WebDAV 账号验证，没有生成 APK/EXE。

## 2026-10-01 v1.0.0 Provider Presets / Key Acquisition

- 遵循 `.agents/fritia_chat_dev_agent.md` 与 UI 规范，修改限定于模型设置表单、预设添加、密钥获取和 MiMO TTS 一次性同步。未改聊天引擎、思考参数、工具调用、存档或其他配置功能。
- `model_provider_presets.js` 集中维护用户指定的七组配置、官网地址和“自定义”入口。Base URL 通过 `URL` 解析后按准确 hostname 匹配；不使用包含模型名的字符串猜测，未知网站禁用获取按钮。菜单及获取按钮统一复用既有 `ui.js:openExternalUrl()` 的 Tauri 命令 / 网页 `_blank` 分支。
- `model_provider_presets_desktop.js` / `model_provider_presets_mobile.js` 及对应 CSS 分别定位桌面/手机菜单；手机使用 VisualViewport 边界。菜单挂载到 body，避免被设置滚动容器裁切，支持外部点击、Escape、方向键、Home/End，关闭设置或切换配置分组时关闭。
- `ui.js` 的 `saveCurrentModelProvider('chat')` 调用 `buildMimoTtsSyncPatch()`，仅对显式保存的非空、新增/变更 MiMO 对话密钥执行复制；同一次 `saveSettings()` 保存对话和 TTS，避免跨次覆盖。TTS 可单独修改，不监听 TTS 变更反向同步对话，也不因无关保存再次覆盖 TTS。存在多个 TTS 时只更新默认 MiMO 或首个 MiMO 项，其余配置不变。
- `settings.js` 保留本地空模型名以及 `LM Studio` / `LM Studio-2` 名称；现有其他名称的空白归一化规则和在线模型缺省值保持不变。
- LM Studio Logo 原始下载地址：`https://lmstudio.ai/assets/marketing/brand/download/logos/lm-studio-icon-color.svg`；文件为 `src/_logo/llms/lm-studio.svg`，原样保存官方资源。其余 Logo 和“获取”下载图标复用项目资源。
- 新模块、两套 CSS、LM Studio Logo 加入 Service Worker 核心资源，缓存批次升为 `fritia-next-chat-v40`。`package.json` 版本保持 `1.0.0`；未执行 build 或平台打包。
- 验证：`npm run test:provider-presets` 的 6 项测试覆盖精确预设、域名匹配、防误匹配、本地名称/空模型归一化及 TTS 复制和独立性；`tools/provider_presets_browser.mjs` 在 1920×1080、1280×720、844×390、390×844、360×640 隔离 Chromium 上验证菜单/图标、每项预填、即时 URL、网页新标签参数、两种 Tauri invoke 桥、TTS 原行为、保存/刷新和无关会话存档不变。客户端桥使用 mock 验证调用参数，未运行原生 APP 实机或真实 API 请求。
- 浏览器测试使用已有 `PLAYWRIGHT_MODULE`、`CHAT_TEST_BROWSER`、`CHAT_TEST_URL` 可选环境变量；启动 `npm run dev` 后运行 `npm run test:provider-presets:browser`，未新增生产依赖。

## 2026-10-01 v1.0.0 Reasoning / Tool State / Chat Viewport

- 遵循 `.agents/fritia_chat_dev_agent.md`，仅修改本次三项问题的模型请求、消息展示及对应文档/验证。未修改存储版本、用户设置字段、角色、知识库、长期记忆或打包产物。
- `model_reasoning.js`：厂商能力适配优先于既有模型名回退；DeepSeek 读取 `effort.supported_levels`，OpenRouter 读取 `reasoning`，Kimi 读取 `supports_reasoning`，百炼读取 `output.models`。缓存按目录 URL / API Key 隔离，成功 5 分钟、失败 30 秒；同端点请求合并，5 秒超时，失败保留旧成功结果。API Key 不写入新存储、不记录日志、不发送给第三方目录。
- 百炼的思考开关是顶层 `enable_thinking`；MiMo / DeepSeek / Kimi / GLM 原生接口按各自 `thinking` 或 `reasoning_effort` 协议。支持思考、允许关闭、effort 档位和 token 预算不是同一个概念。能力不明确时不伪造二档；保持原先从最低合法档开始的交互习惯。参考 README 中的官方能力表以及 [百炼参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)、[Kimi 参数](https://platform.kimi.ai/docs/guide/reasoning-effort)。
- DeepSeek 400 根因：工具 completion 解码器只读取正文和工具调用，assistant 续轮及恢复快照也丢掉了 `reasoning_content`。现在整个链路保留字符串及结构化 reasoning，非工具的中间 assistant 回复也回传；普通聊天和工具最终回复在 `meta.reasoning` 保存原始内容，通过 `meta.reasoningProvider` 限定同端点/同模型的历史回传。没有关闭思考、禁止工具或用空字符串伪造模型推理。
- `openai_responses.js` 仅适配 OpenAI 官方 GPT-6 思考工具组合，完整保留有序 output 和加密 reasoning；兼容网关继续走原 Chat Completions。GPT-6 思考请求去掉官方不支持的采样参数。
- `chat_scroll.js`：按 composer 顶部测量动态留白；ResizeObserver 观察消息和输入栏，图片/媒体加载后校正；用户阅读时按消息 ID 和偏移保持位置。`ui.js` 复用内容未变化的消息节点，避免每次状态刷新重载历史长图。关闭浏览器自动 scroll anchoring，避免与程序校正竞争。
- 横屏和手机分别使用 `chat_scroll_desktop.js` / `chat_scroll_mobile.js` 与对应两份 CSS；共用消息锚点算法。移动端额外处理 VisualViewport 键盘变化和短视口输入框最大高度。
- `package.json` 版本 `1.0.0`；`sw.js` 缓存 `v38`，新增模块和 CSS 进入离线核心资源。未运行 build 或任何平台打包。

### 验证

- `npm run check`：全部源文件语法检查。
- `npm test`：能力目录、厂商请求字段、流式分片/尾帧、JSON 响应、完整工具循环、中间回复、续跑快照、普通聊天思考保存、GPT-6 Responses 加密状态回传回归。测试使用模拟服务，不消耗真实 API 额度。
- `tools/chat_scroll_regression.mjs`：真实 Chromium 隔离上下文，测试 1920×1080、2560×1440、3840×2160、1280×720、844×390、390×844、360×640；覆盖延迟加载 6000px 长图、后续 MCP/输入中气泡、超长回复、输入栏/附件增高、上滑阅读、视口缩小、移动 VisualViewport 键盘开合、桌面 1.25/1.5 page scale。page scale 模拟不等同于原生浏览器 Ctrl+ 缩放。
- 浏览器测试需先 `npm run dev`，再 `npm run test:chat-scroll`；可用 `PLAYWRIGHT_MODULE` 指向已安装 Playwright 的 ESM 入口，`CHAT_TEST_BROWSER` 指定浏览器可执行文件，`CHAT_TEST_URL` 指定开发地址。未向生产依赖添加 Playwright。
- 未做真实付费 API 请求、Android/iOS 实机或原生 APP 壳层测试；未验证所有第三方网关的私有参数。

## 2026-10-01 Service Worker Fetch Error

- `sw.js`：缓存批次更新到 `fritia-next-chat-v39`。Service Worker 只接管同源静态 GET；跨域、认证、`no-store`、POST 和 loopback 模型请求直接交还页面。
- `fetchAndCache()` 仅缓存 `response.ok` 且非 206 的完整响应，使用 `event.waitUntil()` 等待缓存写入；读取缓存和缓存写入失败均不覆盖主网络结果。
- 所有失败分支最终返回 `Response.error()`，保证 `FetchEvent.respondWith()` 收到 Response，而不是 `undefined` 或 rejected Promise。
- `tools/service_worker_regression.test.mjs` 覆盖账户隔离、动态 API 不缓存、离线静态资源、缺失资源、HTTP 错误、部分响应和缓存异常。
- 真实隔离 Chromium Service Worker 测试确认：模型目录两次请求对应两个 API Key，缓存不共享；静态 fixture 可离线读取；缺失资源返回页面 TypeError，Service Worker 未产生 unhandled rejection。

## 2026-09-09 Help Markdown Image URLs

- `src/js/ui.js`：说明文档加载器将文档来源 URL 传入 Markdown 渲染器；图片的相对地址统一基于文档 URL 解析，并将反斜杠转换为 URL 斜杠，兼容本地、网页版、客户端和 GitHub 回退文档来源。
- 保留原有绝对 URL、`src/`、根路径和 data 资源处理，不改变其他 Markdown 功能。
- `sw.js`：缓存批次更新为 `v37`，并预缓存 `src/docs/imgs` 中说明文档使用的图片。

## 2026-09-09 Group Conversation Lifecycle

- `src/js/storage.js`：新群聊不再使用成员/标题哈希作为会话 ID，而是生成独立 `id` 与 `unique_id`；旧群聊缺少该字段时归一化为原会话 ID，保证旧存档兼容。
- `src/js/storage.js`：新增 `removeGroupConversation()`，按精确群聊 ID 删除会话和消息桶，并在确认未被其他会话、角色或表情包引用后删除对应 IndexedDB 媒体。
- `src/js/ui.js` / `index.html` / `src/styles/app.css`：群聊退出改为自绘确认浮窗，支持确认、取消、Esc 与移动端返回手势；确认退出后返回会话列表。

## 2026-09-09 LM Studio Local Transport

- 新增 `src/js/lm_studio.js`，独立负责 localhost / 127.0.0.1 / `[::1]` 识别、Local Network Access fetch、连接检测、非流式和流式 OpenAI-compatible completion、tool call 增量解析。
- `src/js/llm_request.js` 仅增加本地 provider 分流，原在线 provider 构造、请求头、图片回退和响应解析保持原实现；`chat_engine.js` 与 `tool_chat_engine.js` 仅放宽本地模型无 API Key 的占位判断，并将 MCP agent loop 委托给独立适配器。
- `ui.js` 增加 LM Studio Logo 映射、连接状态和配置跳转；`index.html`、`chat-model-picker-desktop.css`、`chat-model-picker-mobile.css` 共同实现横屏/竖屏模型连接卡片，两枚操作按钮不使用 Logo，状态颜色遵循 Soft UI 规范。
- Service Worker 缓存批次更新为 `v35` 并纳入 `lm_studio.js`。
- 针对实际浏览器错误 `https://localhost:1234/v1/models`，`sw.js` 不再代理回环模型请求，确保页面上下文执行 Local Network Access；`lm_studio.js` 对误填的 HTTPS 回环地址增加 HTTP 兼容回退，并将 CORS/HTTP 配置错误转换为可操作提示。LM Studio Bionic 仍复用同一 OpenAI-compatible `/v1` 服务面。
- 针对 Bionic 的 `System message must be at the beginning` 模板错误，`lm_studio.js` 在本地请求发送前将人格、知识库、长期记忆等多个 `system` 消息合并为一个首位系统块；在线模型收到的消息数组不变。
- `roundtable.js` 的事件配置门槛现在复用 `isLmStudioSettings()`；本地 LM Studio/Bionic provider 可在 API Key 为空时进入圆桌请求，在线 provider 的 API Key 校验保持不变。

## 2026-08-21 Default Chat Avatar

- HTML 初始图片、角色默认头像和 UI 图片失败回退均改用 `src/_logo/emoji/chat.svg`；旧存档中的 `robot_3d.png` 路径会在渲染时归一化，但不会改写存档。
- `app.css` 新增 `--friend-avatar-diameter: 50px`，好友列表头像引用该变量，所有 `chat.svg` 图片通过 `max-width / max-height` 共用同一上限；`sw.js` 缓存更新为 `v33`。

## 2026-08-20 Chat Model Logos

- `src/js/ui.js` 的 `getChatModelLogoPath()` 按模型名称识别 `mimo / qwen / deepseek / kimi / glm / gpt`，入口按钮和当前模型栏同步显示对应 `src/_logo/llms` SVG，未知模型使用 `bot.svg`。
- 思考强度选项移除大脑图标；标题保留 `brain.svg`，模型子菜单选项使用同一模型 Logo 映射，并通过 `object-fit: contain` 统一不同 SVG 画布比例。
- `sw.js` 更新到 `fritia-next-chat-v32`，缓存新增六个模型 Logo。

## 2026-07-27 Per-character Chat Model / Reasoning Effort

- 新增 `src/js/model_reasoning.js`，根据对话提供商的模型 ID / Base URL 返回可用档位、日常默认档和 OpenAI-compatible 请求字段。已明确映射 GPT-5 / o-series / gpt-oss、DeepSeek V4、Gemini 2.5 / 3.x 和可经网关转译的新版 Claude；未知或不支持控制的模型只提供不附加参数的“普通”档。
- `src/js/ui.js` 用 `state.characterChatRuntime: Map` 按 `characterId` 保留会话期覆盖，不调用 `saveSettings()` / `saveAppStore()`，不新增任何存储键或迁移字段。提供商被删除或模型能力变化时会回退到当前默认对话模型和合法档位。
- `src/js/chat_engine.js` 和 `src/js/tool_chat_engine.js` 都接收临时 `chatSettings + reasoningEffort`，确保日常私聊和 MCP agent loop 使用同一角色配置。`src/js/llm_request.js` 只对实际对话提供商追加思考参数；图片能力回退到默认图像转述提供商时不传递角色思考档。
- `index.html` 新增紧凑的强度菜单、当前模型栏和右侧模型子菜单，标题复用 `brain.svg`，入口与模型选项使用模型 Logo 映射。`chat-model-picker-desktop.css` 与 `chat-model-picker-mobile.css` 分别负责横屏和竖屏布局，进度条绝对定位在原按钮内，未修改 `.composer` 的尺寸、网格或内边距。
- `sw.js` 缓存版本更新到 `fritia-next-chat-v31`，并将新 JS / 两份响应式 CSS 及必要图标加入离线核心资源。

## 2026-07-17 New User Onboarding / Quick API Setup

- 新增 `src/js/onboarding.js`，复刻“芙提雅 ONLINE NEXT”的三步“获取 Key / 导入 / 检查”流程。DeepSeek 和 MiMo 官网均通过系统默认浏览器或新标签打开；从官网返回后保留当前步骤并高亮下一操作。
- 新增 `src/js/onboarding_desktop.js` 与 `src/js/onboarding_mobile.js`，分别处理桌面横屏和移动/竖屏的布局状态、步骤滚动复位、可视视口高度与软键盘聚焦滚动。
- 欢迎窗使用 `localStorage.fritia_chat_onboarding_dismissed` 保存“不再弹出”偏好；API Key 继续只写入现有 `localStorage.fritia-settings`，不会清空已有提供商、角色、聊天或其他用户数据。
- `buildImportedSettings()` 对同名导入源执行更新，否则追加。DeepSeek 写入 `DeepSeek_Import / https://api.deepseek.com / deepseek-flash`；MiMo 写入 `MiMo_Import / mimo-v2.6-flash` 和 `MiMoTTS_Import / mimo-v2.5-tts-voiceclone`，并更新三个默认模型 id。
- `src/js/llm_request.js` 将 `mimo-v2.6-flash` 标记为明确支持图片输入；请求 Xiaomi MiMo 域名时同时发送 OpenAI-compatible `Authorization` 与官方 `api-key` 请求头，TTS 仍沿用既有 `api-key` 实现。
- 新增 `src/styles/onboarding.css`、`onboarding-desktop.css`、`onboarding-mobile.css`。欢迎窗无标题栏；快速配置正文独立滚动、底部操作固定；横屏和竖屏均定义自绘滚动条。`sw.js` 缓存版本更新到 `fritia-next-chat-v29`。
- 验证覆盖 1440×900、390×844、915×412：欢迎窗和向导均位于视口内，按钮文字不换行，矮横屏正文可滚且底部操作可见；通过 Playwright 路由模拟验证 DeepSeek/MiMo 成功导入、帮助窗口跳转和“不再弹出”刷新行为。

## 2026-07-11 App Help

- `index.html` 在主菜单中新增 `#main-menu-help`，并新增 `#app-help-panel` 独立悬浮帮助窗口；窗口横屏显示文档目录和 Markdown 阅读区，竖屏通过 `.is-content-open` 在目录层和内容层之间切换。
- `src/js/ui.js` 新增 `appHelp` 状态、菜单绑定、帮助窗口生命周期和 `doc_<标题>.md` 文档发现流程。网页端先尝试读取同源 `src/docs/` 目录清单，再回退到 GitHub Contents API；读取具体 Markdown 时使用 cache bust 和 `cache: 'no-store'`，并复用现有 `renderMarkdownDocument()`。
- `src/styles/app.css` 新增 `.app-help-*` 样式，遵循现有蓝紫 Soft UI、玻璃拟态窗口和自绘滚动条规则；`tools/static_server.mjs` 仅为 `/src/docs/` 增加无缓存 JSON 目录清单，方便本地开发实时枚举文档。
- `sw.js` 缓存版本更新到 `fritia-next-chat-v28`，新增缓存 `help-circle.svg`，并让 `src/docs/doc_*.md` 直接走网络请求，避免帮助文档复用旧缓存。本次只改静态前端源码，不做打包。

## 2026-07-09 v0.4.4 Quick Add Menu

- `src/styles/app.css` 将 `.quick-create-menu` / `.quick-create-item` 的宽度、padding、圆角、gap、选项高度、图标尺寸和移动端覆盖值对齐 `.main-menu` / `.main-menu-item`，让“添加”和“菜单”两个悬浮下拉菜单保持一致。
- `package.json` 版本更新到 `0.4.4`；`sw.js` 缓存版本更新到 `fritia-next-chat-v27`，确保本轮 CSS 调整能替换旧缓存。本次只改静态前端源码，不做打包。

## 2026-07-09 Role Plugin Store

- `index.html` 将插件商店默认分组切到“角色插件”，新增 `#role-plugin-refresh`、`#role-plugin-status` 和 `#role-plugin-grid`，角色插件页不再显示“暂未开放”占位。
- `src/js/ui.js` 新增 `rolePluginStore` 状态和角色插件目录流程：每次打开 `#plugin-store-panel` 都会强制请求 `https://chat.fritia.online/api/downloads/fritia-online-source/char/plugin_char.json?token=cyandust_workshop`，点击“刷新角色卡片”也会重新同步云端目录。每个 key 归一化为角色插件项，并按本地角色名称判断已安装状态。
- `src/js/ui.js` 新增角色插件安装流程：按 `char/<key>/<filename>?token=cyandust_workshop` 逐个下载 prompt、profile、voice 和 dialog_sample；头像与 TTS 参考语音通过 `saveBlobAsMedia()` 写入 IndexedDB，角色按 `normalizeCharacterRecord()` / `upsertCharacter()` / `ensurePrivateConversation()` 写入用户存档。安装前和资源下载后都会再次检查同名角色，避免重复导入。
- `src/styles/app.css` 新增 `.role-plugin-*` 样式，桌面端沿用插件商店三列/两列卡片网格，移动端按钮压缩为图标按钮；`plugin-store-nav` 与角色/MCP 卡片网格均有自绘滚动条。新增联网下载图标 `src/_logo/icons/girl.svg` 作为角色插件通用女孩 logo。
- `sw.js` 缓存版本升级到 `fritia-next-chat-v26`，核心缓存加入 `girl.svg` 和角色安装按钮使用的 `download.svg`。本次只改静态前端源码，不做打包。

## 2026-07-08 Windows v0.4.3 Package

- `package.json` 版本更新到 `0.4.3`；`sw.js` 缓存版本更新到 `fritia-next-chat-v24`，确保用户手动文案修改和本轮 UI 修正不会被旧缓存覆盖。
- Windows x64 打包基线使用外部 `chat_v0.4.2\win_x64` 的 Tauri + WebView2 壳层，继续保留 `desktop_fetch_proxy.js`、`desktop_mcp_relay.js`、`modelscope_fetch`、`open_external_url`、Streamable HTTP MCP relay 和 stdio MCP relay。
- 外部打包目录为 `D:\Models\vibe_coding\fritia_online_next_desktop\chat_v0.4.3\win_x64`；不在本项目内新增 Windows 打包文件。

## 2026-07-08 MCP Client UI Reset

- `src/styles/app.css` 重新设计“工具调用 / MCP 客户端”页，不再沿用上一版互相嵌套的伸缩和滚动策略。桌面端 `.tool-shell` 固定为受视口约束的工作窗口，`.tool-client-workbench` 使用列表栏 + 编辑栏双列，服务列表和编辑器分别在自己的区域内滚动。
- 竖屏端 `@media (max-width: 760px)` 下，MCP 客户端页改为单列卡片流：服务列表卡片和编辑器卡片上下排列，整页负责纵向滚动，列表不再固定高度，避免服务项、服务器名称、启用开关和 JSON 区域重叠。
- 增加 `761px-980px` 横屏窄窗口兜底，MCP 客户端工作台自动改为上下两段，避免中等宽度下双栏硬挤。
- 追加 UI 修正：横屏窄窗口上下分段时取消详情区内部滚动，由整个 client 页滚动；`#mcp-client-json` 高度压缩到约 8 行，超出内容在代码框内滚动；竖屏 `.tool-client-list` 限制到约 3 个服务项高度并启用内部滚动。
- 该 UI 重做已随 `v0.4.3` Windows x64 包同步。

## 2026-07-08 Tool Client Layout / Markdown / v0.4.1

- `src/styles/app.css` 重新调整 MCP 客户端页网格策略：client view 自身负责纵向滚动，`.tool-client-workbench` 按内容自然撑开；`.tool-client-editor` 不再用 `minmax(0, 1fr)` 压缩 JSON 区域，`#mcp-client-json` 保留最小高度并可自滚动。移动端服务列表和编辑器改为自然上下排列，由整页滚动承载长内容。
- `src/js/ui.js` 将聊天气泡文本入口切换为现有轻量 Markdown 渲染器，并补齐引用块、自动链接、粗体/斜体/删除线、行内公式和公式块；渲染后会在非链接/非代码区域恢复 `@角色` 提及按钮。
- `index.html`、`src/js/mcp_tools.js`、`src/js/ui.js` 和 `src/js/tool_chat_engine.js` 新增 `permissions.completeToolResultReply`：权限页新增“让 bot 完整回复工具调用结果”开关，默认开启；工具模式请求 LLM 时只复制请求消息并向最后一条 user message 追加隐藏提示，不写回聊天记录、续跑状态或长期记忆。
- `sw.js` 缓存版本升级到 `fritia-next-chat-v23`；`package.json` 版本按本轮要求保持 `0.4.1`。

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
- 新增桌面横屏三栏 UI：左侧导航、会话/角色列表、聊天窗口、右侧详情。
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
- 组建群聊弹窗改为单列角色列表，支持搜索、复选多选、已选头像预览和底部“创建群聊(n)”按钮。
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

- 修复首次进入页面不显示会话和角色的问题：`initUi()` 会在 `ensurePresetCharacters()` 写入预置角色和私聊后重新读取最新 `fritia_next_chat_store`，避免使用模块导入时缓存的空 store。
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
# 角色迁移实现说明（2026-07-19）

- `src/js/role_migration.js` 负责同名自定义角色与内置角色的候选识别、迁移状态机、迁移前 ZIP 备份、统计、合并、校验和失败恢复。
- 迁移状态保存在 `localStorage.fritia_role_migration_state`；状态为 `migrating` 时启动会自动标记为失败，但不会阻止主界面启动。
- app store 在一次 `saveAppStore()` 中完成私聊消息按时间合并、群聊成员和发言人 ID 重映射、自定义角色删除；内置角色基础字段不被写入覆盖。
- `src/js/long_term_memory.js` 新增 `migrateLongTermMemoryCharacterData()`，在原有容量裁剪规则内原位改写长期记忆归属，避免迁移时临时复制导致 420 条上限误裁剪。
- MCP 选择配置按目标私聊会话合并，源会话配置仅在 app store 和长期记忆校验通过后删除；媒体和知识库 IndexedDB 记录由备份覆盖，消息附件引用保持有效。
- `index.html` 的迁移提示、确认和恢复 DOM 使用 `role-migration-*` 前缀；横屏和竖屏样式分别位于 `src/styles/role-migration-desktop.css`、`src/styles/role-migration-mobile.css`。
- 迁移成功后 `state.roleMigration.completed` 保持确认窗口打开，显示 100% 进度、成功摘要和单独的“完成”按钮；移动返回操作在该状态下只消费事件，不关闭窗口。`#detail-role-migration-action` 仅在当前角色存在迁移候选时显示，并复用 `openRoleMigrationConfirm()`。
- `sw.js` 缓存批次更新为 `fritia-next-chat-v30` 并加入迁移模块与两套布局样式；`package.json` 的 `check` 脚本加入 `role_migration.js`。
