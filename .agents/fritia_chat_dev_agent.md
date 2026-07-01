# 芙提雅 ONLINE NEXT Chat 开发约束 Agent

你是本项目的通用开发约束 Agent。所有开发、重构、调试和文档维护都必须围绕以下目标执行：

本项目要开发为一个仿 QQ、Telegram 界面布局的角色扮演 AI 聊天软件。它应实现大部分 IM 即时通讯工具的聊天能力，但聊天对象主要是系统内 AI 角色，同时支持 AI 聊天机器人常见能力。

## 开发准则：
- 架构必须支持跨平台，并尽量降低移动端资源占用。
- 本项目是 `D:\Models\vibe_coding\fritia_online_v3 (dev)` 中“芙提雅 ONLINE NEXT”的衍生版本；遇到相近功能时，优先参考该项目既有实现方式。
- 新功能实现前，优先联网检索成熟开源实现、库或方案，能复用则不要重复造轮子。
- 调试和命令执行优先使用 PowerShell 7 (`pwsh`) 或 `cmd`，不要使用 Windows PowerShell 5。

## Windows command policy

Prefer PowerShell 7 using this executable:

"C:\Program Files\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "<command>"

If that fails, try:

pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "<command>"

Do not silently switch to cmd.exe unless both PowerShell 7 attempts fail.

## UI 准则：
- 必须同时规划并实现桌面端横屏和移动端竖屏两套布局，必须在两套布局下都设计美观正确的 UI 布局，适配不同的分辨率和缩放比例。
- 横屏和竖屏布局，必须分别写在独立文件里、写成两套独立的交互逻辑。当用户特别要求只更改其中的某一套布局时，不要更改另一套布局；用户未作要求时，则参考设计准则 `src/ui_rules/ui_design_rules.md` 对两套布局进行同步更改。
- UI 风格参考 QQ、Telegram，并严格参考设计准则 `src/ui_rules/ui_design_rules.md` 与视觉概念图 `src/ui_rules/UI_Design.png`。
- 对于软件里的按钮，必须尽可能多地从网络上下载并使用 SVG 或 PNG 图标作为按钮元素。如果按钮宽度足够，那么就使用“文字+图标”的形式构造按钮。如果按钮较小，则只使用图标构造按钮。除非用户在提示词或给出的设计图中，明确说明按钮不包含图标元素，否则应尽可能地使用外部下载的图标资源，不能够大量使用纯文字按钮，禁止使用自行绘制 SVG 的方式代替外部图标资源。图标资源均应该放置在 `./src/_logo` 目录中。
- 界面应简洁、美观、现代，保留聊天软件的清晰信息层级，并包含必要的切换动画、悬浮效果和交互状态。
- 图标、Logo、头像、插图等美术资源优先从互联网下载高质量素材，统一放入 `src/_logo`；不要优先让 Codex 自行绘制素材。

## 必须规避的行为
- 在处理 LLM 返回结果的相关函数中，必须必须非常谨慎地应用“截断” (如设置 max_tokens) 处理。例如，当要求 LLM 输出 JSON 格式文本的时候，禁止对返回文本进行任何形式的截断，否则这会导致 JSON 结构错误。
- 不能够大量使用纯文字按钮，禁止使用自行绘制 SVG 的方式代替外部图标资源。

## 文档维护：
- 每次功能变更后同步维护 `README.md`：面向用户记录功能说明和使用方式。
- 每次结构或版本变更后同步维护 `DEVELOP.md`：记录版本更新、结构变动和开发注意事项。
- 每次新增页面、模块、API、函数或 UI 映射后，同步维护 `STRUCTURE.md`：记录完整文件结构、内部 API、HTML 页面元素功能映射及核心逻辑。

## 工作方式：
- 先阅读现有项目结构、UI 规则和相关实现，再做修改。
- 优先小步、低风险、可验证地修改，不破坏现有入口、角色、聊天内容和配置字段含义。
- 修改完成后必须说明改动文件、实现内容、桌面端和移动端适配方式，以及已执行或未能执行的验证步骤。
