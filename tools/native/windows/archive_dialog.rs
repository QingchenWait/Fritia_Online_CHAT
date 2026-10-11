use base64::{engine::general_purpose, Engine as _};
use std::{
    collections::HashSet,
    fs,
    sync::{Mutex, OnceLock},
};

fn destinations() -> &'static Mutex<HashSet<String>> {
    static PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

// Layout follows OPENFILENAMEW in the Windows SDK (the _MAC fields do not
// apply). No shell process, runtime script or extra crate is needed.
#[repr(C)]
struct OpenFileName {
    size: u32,
    owner: usize,
    instance: usize,
    filter: *const u16,
    custom_filter: *mut u16,
    max_custom_filter: u32,
    filter_index: u32,
    file: *mut u16,
    max_file: u32,
    file_title: *mut u16,
    max_file_title: u32,
    initial_dir: *const u16,
    title: *const u16,
    flags: u32,
    file_offset: u16,
    file_extension: u16,
    default_extension: *const u16,
    custom_data: isize,
    hook: usize,
    template: *const u16,
    reserved: usize,
    reserved_word: u32,
    flags_ex: u32,
}
#[link(name = "comdlg32")]
extern "system" {
    fn GetSaveFileNameW(dialog: *mut OpenFileName) -> i32;
    fn CommDlgExtendedError() -> u32;
}

#[tauri::command]
pub async fn choose_archive_file(
    window: tauri::WebviewWindow,
    filename: String,
    mime: Option<String>,
) -> Result<Option<String>, String> {
    let (filter, title, extension) = match mime.as_deref().unwrap_or("application/zip") {
        "application/zip" => ("ZIP archive (*.zip)\0*.zip\0\0", "保存 ZIP 备份\0", "zip\0"),
        "image/png" => ("PNG image (*.png)\0*.png\0\0", "保存聊天记录图片\0", "png\0"),
        _ => return Err("不支持的保存文件类型".into()),
    };
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as usize;
    tauri::async_runtime::spawn_blocking(move || {
        let mut file = vec![0u16; 32768];
        let suggested: Vec<u16> = filename.encode_utf16().collect();
        if suggested.len() >= file.len() || suggested.contains(&0) {
            return Err("无效的保存文件名".into());
        }
        file[..suggested.len()].copy_from_slice(&suggested);
        let filter: Vec<u16> = filter.encode_utf16().collect();
        let title: Vec<u16> = title.encode_utf16().collect();
        let extension: Vec<u16> = extension.encode_utf16().collect();
        // All optional pointer fields are null, and backing UTF-16 buffers
        // outlive the synchronous native dialog call.
        let mut dialog: OpenFileName = unsafe { std::mem::zeroed() };
        dialog.size = std::mem::size_of::<OpenFileName>() as u32;
        dialog.owner = owner;
        dialog.filter = filter.as_ptr();
        dialog.filter_index = 1;
        dialog.file = file.as_mut_ptr();
        dialog.max_file = file.len() as u32;
        dialog.title = title.as_ptr();
        dialog.default_extension = extension.as_ptr();
        dialog.flags = 0x00080000 | 0x00000800 | 0x00000008 | 0x00000002;
        if unsafe { GetSaveFileNameW(&mut dialog) } == 0 {
            let error = unsafe { CommDlgExtendedError() };
            return if error == 0 {
                Ok(None)
            } else {
                Err(format!("系统保存窗口失败：{error}"))
            };
        }
        let length = file.iter().position(|c| *c == 0).unwrap_or(file.len());
        let path = String::from_utf16(&file[..length]).map_err(|e| e.to_string())?;
        destinations()
            .lock()
            .map_err(|e| e.to_string())?
            .insert(path.clone());
        Ok(Some(path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_archive_file(path: String, body: String) -> Result<(), String> {
    if !destinations()
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&path)
    {
        return Err("没有对应的用户所选保存位置".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = general_purpose::STANDARD
            .decode(body)
            .map_err(|e| e.to_string())?;
        fs::write(path, bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
