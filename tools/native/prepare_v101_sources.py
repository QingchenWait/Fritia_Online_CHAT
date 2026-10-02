"""Refresh the authorized v1.0.1 source staging only. Never builds an app."""
from pathlib import Path
import shutil, subprocess, json

project = Path(__file__).resolve().parents[2]
parent = project.parent / 'fritia_online_next_desktop'
old = parent / 'chat_v1.0.0'
new = parent / 'chat_v1.0.1'
assert new.is_dir(), 'Create the separately authorized v1.0.1 shell source directory first'
changed = subprocess.check_output(['git','diff','--name-only','-z'],cwd=project).decode().split('\0')
added = subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=project).decode().split('\0')
allowed = ('src/', 'tools/', 'backend/')
root_files = {'index.html','package.json','README.md','DEVELOP.md','STRUCTURE.md','sw.js','manifest.webmanifest','favicon.ico'}
for platform in ['android_arm','win_x64']:
    stage = new / platform / 'source'
    stage.mkdir(exist_ok=True)
    for name in ['src','tools','backend',*root_files]:
        item = old / platform / 'source' / name
        if not item.exists(): continue
        if item.is_dir(): shutil.copytree(item, stage / name, dirs_exist_ok=True)
        else: shutil.copy2(item, stage / name)
    for name in changed + added:
        if not name or not (name.startswith(allowed) or name in root_files): continue
        item = project / name
        if not item.is_file(): continue
        destination = stage / name
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(item,destination)
    if platform == 'win_x64':
        # Keep the established native injection and SW exclusion, while using
        # the current page markup. Other platform-specific files stay intact.
        previous = (old / platform / 'source/index.html').read_text(encoding='utf-8')
        start = previous.rfind('  <script>')
        assert '__FRITIA_DISABLE_SERVICE_WORKER__' in previous[start:]
        suffix = previous[start:].replace('1.0.0','1.0.1')
        page = (stage/'index.html').read_text(encoding='utf-8')
        start = page.rfind('  <script type="module"')
        assert start >= 0
        (stage/'index.html').write_text(page[:start]+suffix,encoding='utf-8')
        # Frontend files are merely staged for Tauri's source checks, not built.
        app = new / platform / 'app'
        app.mkdir(exist_ok=True)
        for name in ['src','backend','index.html','manifest.webmanifest','sw.js','favicon.ico']:
            item = stage/name
            if item.is_dir(): shutil.copytree(item,app/name,dirs_exist_ok=True)
            elif item.exists(): shutil.copy2(item,app/name)

for relative in ['android_arm/app/src/com/fritia/next/chat/MainActivity.java',
                 'android_arm/tools/templates/app/src/com/fritia/next/chat/MainActivity.java',
                 'android_arm/tools/build-chat-apk.ps1',
                 'android_arm/app/AndroidManifest.xml',
                 'win_x64/src-tauri/Cargo.toml','win_x64/src-tauri/tauri.conf.json',
                 'win_x64/src-tauri/src/main.rs','win_x64/BUILD.ps1','win_x64/PACKAGE.ps1']:
    path = new/relative
    before = path.read_text(encoding='utf-8-sig')
    after = before.replace('1.0.0','1.0.1')
    if relative.endswith('build-chat-apk.ps1') or relative.endswith('AndroidManifest.xml'):
        after = after.replace('10000','10001')
    path.write_text(after,encoding='utf-8')
lock = new/'win_x64/src-tauri/Cargo.lock'
content = lock.read_text(encoding='utf-8').replace('name = "fritia-next-chat"\nversion = "1.0.0"','name = "fritia-next-chat"\nversion = "1.0.1"')
lock.write_text(content,encoding='utf-8')
print('Prepared source-only v1.0.1 staging:',new)
