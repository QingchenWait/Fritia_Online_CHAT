海姆休息室支持通过 `LM Studio Bionic` 加载并使用本地部署的 LLM 模型，带来更加自由丰富的使用体验！

### 配置本地 LLM 模型

首先，进入 [LM Studio 官网](https://lmstudio.ai/)，下载并安装 Bionic 软件；

打开 Bionic 软件以后，点击左下角的设置按钮，随后点击左边栏的 `探索` 按钮，选择并下载满足电脑配置的 LLM 模型。一般来说，如果模型下载选项下方，显示绿色的 `Full GPU Offload Possible`，即意味着无需额外配置即可运行该模型。

   ![lm_download](imgs\lm_download.png)

等待模型下载完成后，点击左边栏的 `资源库` 按钮，即可显示已经下载好的模型。如下图所示，红线对应的模型名称，就是稍后要复制到海姆休息室 APP 里的模型名称。

   您也可以点击模型列表后面的设置按钮，对模型的参数进行详细配置。

   ![lm_model](imgs\lm_model.png)

配置完成后，继续点击左边栏的 `本地模型 API` 按钮，开启本地模型服务器。

   - 打开 `本地 API 服务器` 选项后面的开关；
   - 打开 `按需加载模型` 和 `CORS` 两个开关；
   - `基础 URL` 中对应的地址，就是稍后要复制到海姆休息室 APP 里的 API Base URL。

   ![lm_local_server](imgs\lm_local_server.png)

回到海姆休息室 APP，点击左下角的 `设置` 按钮，进入 `大模型` 选项卡，点击对话栏中的 `+ 新增` 按钮，新增一个用于 LM Studio 的配置项：

   - ID：随意填写
   - API Key：留空
   - API Base URL：填写 LM Studio  `本地模型 API` 栏目中的基础 URL；
   - 模型名称：填写 LM Studio  `资源库` 栏目中的模型名称。

填写完成后，务必先点击下图中绿框所示的 `保存配置` 按钮，保存该设置。

随后，如果希望以后优先调用 LM Studio 中的本地模型，则把 `默认对话模型` 选项改为 LM Studio 模型对应的 ID，并点击右下角的 `保存模型设置` 按钮，完成配置。

   ![lm_config_heimchat](imgs\lm_config_heimchat.png)



### 使用本地 LLM 模型

在私聊对话中，点击聊天框中的模型选择按钮。

对于本地模型，会弹出一个如下图所示的 `模型连接` 菜单。

如果您使用的是 Windows 客户端，或通过源码进行本地部署，则无需点击该按钮，即可正常连接。

如果您使用的是 [网页版](https://chat.fritia.online)，则可能需要点击一次 `连接` 按钮。浏览器左上角可能弹出一个 “允许网页访问本地网络” 的弹窗，点击 `允许` 即可成功连接。

![lm_connect](imgs\lm_connect.png)

如果连接不成功，可能需要进一步排查 LM Studio 的相关配置是否正确、海姆休息室 APP 中的模型相关配置项是否填写正确等。

可以查看 LM Studio 的系统日志，以排查问题。