"""Stage v1.0.2 only inside the explicitly authorized output directory."""
from pathlib import Path
import shutil

project = Path(__file__).resolve().parents[2]
parent = project.parent / 'fritia_online_next_desktop'
old, new = parent / 'chat_v1.0.1', parent / 'chat_v1.0.2'
assert new.resolve() == Path(r'D:\Models\vibe_coding\fritia_online_next_desktop\chat_v1.0.2').resolve()
new.mkdir(exist_ok=True)
ignore = shutil.ignore_patterns('target', '*.before-*', '__pycache__')

def copy(source, dest):
    assert dest.resolve().is_relative_to(new.resolve())
    dest.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir(): shutil.copytree(source, dest, dirs_exist_ok=True, ignore=ignore)
    elif source.is_file(): shutil.copy2(source, dest)

for name in ['src-tauri', 'BUILD.ps1']:
    copy(old / 'win_x64' / name, new / 'win_x64' / name)
copy(old / 'android_arm/tools', new / 'android_arm/tools')
for platform in ['win_x64', 'android_arm']:
    stage = new / platform / 'source'
    for name in ['src', 'tools', 'backend', 'index.html', 'package.json', 'README.md', 'DEVELOP.md', 'STRUCTURE.md', 'sw.js', 'manifest.webmanifest', 'favicon.ico', 'LICENSE']:
        copy(project / name, stage / name)
    if platform == 'win_x64':
        for name in ['desktop_fetch_proxy.js', 'desktop_mcp_relay.js']:
            copy(old / platform / 'source/src/js' / name, stage / 'src/js' / name)
        before = (old / platform / 'source/index.html').read_text(encoding='utf-8')
        suffix = before[before.rfind('  <script>'):].replace('1.0.1', '1.0.2')
        assert '__FRITIA_DISABLE_SERVICE_WORKER__' in suffix
        page = (stage / 'index.html').read_text(encoding='utf-8')
        (stage / 'index.html').write_text(page[:page.rfind('  <script type="module"')]+suffix, encoding='utf-8')
        main = stage / 'src/js/main.js'
        main.write_text(main.read_text(encoding='utf-8').replace("if ('serviceWorker' in navigator", "if (!window.__FRITIA_DISABLE_SERVICE_WORKER__ && 'serviceWorker' in navigator"), encoding='utf-8')
        build = stage / 'tools/build_static.mjs'
        build.write_text(build.read_text(encoding='utf-8').replace("  'index.html',", "  'index.html',\n  'favicon.ico',"), encoding='utf-8')
    (new / platform / 'logs').mkdir(exist_ok=True)
    (new / platform / 'release').mkdir(exist_ok=True)

for relative in ['win_x64/BUILD.ps1','win_x64/src-tauri/Cargo.toml','win_x64/src-tauri/tauri.conf.json','win_x64/src-tauri/src/main.rs','android_arm/tools/build-chat-apk.ps1','android_arm/tools/templates/app/src/com/fritia/next/chat/MainActivity.java']:
    path = new / relative
    text = path.read_text(encoding='utf-8-sig').replace('1.0.1','1.0.2')
    if relative == 'win_x64/BUILD.ps1':
        text = text.replace("    Run-Npm 'test:archive-legacy'", "    Run-Npm 'test:archive-legacy'\n    Run-Npm 'test:attachments'")
    if relative.endswith('build-chat-apk.ps1'):
        text = text.replace('10001','10002')
        text = text.replace('if (-not $full.StartsWith($OutRoot,', "if (-not $full.StartsWith($OutRoot + [IO.Path]::DirectorySeparatorChar,")
    path.write_text(text,encoding='utf-8')
lock = new / 'win_x64/src-tauri/Cargo.lock'
lock.write_text(lock.read_text(encoding='utf-8').replace('name = "fritia-next-chat"\nversion = "1.0.1"','name = "fritia-next-chat"\nversion = "1.0.2"'),encoding='utf-8')

main = new / 'win_x64/src-tauri/src/main.rs'
text = main.read_text(encoding='utf-8')
start = text.index('fn ensure_modelscope_source_window(')
end = text.index('\nfn inject_modelscope_login_guide',start)
section = text[start:end].replace('tauri::Url::parse(MODELSCOPE_MCP_HOME_URL)', 'tauri::Url::parse("https://www.modelscope.cn/login")')
text = text[:start]+section+text[end:]
main.write_text(text,encoding='utf-8')

main = new / 'android_arm/tools/templates/app/src/com/fritia/next/chat/MainActivity.java'
text = main.read_text(encoding='utf-8')
text = text.replace('private static final String MODELSCOPE_LOGIN_URL = MODELSCOPE_ORIGIN + "/mcp?hosted=1";', 'private static final String MODELSCOPE_HOME_URL = MODELSCOPE_ORIGIN + "/mcp?hosted=1";\n    private static final String MODELSCOPE_LOGIN_URL = MODELSCOPE_ORIGIN + "/login";')
text = text.replace('if (!isModelScopeUrl(currentUrl)) {\n            modelScopeReady = false;\n            modelScopeWebView.loadUrl(MODELSCOPE_LOGIN_URL);', 'if (visible || !isModelScopeUrl(currentUrl)) {\n            modelScopeReady = false;\n            modelScopeWebView.loadUrl(visible ? MODELSCOPE_LOGIN_URL : MODELSCOPE_HOME_URL);')
text = text.replace('source.loadUrl(MODELSCOPE_LOGIN_URL);','source.loadUrl(MODELSCOPE_HOME_URL);')
if 'archiveBridge.close();' not in text:
    text = text.replace('protected void onDestroy() {', 'protected void onDestroy() {\n        if (archiveBridge != null) archiveBridge.close();', 1)
main.write_text(text,encoding='utf-8')
copy(project / 'tools/native/android/FritiaArchiveBridge.java', main.with_name('FritiaArchiveBridge.java'))
print('Prepared v1.0.2 source trees:', new)
