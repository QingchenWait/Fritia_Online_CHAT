# v1.0.1 原生配套源码

静态 JS 无法修复旧 Android HTTP 栈的扩展方法支持，也不能直接调用 Android 系统文件创建界面。此目录保存所需的最小原生补丁，不是安装包。

- `android/FritiaArchiveBridge.java`：OkHttp WebDAV 扩展方法、同源重定向、安全的 204 响应回传；SAF 系统保存路径、受限 URI 写入、用户点击时读取剪贴板。
- `windows/archive_dialog.rs`：Tauri 命令 `choose_archive_file` / `write_archive_file`；后台线程调用 Windows 原生 GetSaveFileNameW 保存窗口，不阻塞 WebView；只接受用户刚选择的路径。可选 `mime` 仅接受 `application/zip`（默认）或 `image/png`，分别使用 ZIP/PNG 过滤器和默认扩展名。
- `apply_archive_bridges.py`：向指定壳层源码和 Android 模板接入桥接，保留 `.before-archive-v101` 文件；Android 编译脚本加入依赖 classpath。必须先获得目标目录写入授权，不会自行构建。
- `prepare_v101_sources.py`：专用于本次获授权的 `chat_v1.0.1`，复制原平台源码并覆盖本轮前端变动，保留已有平台注入，更新版本；不运行打包。

本轮已使用用户授权的新目录 `D:\Models\vibe_coding\fritia_online_next_desktop\chat_v1.0.1`。旧目录没有修改；已有安装包仍需日后重新构建才能使用新原生功能。

Android 依赖来自 Maven Central 原始 JAR，不修改库源码：

| 文件 | 原始来源 | 许可证 |
| --- | --- | --- |
| okhttp-4.12.0.jar | https://repo.maven.apache.org/maven2/com/squareup/okhttp3/okhttp/4.12.0/okhttp-4.12.0.jar | Apache-2.0 |
| okio-jvm-3.6.0.jar | https://repo.maven.apache.org/maven2/com/squareup/okio/okio-jvm/3.6.0/okio-jvm-3.6.0.jar | Apache-2.0 |
| kotlin-stdlib-1.8.21.jar | https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/1.8.21/kotlin-stdlib-1.8.21.jar | Apache-2.0 |
| annotations-13.0.jar | https://repo.maven.apache.org/maven2/org/jetbrains/annotations/13.0/annotations-13.0.jar | Apache-2.0 |

校验见 `android/SHA256SUMS.txt`。许可证保存于 `android/licenses/`，原 JAR 内的附带 NOTICE 保持原样；发布时应保留这些文件。静态站点构建不会把此目录纳入网页资源，Android 脚本将 JAR 交给 javac/D8。

验证范围：Android Activity 与桥接源码经 Java 编译；Windows 模块以现有 Tauri/base64 元数据进行 Rust 类型检查；JS 有原生回调模拟与隔离浏览器测试。未执行 APK/D8/EXE 生成，也没有真机 WebDAV/系统保存窗口验收。


## v1.0.2 构建入口

最新授权输出为 `D:\Models\vibe_coding\fritia_online_next_desktop\chat_v1.0.2`。`prepare_v102_sources.py` 从 v1.0.1 原生壳和当前前端创建独立源码树，更新版本与可见 ModelScope 登录地址；不执行旧 prepare_v101_sources.py。Windows / Android 构建流程、成品测试及实际限制以新目录 BUILD_PROCESS.md 为准。Android 签名口令仅使用临时进程环境变量，不写入源码、日志或发布包。


### v1.0.2 附件修复再打包

沿用本目录暂存流程与外部 v1.0.2 原生壳，版本、包名、签名证书不变。PDF.js / fflate、字体及 CMaps 随 src 复制到实际 EXE/APK；JavaScript 发行文件以 .js 扩展名适配已有原生 MIME 映射。专用验证使用 tools/attachment_runtime_cases.mjs 在实际 release WebView 执行；测试驱动和受控模型响应不进入发布资源。以外部 BUILD_PROCESS.md 最新的“附件修复”记录为本批校验结果。


### v1.0.2 图谱触控与恢复数量修复再打包

本批只更新前端画布手势声明、恢复副本事务和数量控件；原生桥、包名、版本及证书不变。源码与产物继续位于授权的 chat_v1.0.2。验收使用真实 Chromium/WebView2 触控输入协议、专用 Android 模拟器和 recovery_limit_cases.mjs；本批报告存于 validation/graph-recovery，构建过程见两端 BUILD_PROCESS.md。


### v1.1.0 PNG 保存

分享图优先使用原生文件保存窗口，用户可选择位置和重命名。Android chooseFile 按请求 MIME 限定 ZIP/PNG，PNG 使用 image/png 的 ACTION_CREATE_DOCUMENT；沿用分块会话、所选 URI 和完整关闭校验。Windows 保持原命令及一次性路径授权，PNG 请求增加 mime 字段，ZIP 不传该字段时仍使用原过滤器。默认名称为保存时本地时间 `海姆休息室_YYMMDD_HHMMSS.png`。取消不写入，失败不提示成功。必须同步规范源码并重新构建两个客户端；实际系统保存窗口测试与构建记录位于外部 chat_v1.1.0。

### v1.0.2 Android ZIP 分块保存

Android 保存桥改为 beginWrite / writeChunk / finishWrite / abortWrite，每次最多 128 KiB，按会话与偏移顺序写入 OutputStream；全部关闭成功才确认 saved。MainActivity.onDestroy 调用 close() 释放资源。集成脚本和未来暂存脚本均使用本目录规范源码。本批只构建 android_arm，没有生成或替换 Windows 客户端；共享前端的完成提示随下次 Windows 构建生效。旧客户端无法仅靠网页代码得到新原生方法，请使用新 APK。旧包 0KB/OOM 复现及大存档测试见外部 validation/zip-export。
