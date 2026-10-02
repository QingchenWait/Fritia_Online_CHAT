# v1.0.1 原生配套源码

静态 JS 无法修复旧 Android HTTP 栈的扩展方法支持，也不能直接调用 Android 系统文件创建界面。此目录保存所需的最小原生补丁，不是安装包。

- `android/FritiaArchiveBridge.java`：OkHttp WebDAV 扩展方法、同源重定向、安全的 204 响应回传；SAF 系统保存路径、受限 URI 写入、用户点击时读取剪贴板。
- `windows/archive_dialog.rs`：Tauri 命令 `choose_archive_file` / `write_archive_file`；后台线程调用 Windows 原生 GetSaveFileNameW 保存窗口，不阻塞 WebView；只接受用户刚选择的路径。
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
