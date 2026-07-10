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
2. 进入 [大模型] 页面，点击 [对话] 栏目中的 `+ 新增` 按钮，此时会弹出几个待填写项。
3. `ID` 可以随便填写你喜欢的字符，不与其他模型重复即可；`API Key` 填写你从供应商那里获取的 API；`base url` 和 `模型名称` 建议参考下表填写：
   |   供应商    |          Base URL 填写           |  模型名称  | 图片识别 |
   |-------------|---------------------------------|----------------------|-------------|
   |  Deepseek   |    https://api.deepseek.com/v1  |  deepseek-v4-flash   |   不支持   |
   |  小米 MiMO  |  https://api.xiaomimimo.com/v1  |      mimo-v2.5       |    支持    |
   |  硅基流动   |  https://api.siliconflow.cn/v1   |  deepseek-v4-flash   |   不支持   |
   |  千问 Qwen  | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen3.6-flash |   支持   |
   | GPT 示例中转 |   https://www.onetopai.com/v1    |    gpt-5.4-mini     |    支持    |

填写完成以后，点击 `保存配置` 按钮 (**不是保存模型设置按钮**)，保存上述 API 配置。

您可以添加多个对话模型 API 服务商。

## 🎙️ 配置声音模型

需要配置声音模型，才能和角色进行语音对话。
本软件的声音模型目前支持 `MiMO TTS`，目前语音克隆功能可以免费使用。

1. 点击侧边栏底部中的设置图标（齿轮）。
2. 进入 [大模型] 页面，点击 [文字转语音] 栏目中的 `+ 新增` 按钮，此时会弹出几个待填写项。
3. `ID` 可以随便填写你喜欢的字符，不与其他模型重复即可；`API Key` 填写从 MiMO 获取的 API (**与对话模型相同**)；`base url` 和 `模型名称` 参考下表填写：
   |     ID      |          Base URL 填写           |        模型名称填写        |
   |-------------|---------------------------------|----------------------------|
   |  mimo-tts   |  https://api.xiaomimimo.com/v1  |  mimo-v2.5-tts-voiceclone  |

填写完成以后，点击 `保存配置` 按钮 (**不是保存模型设置按钮**)，保存上述 API 配置。


## 🔝 配置默认模型

- **默认对话模型**: 文字对话时使用的默认模型；
- **默认文字转语音模型**: 语音对话时使用的默认模型 (即 MiMO TTS)；
- **默认图像转述模型**: 如果对话模型选择了不支持图片的模型 (如 DeepSeek)，则在您发送图片的时候，临时切换到支持识别图片的模型 (如 MiMO 和 Qwen)。

填写完成以后，点击 `保存模型设置` 按钮，保存配置并退出设置页面。


## ✅ 完成

完成上述配置以后，即可返回聊天，与恋人们尽情地畅聊吧 ~