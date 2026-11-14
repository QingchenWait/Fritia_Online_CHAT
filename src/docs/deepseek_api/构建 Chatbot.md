# 构建 Chatbot

DeepSeek API 提供与 DeepSeek 网页端和 App 一致的对话能力：联网搜索、深度思考搜索、文件输入、阅读链接，以及基础的模型内容安全风控。你可以用它们构建自己的 Chatbot。

搜索和阅读链接都由服务端完成。客户端只需要展示返回的内容块，并在下一轮把它们原样回传。

***

## 功能对照

| Chatbot 功能 | 介绍                                                                                | 指南                                                                                      |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 联网搜索       | 非思考模式下，打开 `deepseek_web_search` 工具后，模型可根据提问自动发起网页或图片搜索并附引用作答                      | [联网搜索](https://api-docs.deepseek.com/zh-cn/guides/web_tools.md#web-search)              |
| 深度思考搜索     | 思考模式下，打开 `deepseek_web_search` 工具后，模型可在多步推理中自主联网搜索与阅读链接                           | [深度思考搜索](https://api-docs.deepseek.com/zh-cn/guides/web_tools.md#search-while-thinking) |
| 文件输入       | 支持上传 PDF、Word、PowerPoint、图片等格式的文件，完成纯文本提取或图文混排解析后，拼入对话上下文供模型作答                    | [文件解析](https://api-docs.deepseek.com/zh-cn/guides/document_parsing.md)                  |
| 阅读链接       | 打开 `deepseek_read_url` 工具后，模型可自动识别用户消息中的链接，抓取网页内容并结合上下文作答                         | [阅读链接](https://api-docs.deepseek.com/zh-cn/guides/web_tools.md#read-links)              |
| 模型内容安全     | 开启安全校验参数后，我们将提供基础风控，审核模型输入输出，命中风险时返回拒答标识。如您对外提供服务，请开启该参数，并承担内容安全审核、大模型登记、AI 标识等义务 | [模型内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety.md)                          |
| 用户元信息标记    | 把当前日期、用户所在地、语言等信息告诉模型，让回答更贴合用户所处的环境                                               | [用户元信息标记](https://api-docs.deepseek.com/zh-cn/guides/latest_reminder.md)                |
| 会话标题       | 回答结束时，根据对话内容生成一个简短的会话标题                                                           | [会话标题](https://api-docs.deepseek.com/zh-cn/guides/conversation_title.md)                |
| 朗读回答       | 把模型的回答合成为语音播放                                                                     | [语音合成](https://api-docs.deepseek.com/zh-cn/guides/tts.md)                               |
| 语音输入       | 把用户的语音识别为文字，作为消息发送                                                                | [语音识别](https://api-docs.deepseek.com/zh-cn/guides/asr.md)                               |

***

<a id="demo"></a>

## 演示客户端

DeepSeek 提供一个开源的演示用对话客户端，展示如何用这些 API 构建 Chatbot。填写你的 API Key 即可使用；也可以导入从 DeepSeek 网页端导出的历史对话，继续之前的对话。

- 体验入口：<https://cdn.deepseek.com/chat-demo>
- 源码仓库：<https://github.com/deepseek-ai/chat-demo>

API Key、历史对话和上传的图片只保存在你的浏览器本地。该客户端仅供演示。

演示内容：

- 联网搜索、深度思考搜索、阅读链接
- 上传图片与文档
- 模型内容安全，包括图片审核
- 会话标题，重命名与删除会话
- 编辑消息、重新生成、继续生成
- 朗读回答与语音输入
- 在设置中选择语言和所在地，作为用户元信息标记传给模型
- 导入与导出历史对话（导入会覆盖已有对话）
- Markdown 渲染，包括 Mermaid 图表
- 中文与英文界面，浅色与深色主题

***

## 选择协议

以上对话能力已在 Messages API、Responses API 与 Chat Completions API 上提供。

| 协议               | 接口                                                    |
| ---------------- | ----------------------------------------------------- |
| Messages         | `POST https://api.deepseek.com/anthropic/v1/messages` |
| Responses        | `POST https://api.deepseek.com/responses`             |
| Chat Completions | `POST https://api.deepseek.com/chat/completions`      |

请使用 `deepseek-flash` 模型。

***

## 快速示例

开启联网工具、安全审核与会话标题的流式请求：

**Messages**

```bash
curl https://api.deepseek.com/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-flash",
    "thinking": {"type": "enabled"},
    "tools": [
      {"type": "deepseek_web_search", "name": "deepseek_web_search"},
      {"type": "deepseek_read_url", "name": "deepseek_read_url"}
    ],
    "safety_check": {"level": "high"},
    "title": {"enabled": true},
    "messages": [{"role": "user", "content": "DeepSeek V4.1 有哪些更新？"}],
    "stream": true
  }'
```

这个请求的流式响应（有删节）：

```text
event: message_start
data: {"type":"message_start","message":{"id":"b161a9be-...","type":"message","role":"assistant","model":"deepseek-flash","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":40,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0,"service_tier":"standard"}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"b161a9be-..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"server_tool_use","id":"srvtoolu_ds_00_b2baebaf...","name":"deepseek_web_search","input":{"action":"search","queries":["DeepSeek V4.1 new features","DeepSeek V4.1 release notes"]},"caller":{"type":"direct"},"kind":"deep_search"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: content_block_start
data: {"type":"content_block_start","index":2,"content_block":{"type":"web_search_tool_result","tool_use_id":"srvtoolu_ds_00_b2baebaf...","content":[{"type":"web_search_result","title":"...","url":"https://api-docs.deepseek.com/news/news261017/","encrypted_content":"...","page_age":"2026-10-16T16:00:00+00:00","snippet":"...","site_name":"DeepSeek","site_icon":"https://cdn.deepseek.com/site-icons/deepseek.com"}],"kind":"deep_search"}}

...

event: content_block_start
data: {"type":"content_block_start","index":15,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":15,"delta":{"type":"text_delta","text":"Deep"}}

event: content_block_delta
data: {"type":"content_block_delta","index":15,"delta":{"type":"citations_delta","citation":{"type":"web_search_result_location","url":"https://api-docs.deepseek.com/news/news261017/","title":"...","encrypted_index":"","cited_text":"..."}}}

...

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"title":"..."},"usage":{"input_tokens":9078,"cache_creation_input_tokens":0,"cache_read_input_tokens":4096,"output_tokens":1686,"service_tier":"standard","server_tool_use":{"web_search_requests":1,"web_fetch_requests":0,"tool_search":2,"tool_fetch":0,"tool_image_search":0}}}

event: message_stop
data: {"type":"message_stop"}
```

**Responses**

```bash
curl https://api.deepseek.com/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-flash",
    "reasoning": {"effort": "high"},
    "tools": [
      {"type": "deepseek_web_search"},
      {"type": "deepseek_read_url"}
    ],
    "safety_check": {"level": "high"},
    "title": {"enabled": true},
    "input": "DeepSeek V4.1 有哪些更新？",
    "stream": true
  }'
```

**Chat Completions**

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-flash",
    "thinking": {"type": "enabled"},
    "tools": [
      {"type": "deepseek_web_search"},
      {"type": "deepseek_read_url"}
    ],
    "safety_check": {"level": "high"},
    "title": {"enabled": true},
    "messages": [{"role": "user", "content": "DeepSeek V4.1 有哪些更新？"}],
    "stream": true
  }'
```

***

## 渲染响应

Chatbot 的一次响应包含多种内容块。下图标出了各类块在 DeepSeek 网页端中对应的位置。

![一段 DeepSeek 网页端对话，标出了思考、搜索、阅读网页与回答正文对应的内容块](https://api-docs.deepseek.com/zh-cn/img/chatbot_response_blocks_cn.webp)

| 内容块                                          | 界面展示                 |
| -------------------------------------------- | -------------------- |
| `thinking`                                   | 可折叠的思考过程             |
| `server_tool_use` + `web_search_tool_result` | 一次搜索及结果卡片（标题、站点名、图标） |
| `server_tool_use` + `web_fetch_tool_result`  | 一次打开网页或阅读链接          |
| 带 `citations` 的 `text`                       | 回答正文，引用角标链接到来源       |
| `stop_reason: "refusal"`                     | 用你的拒答文案替换已展示的回答      |

各内容块的格式见 [联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools.md#response-blocks) 与 [模型内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety.md#handling-refusals)。

***

<a id="ignored-parameters"></a>

## 被忽略的参数

声明了 `deepseek_web_search` 或 `deepseek_read_url`、`safety_check` 为 `high`，或开启了 `title` 时，以下参数由服务端决定，请求中传入的值会被忽略：

| 协议               | 被忽略的参数                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Messages         | `temperature`、`top_p`、`top_k`、`stop_sequences`、`thinking.budget_tokens`、`preserve_thinking`、`tool_choice.disable_parallel_tool_use`、`metadata`（`user_id` 除外） |
| Responses        | `temperature`、`top_p`、`reasoning.summary`、`text.verbosity`、`include`、`max_tool_calls`、`truncation`、`metadata`、`parallel_tool_calls`、`store`                  |
| Chat Completions | `temperature`、`top_p`、`frequency_penalty`、`presence_penalty`、`stop`、`seed`、`n`、`preserve_thinking`、`parallel_tool_calls`                                     |

`max_tokens`（Responses API 为 `max_output_tokens`）照常生效，限制的是一轮中每一步推理的输出长度，而不是整轮的总输出。

***

<a id="compliance"></a>

## 合规要求

- 开启安全校验参数后，我们将提供基础风控，审核模型输入输出，命中风险时返回拒答标识。如您对外提供服务，请开启该参数，并自行履行服务提供者应承担的内容安全审核、大模型登记、AI 标识等义务。
- 请您遵守我们的开放平台服务协议：[DeepSeek 开放平台服务协议](https://cdn.deepseek.com/policies/zh-CN/deepseek-open-platform-terms-of-service.html)。
