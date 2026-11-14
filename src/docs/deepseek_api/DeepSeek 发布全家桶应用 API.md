# DeepSeek 发布全家桶应用 API

在 DeepSeek App（含网页端）的对话服务中，联网搜索、文件输入、阅读链接、语音交互及安全等能力与模型推理相互配合，构成了用户熟悉的对话体验。而开发者如果想要在应用中实现类似功能，除接入原有 DeepSeek API 外，往往还需耗费大量精力去对接外部工具、处理调用衔接。

今天，我们正式开放这套**全家桶应用 API**：在原有 API 中开启对应参数，即可获得深度思考搜索、文件输入等对话功能；语音及相关底层能力也已开放独立接口（含 OCR、ASR、TTS 等），支持单独或组合调用。开发者可以在自己的应用中轻松实现复杂的对话功能，甚至 1:1 复刻出完整的 DeepSeek App。

***

## 全面开放应用功能，支持独立调用

本次更新将 DeepSeek App 的各项交互功能直接整合进原有 API。开启对应参数后，相关工具调用与上下文拼接均由服务端自动完成。目前，V4.1-Flash 模型（`deepseek-flash`）已在 `Messages`、`Responses` 与 `Chat Completions` 接口下支持以下能力：

- **联网搜索**：在非思考模式下，打开 `deepseek_web_search` 工具后，模型可根据提问自动发起网页或图片搜索并附引用作答；
- **深度思考搜索**：在思考模式下，打开 `deepseek_web_search` 工具后，模型可在多步推理中自主联网搜索与阅读链接；
- **文件输入**：支持上传 PDF、Office、图片等格式的文件，完成纯文本提取或图文混排解析后，拼入对话上下文供模型作答；
- **阅读链接**：将 `deepseek_read_url` 工具打开后，模型可自动识别用户消息中的链接，抓取网页内容并结合上下文作答；
- **模型安全**：开启安全校验参数后，我们将提供基础风控，审核模型输入输出，命中风险时返回拒答标识。如您对外提供应用服务，请务必开启该参数，并承担内容安全审核、大模型登记、AI 标识等义务。

此外，为方便开发者更灵活地接入自有工作流，上述底层能力及语音能力**均支持作为独立接口单独调用**，包括：Search、Fetch、OCR、ASR、TTS。

使用上述接口，开发者即可实现与 DeepSeek App 基本一致的功能。为直观演示这一效果，我们基于新版 API 构建并开源了一份轻量的前端 Demo，支持直接导入 DeepSeek 历史对话。

- **Demo 体验入口：**<https://cdn.deepseek.com/chat-demo>
- **示例代码入口**：<https://github.com/deepseek-ai/chat-demo>

更详细的参数定义与调用说明，请参考 DeepSeek 官方 API 文档 [API 指南 - 构建 Chatbot](https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot.md)。

***

## API 定价说明

用户调用 DeepSeek API 使用扩展能力时，除收取 Token 费用外，也将收取相关工具的调用费用。各项工具价格如下表所示：

![](https://api-docs.deepseek.com/zh-cn/img/app_api_261113_pricing_cn.png)

***

## 写在后面的话

我们相信，人与模型的交互依然充满无限可能，而 DeepSeek 现有的对话产品只是较为基础的一种形态。

现在，官方产品背后的各项能力均已支持通过 DeepSeek API 随心调用、自由组合，我们期待开发者能够借此省去重复的基础工作，打造出更多样、更极致、更具想象力的产品。

欢迎使用 DeepSeek API，尽情创造。

![](https://api-docs.deepseek.com/zh-cn/img/v4-hire.jpeg)
