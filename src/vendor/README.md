# 本地解析依赖

## 聊天分享图

- **html-to-image 1.11.13**：官方浏览器发行文件原样保存至 `html-to-image/html-to-image.js`，保留 MIT `LICENSE`。来源：[固定发行文件](https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js)、[官方项目](https://github.com/bubkoo/html-to-image)。只在生成分享图时动态加载，运行时无远程 CDN。
- 分享图复用 APP 消息 DOM，以有界 Canvas 分段绘制；复用本目录 **fflate 0.8.3** 的 Zlib 增量生成一个 PNG。字体/图片先加载，CSS 白色 SVG 滤镜栅格化，远程图片要求 CORS；未读取到的图片明确报错。没有服务端截图、LLM 图片生成或原生新增桥。
- 图标位于 `src/_logo/icons`，来源 [Lucide 官方静态包 0.468.0](https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/)，新增 list-checks/share-2/copy 与重新下载的 trash-2/x；ISC 许可在 `LUCIDE-LICENSE`。

本目录保存固定版本发行文件，运行时不加载远程 CDN。附件解析没有采用 Open WebUI 源码；参考其按文件内容/格式选择文本解析器的流程。

- **PDF.js / pdfjs-dist 6.3.289**：Mozilla 的 legacy 发行文件、CMaps 与标准字体。Apache-2.0；目录 LICENSE 及字体自身许可均保留。来源：https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz 。仅将 pdf.min.mjs / pdf.worker.min.mjs 改名为 .js，以复用原生壳 JavaScript MIME 映射；文件内容未改动。不开启 eval/WASM，不加载 PDF JavaScript/附件或渲染整本 PDF。
- **fflate 0.8.3**：esm/browser.js 原样保存为 fflate.js。MIT；LICENSE 保留。来源：https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz 。用于读取 Office ZIP 中的 XML，内容不写入磁盘，不运行宏。

两个下载包均与官方 npm `dist.integrity` 的 SHA-512 比对通过。逐文件 SHA-256 在 SHA256SUMS.json。动态按需导入；PDF worker 每次解析后销毁。解析文本仅缓存至多 4 项，超过一百万字符的结果不留在内存缓存（请求正文不截断）。Office XML 解压总量超过 64 MiB 时明确停止，不静默截取。

PDF 只做文字提取；图像、复杂排版和文档嵌入媒体不是本地文字提取的内容。官方 OpenAI 用户消息的 PDF 继续发送原文件，以保留服务端页面图像处理；其他端点用本地文字。扫描件需要 OCR 或支持 PDF 图像的接口。Office 旧格式 DOC/XLS/PPT、压缩包、可执行二进制与无法解码的格式会提示并隔离，不删除原文件。

## 公告 HTML 转 Markdown

- **Turndown 7.2.0**：MIT；`turndown/turndown.js` 为官方 npm 的 `lib/turndown.es.js` 原样保存，保留 `turndown/LICENSE`。来源：[固定版本发行文件](https://cdn.jsdelivr.net/npm/turndown@7.2.0/lib/turndown.es.js)、[官方项目](https://github.com/mixmark-io/turndown)。逐文件 SHA-256 记录于 SHA256SUMS.json。
- 公告 HTML 在惰性 template 内移除脚本、嵌入对象和非 HTTP(S) 链接，再转换成 Markdown；复用 APP 现有渲染器，公告专用选项保留正文换行。普通 Markdown 直接交给现有渲染器。
