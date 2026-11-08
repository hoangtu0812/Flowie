// Hides the console window on Windows release builds; a tray application that
// opens a terminal behind itself looks broken.
// VI: Ẩn cửa sổ console trên bản release Windows; một ứng dụng tray mà mở kèm
// VI: terminal phía sau trông như bị lỗi.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Application shell for Flowie Desktop: the tray icon, its menu and the
//! hidden configuration window.
//!
//! The shell holds no rules of its own. It takes the machine-wide lock,
//! reads what `flowie-core` and `flowie-platform` say about this machine,
//! and renders that; every decision about what the states mean lives in
//! those crates, where it can be tested without starting a desktop
//! application.
//! VI: Vỏ ứng dụng của Flowie Desktop: icon tray, menu của nó và cửa sổ cấu
//! VI: hình đang ẩn.
//! VI: Vỏ không giữ quy tắc nào của riêng nó. Nó giành khoá toàn máy, đọc
//! VI: những gì `flowie-core` và `flowie-platform` nói về máy này, rồi hiển
//! VI: thị; mọi quyết định về ý nghĩa của các trạng thái nằm trong hai crate
//! VI: đó, nơi chúng kiểm thử được mà không cần khởi động một ứng dụng desktop.

mod startup;

use std::path::PathBuf;
use std::sync::Mutex;

use flowie_core::{CompanionConfig, Readiness};
use flowie_platform::instance::{self, InstanceError, InstanceGuard};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

/// The local UI is written in Vietnamese, and the account's Flowie locale is
/// not known before the first successful call, so the tray starts in the
/// same language as the window rather than guessing.
/// VI: Giao diện cục bộ viết bằng tiếng Việt, và locale Flowie của tài khoản
/// VI: chưa biết được trước lần gọi thành công đầu tiên, nên tray bắt đầu bằng
/// VI: cùng ngôn ngữ với cửa sổ thay vì đoán.
const VIETNAMESE: bool = true;

/// Everything the menu callbacks need, behind one lock so a click cannot
/// read a half-written configuration.
/// VI: Mọi thứ các callback của menu cần, sau một khoá duy nhất để một cú click
/// VI: không đọc phải cấu hình đang ghi dở.
struct Companion {
    directory: PathBuf,
    config: Mutex<Option<CompanionConfig>>,
    readiness: Mutex<Readiness>,
    /// Held for its lifetime; dropping it releases the machine.
    /// VI: Giữ suốt vòng đời; thả ra là nhả máy cho bản khác.
    _instance: InstanceGuard,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            // Before anything else. A second companion sharing this account's
            // token would claim its own runs, and the server would accept
            // both because it only checks the issue being claimed.
            // VI: Trước mọi thứ khác. Một companion thứ hai dùng chung token
            // VI: của tài khoản này sẽ tự claim run riêng, và server chấp nhận
            // VI: cả hai vì nó chỉ kiểm issue đang được claim.
            let instance = match instance::acquire(&directory) {
                Ok(guard) => guard,
                Err(InstanceError::AlreadyRunning { .. }) => {
                    eprintln!(
                        "Flowie Desktop đang chạy rồi trên tài khoản này; bản thứ hai sẽ thoát."
                    );
                    app.handle().exit(0);
                    return Ok(());
                }
                Err(error) => {
                    eprintln!("Không dùng được thư mục dữ liệu: {error}");
                    app.handle().exit(1);
                    return Ok(());
                }
            };

            let assessed = startup::assess_local(&directory);
            let initial = assessed.readiness.clone();
            let paused = matches!(initial, Readiness::Paused);
            app.manage(Companion {
                directory,
                config: Mutex::new(assessed.config),
                readiness: Mutex::new(assessed.readiness),
                _instance: instance,
            });

            let status = MenuItem::with_id(
                app,
                "status",
                initial.summary(VIETNAMESE),
                false,
                None::<&str>,
            )?;
            let pause = MenuItem::with_id(app, "pause", pause_label(paused), true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Mở cấu hình", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &pause, &open, &quit])?;

            let status_handle = status.clone();
            let pause_handle = pause.clone();
            TrayIconBuilder::with_id("flowie")
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
                .tooltip("Flowie Desktop")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "pause" => {
                        let companion = app.state::<Companion>();
                        let (now_paused, summary) = toggle_paused(&companion);
                        let _ = pause_handle.set_text(pause_label(now_paused));
                        let _ = status_handle.set_text(summary);
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

fn pause_label(paused: bool) -> &'static str {
    if paused {
        "Tiếp tục nhận việc"
    } else {
        "Tạm dừng nhận việc"
    }
}

/// Flips pausing and writes it down, returning the new flag and the line the
/// tray should now show.
///
/// A pause that is not persisted would be forgotten on restart, and the
/// person would believe the machine is holding still when it is not. If the
/// write fails the flag goes back, because a tray saying paused while the
/// file says otherwise misleads after the next restart.
/// VI: Đảo trạng thái tạm dừng và ghi lại, trả về cờ mới cùng dòng tray cần
/// VI: hiển thị.
/// VI: Một lần tạm dừng không được lưu sẽ bị quên khi khởi động lại, và người
/// VI: dùng sẽ tin rằng máy đang đứng yên trong khi nó không. Nếu ghi hỏng thì
/// VI: cờ được trả lại, vì tray báo đang tạm dừng trong khi file nói ngược lại
/// VI: sẽ đánh lừa người dùng sau lần khởi động kế tiếp.
fn toggle_paused(companion: &Companion) -> (bool, String) {
    let mut held = companion.config.lock().unwrap();
    let mut readiness = companion.readiness.lock().unwrap();
    let Some(config) = held.as_mut() else {
        // Nothing to pause on a machine that was never set up; the state is
        // left as it is rather than inventing one.
        // VI: Không có gì để tạm dừng trên một máy chưa từng được thiết lập;
        // VI: trạng thái được giữ nguyên thay vì bịa ra một trạng thái mới.
        return (false, readiness.summary(VIETNAMESE));
    };
    let next = !config.paused;
    match startup::set_paused(&companion.directory, config, next) {
        Ok(()) => {
            *readiness = if next {
                Readiness::Paused
            } else {
                Readiness::Disconnected {
                    detail: "not contacted yet".into(),
                }
            };
        }
        Err(error) => {
            config.paused = !next;
            *readiness = Readiness::NeedsSignIn {
                reason: error.to_string(),
            };
        }
    }
    (config.paused, readiness.summary(VIETNAMESE))
}
