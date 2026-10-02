"""Install source-only archive bridges into existing Android/Windows shells.
No build or packaging. Back up changed integration files before writing.
"""
import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--android-root', type=Path)
parser.add_argument('--windows-root', type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent

def write_checked(path, before, after):
    if before == after:
        return
    backup = path.with_name(path.name + '.before-archive-v101')
    if not backup.exists():
        backup.write_text(before, encoding='utf-8')
    path.write_text(after, encoding='utf-8')

if args.android_root:
    root = args.android_root.resolve(strict=True)
    for relative in ['app/src/com/fritia/next/chat', 'tools/templates/app/src/com/fritia/next/chat']:
        directory = root / relative
        path = directory / 'MainActivity.java'
        before = path.read_text(encoding='utf-8')
        after = before
        if 'private FritiaArchiveBridge archiveBridge;' not in after:
            assert 'private WebView webView;' in after
            after = after.replace('private WebView webView;', 'private WebView webView;\n    private FritiaArchiveBridge archiveBridge;', 1)
            marker = 'super.onActivityResult(requestCode, resultCode, data);'
            assert marker in after
            after = after.replace(marker, marker + '\n        if (archiveBridge != null && archiveBridge.onActivityResult(requestCode, resultCode, data)) return;', 1)
            marker = 'webView.addJavascriptInterface(new AndroidBridge(this), "FritiaAndroid");'
            assert marker in after
            after = after.replace(marker, marker + '\n        archiveBridge = new FritiaArchiveBridge(this, webView);', 1)
        write_checked(path, before, after)
        shutil.copy2(source / 'android/FritiaArchiveBridge.java', directory / 'FritiaArchiveBridge.java')
    libs = root / 'tools/archive-libs'
    libs.mkdir(exist_ok=True)
    for jar in (source / 'android/lib').glob('*.jar'):
        shutil.copy2(jar, libs / jar.name)
    for relative in ['app/assets/native-licenses', 'tools/templates/app/assets/native-licenses']:
        shutil.copytree(source / 'android/licenses', root / relative, dirs_exist_ok=True)
    path = root / 'tools/build-chat-apk.ps1'
    before = path.read_text(encoding='utf-8')
    after = before
    if '$archiveLibs =' not in after:
        marker = '& $javac -encoding UTF-8 --release 8 -Xlint:-options -cp $AndroidJar -d $classes @javaFiles'
        assert marker in after
        after = after.replace(marker, '$archiveLibs = @(Get-ChildItem (Join-Path $ScriptRoot "archive-libs") -Filter "*.jar" | ForEach-Object { $_.FullName })\n    & $javac -encoding UTF-8 --release 8 -Xlint:-options -cp ($AndroidJar + ";" + ($archiveLibs -join ";")) -d $classes @javaFiles')
        marker = '--output $dex @classFiles'
        assert marker in after
        after = after.replace(marker, '--output $dex @classFiles @archiveLibs')
    write_checked(path, before, after)
    print('Android archive bridge source installed:', root)

if args.windows_root:
    root = args.windows_root.resolve(strict=True)
    path = root / 'src-tauri/src/main.rs'
    before = path.read_text(encoding='utf-8')
    after = before
    if 'mod archive_dialog;' not in after:
        marker = 'use tauri::Manager;'
        assert marker in after
        after = after.replace(marker, marker + '\nmod archive_dialog;')
        marker = '.invoke_handler(tauri::generate_handler!['
        assert marker in after
        after = after.replace(marker, marker + '\n            archive_dialog::choose_archive_file,\n            archive_dialog::write_archive_file,')
    write_checked(path, before, after)
    shutil.copy2(source / 'windows/archive_dialog.rs', root / 'src-tauri/src/archive_dialog.rs')
    print('Windows archive dialog source installed:', root)
