### 🌟 什么是 MCP？

MCP (Model Context Protocol，模型上下文协议) 类似一种专门给大模型使用的通用 “插件” 或 “APP”。

安装了 MCP 以后，海姆达尔的恋人们，就不止能陪你聊天，更能帮你操作电脑、使用软件、整理笔记、编写代码，成为你最亲密的的贴身特助 ~

### 🌟 如何使用 MCP？

Fritia Online CHAT 支持两种类型的 MCP 服务器：

- **Streamable HTTP**: 独立的 HTTP MCP 服务，更适合部署在线 MCP 服务器 (如 [阿里云百炼](https://bailian.console.aliyun.com/#/mcp-market))。
- **Stdio MCP**: 本地控制能力更强，更适合部署本地电脑里的 MCP 服务 (如 VS Code、Blender)。

需要注意，[网页版 APP](https://chat.fritia.online) 仅支持部署 **在线 Streamable HTTP MCP** 服务。如果需要本地能力，请下载本 APP 的 Windows / Android 客户端。


### 🌟 调用在线 MCP 服务器

在线 MCP 服务器无需本地电脑部署，只需要获取对应 MCP 服务器的地址 (有一些还需要密钥 Key)

可以使用一些提供在线 MCP 服务的厂商，例如：[腾讯云](https://cloud.tencent.com/developer/mcp)、[阿里云百炼](https://bailian.console.aliyun.com/#/mcp-market) 等。

点击 “MCP 客户端” 栏目，新建一个 `Streamable HTTP` 客户端，“服务器名称” 可以自己随便取。

在 “服务器配置 JSON” 中，输入类似以下格式的配置：

```JSON
{
  "transport": "streamable_http",
  "url": "http://[你的MCP服务器地址]",
  "headers": {},
  "timeout": 5,
  "sse_read_timeout": 300
}
```

如果需要密钥 Key，一般需要在 `headers` 中添加：

```JSON
{
  "transport": "streamable_http",
  "url": "http://[你的MCP服务器地址]",
  "headers": { "Authorization": "Bearer [用来访问这个MCP服务器的密钥]" },
  "timeout": 5,
  "sse_read_timeout": 300
}
```

配置完成后，点击 “保存配置”，随后打开 “启用该 MCP 客户端” 的开关即可。

### 🌟 调用本地电脑上的 MCP 服务

在开启前，需要在电脑上安装 [Node.js 18](https://nodejs.org/zh-cn) 以上的版本。

点击 “MCP 客户端” 栏目，新建一个 `Stdio MCP` 客户端，“服务器名称” 可以自己随便取。

在 “服务器配置 JSON” 中，输入类似以下格式的配置：

```JSON
{
  "mcpServers": {
    "[MCP服务器名称]": {
      "command": "npx",
      "args": ["[一些特定的参数]"],
      "timeout": 300
    }
  }
}
```

具体的写法，需要参考对应软件的 MCP 服务器文档进行填写。

**注：** 本 APP 自带了 MCP 官方的 Filesystem MCP，可用来对电脑进行基本的文件读写操作。