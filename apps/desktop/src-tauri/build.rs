// tauri-build also generates the Windows resource file, which requires
// icons/icon.ico to exist; the build stops without it.
// VI: tauri-build còn sinh file resource của Windows, việc này đòi hỏi phải có
// VI: icons/icon.ico; thiếu file đó thì build dừng.
fn main() {
    tauri_build::build()
}
