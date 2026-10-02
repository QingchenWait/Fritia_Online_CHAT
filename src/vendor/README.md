# 附件文本解析依赖

本目录的固定版本发行文件仅用于附件解析，不加载远程 CDN。没有采用 Open WebUI 源码；参考其按文件内容/格式选择文本解析器的流程。

- **PDF.js / pdfjs-dist 6.3.289**：Mozilla 的 legacy 发行文件、CMaps 与标准字体。Apache-2.0；目录 LICENSE 及字体自身许可均保留。来源：https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.3.289.tgz 。仅将 pdf.min.mjs / pdf.worker.min.mjs 改名为 .js，以复用原生壳 JavaScript MIME 映射；文件内容未改动。不开启 eval/WASM，不加载 PDF JavaScript/附件或渲染整本 PDF。
- **fflate 0.8.3**：esm/browser.js 原样保存为 fflate.js。MIT；LICENSE 保留。来源：https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz 。用于读取 Office ZIP 中的 XML，内容不写入磁盘，不运行宏。

两个下载包均与官方 npm `dist.integrity` 的 SHA-512 比对通过。逐文件 SHA-256 在 SHA256SUMS.json。动态按需导入；PDF worker 每次解析后销毁。解析文本仅缓存至多 4 项，超过一百万字符的结果不留在内存缓存（请求正文不截断）。Office XML 解压总量超过 64 MiB 时明确停止，不静默截取。

PDF 只做文字提取；图像、复杂排版和文档嵌入媒体不是本地文字提取的内容。官方 OpenAI 用户消息的 PDF 继续发送原文件，以保留服务端页面图像处理；其他端点用本地文字。扫描件需要 OCR 或支持 PDF 图像的接口。Office 旧格式 DOC/XLS/PPT、压缩包、可执行二进制与无法解码的格式会提示并隔离，不删除原文件。
