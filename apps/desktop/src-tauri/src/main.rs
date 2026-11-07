// Hides the console window on Windows release builds; a tray application that
// opens a terminal behind itself looks broken.
// VI: Ẩn cửa sổ console trên bản release Windows; một ứng dụng tray mà mở kèm
// VI: terminal phía sau trông như bị lỗi.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Application shell for Flowie Desktop: the tray icon, its menu and the
//! hidden configuration window. The shell owns no run logic; it will drive
//! `flowie-core` once that crate carries the state machine (DTD-498).
//! VI: Vỏ ứng dụng của Flowie Desktop: icon tray, menu của nó và cửa sổ cấu
//! VI: hình đang ẩn. Vỏ không chứa logic chạy run; nó sẽ điều khiển
//! VI: `flowie-core` khi crate đó có state machine (DTD-498).

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Mở cấu hình", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::with_id("flowie")
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .tooltip("Flowie Desktop")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the configuration window hides it; the companion keeps
            // running in the tray, which is the whole point of the product.
            // VI: Đóng cửa sổ cấu hình chỉ ẩn nó đi; companion vẫn chạy ở tray,
            // VI: đó mới là điểm cốt lõi của sản phẩm.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Flowie Desktop failed to start");
}
