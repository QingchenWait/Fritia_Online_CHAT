## ℹ️ 从大模型服务商获取 API

需要至少一个 AI 大模型服务商，才可以和角色开始聊天。

本 APP 支持 `OpenAI` 兼容格式的 API。如果您之前没有注册或使用过 API，请先任意选择一家兼容的供应商，进行注册与充值。

以下是一些主流 AI 大模型的 API 获取渠道：

- **Deepseek**: [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **小米 MiMO**: [https://platform.xiaomimimo.com/console/api-keys](https://platform.xiaomimimo.com/console/api-keys)
- **硅基流动**: [https://cloud.siliconflow.cn/me/account/ak](https://cloud.siliconflow.cn/me/account/ak)
- **千问 Qwen**: [https://bailian.console.aliyun.com/?tab=model#/api-key](https://bailian.console.aliyun.com/?tab=model#/api-key)
- **GPT 中转站**: [示例站点](https://www.onetopai.com/register?aff=edZL) (中转站虽然便宜，但服务不如官方稳定，请谨慎选择)

其中，小米 MiMO 的 API 也可以用于本 APP 中的角色语音功能。

## 📢 配置对话模型

需要配置至少一个 AI 大模型服务商，才可以和角色开始聊天。

1. 点击侧边栏底部中的设置图标（齿轮）。
2. 进入 [大模型] 页面，点击 [对话] 栏目中的 `+ 新增` 按钮，在按钮下方选择 DeepSeek、MiMO、Qwen、OpenAI、GLM、Kimi、本地模型或自定义。选择预设后会自动填写名称、Base URL 和模型名称；重复名称会自动追加序号。
3. `配置名称` 不与其他模型重复即可；`API Key` 填写你从供应商获取的密钥。输入栏右侧“获取”图标会按 **Base URL 输入框当前内容** 打开对应官网，修改网址后无需先保存；未知网址时按钮置灰。网页端打开新标签，客户端打开系统浏览器。
4. 预设的 Base URL 和模型名称如下，也可根据自己的服务商配置修改：

   | 预设 | Base URL | 模型名称 |
   | --- | --- | --- |
   | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-flash` |
   | MiMO | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-flash` |
   | Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` |
   | OpenAI | `https://api.openai.com/v1` | `gpt-6-luna` |
   | GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3-flash` |
   | Kimi | `https://api.moonshot.cn/v1` | `kimi-k3` |
   | 本地模型 | `http://localhost:1234/v1` | 留空，使用前填写已加载模型 ID |

   其他兼容服务的配置示例：
   |   供应商    |          Base URL 填写           |  模型名称  | 图片识别 |
   |-------------|---------------------------------|----------------------|-------------|
   |  Deepseek   |    https://api.deepseek.com/v1  |  deepseek-v4-flash   |   不支持   |
   |  Deepseek   |    https://api.deepseek.com/v1  |  deepseek-flash   |   支持   |
   |  小米 MiMO  |  https://api.xiaomimimo.com/v1  |      mimo-v2.6-flash       |    支持    |
   |  硅基流动   |  https://api.siliconflow.cn/v1   |  deepseek-v4-flash   |   不支持   |
   |  千问 Qwen  | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen3.7-flash |   支持   |
   | GPT 示例中转 |   https://www.onetopai.com/v1    |    gpt-6-luna     |    支持    |

填写完成以后，点击 `保存配置` 按钮 (**不是保存模型设置按钮**)，保存上述 API 配置。

您可以添加多个对话模型 API 服务商。

## 🎙️ 配置声音模型

需要配置声音模型，才能和角色进行语音对话。
本软件的声音模型目前支持 `MiMO TTS`，目前语音克隆功能可以免费使用。

1. 点击侧边栏底部中的设置图标（齿轮）。
2. 进入 [大模型] 页面，点击 [文字转语音] 栏目中的 `+ 新增` 按钮，此时会弹出几个待填写项。
3. `ID` 可以随便填写你喜欢的字符，不与其他模型重复即可；`API Key` 填写从 MiMO 获取的密钥，可以与对话模型使用相同或不同密钥；`base url` 和 `模型名称` 参考下表填写：
   |     ID      |          Base URL 填写           |        模型名称填写        |
   |-------------|---------------------------------|----------------------------|
   |  mimo-tts   |  https://api.xiaomimimo.com/v1  |  mimo-v2.5-tts-voiceclone  |

填写完成以后，点击 `保存配置` 按钮 (**不是保存模型设置按钮**)，保存上述 API 配置。

如果已保存新的或修改后的 MiMO 对话密钥，APP 会自动复制到默认 MiMO TTS（或首个已有 MiMO TTS）配置；没有时会创建一项。之后可以在本页单独改用其他 TTS 密钥，对话密钥不会跟着改变。保存未变化的对话密钥或其他设置也不会覆盖单独设置的 TTS 密钥。TTS 页“新增”仍直接创建配置，不弹出预设菜单。


## 🔝 配置默认模型

- **默认对话模型**: 文字对话时使用的默认模型；
- **默认文字转语音模型**: 语音对话时使用的默认模型 (即 MiMO TTS)；
- **默认图像转述模型**: 如果对话模型选择了不支持图片的模型 (如 DeepSeek)，则在您发送图片的时候，临时切换到支持识别图片的模型 (如 MiMO 和 Qwen)。

填写完成以后，点击 `保存模型设置` 按钮，保存配置并退出设置页面。


## ✅ 完成

完成上述配置以后，即可返回聊天，与恋人们尽情地畅聊吧 ~


## 上传脚本与文档

聊天输入栏的文件按钮支持脚本、代码、配置、日志与可读文本；例如 CMD 不需要改名为 TXT。也可读取 PDF、DOCX、XLSX、PPTX 的文字内容。脚本/宏/公式不会在 APP 内自动执行，文档内嵌图片和复杂图表不属于本地文字提取范围。

遇到“附件读取失败”时，先查看文件名、具体原因和模型原始错误；这与 API Key/模型配置错误不同。超长 error 可展开完整查看。该附件仍可从原聊天气泡下载，但后续上下文会跳过，不会拖累之后的纯文本对话。扫描/加密文档、旧 Office、压缩包和其他不支持的二进制需先转换为可读格式；APP 不会用乱码、空文本或截断正文伪装成功。
