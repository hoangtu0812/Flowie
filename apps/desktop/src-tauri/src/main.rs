// Hides the console window on Windows release builds; a tray application that
// opens a terminal behind itself looks broken.
// VI: Ẩn cửa sổ console trên bản release Windows; một ứng dụng tray mà mở kèm
// VI: terminal phía sau trông như bị lỗi.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Application shell for Flowie Desktop: the tray icon, its menu and the
//! hidden configuration window.
//!
//! The shell holds no rules of its own. It takes the machine-wide lock, starts
//! the worker that does the work, and renders what the worker reports; every
//! decision about what the states mean lives in the crates, where it can be
//! tested without starting a desktop application.
//! VI: Vỏ ứng dụng của Flowie Desktop: icon tray, menu của nó và cửa sổ cấu
//! VI: hình đang ẩn.
//! VI: Vỏ không giữ quy tắc nào của riêng nó. Nó giành khoá toàn máy, khởi động
//! VI: worker làm việc, và hiển thị những gì worker báo về; mọi quyết định về ý
//! VI: nghĩa của các trạng thái nằm trong các crate, nơi chúng kiểm thử được mà
//! VI: không cần khởi động một ứng dụng desktop.

mod setup;
mod startup;
mod update;
mod worker;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use flowie_core::{CompanionConfig, Readiness};
use flowie_platform::instance::{self, InstanceError, InstanceGuard};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use worker::Shared;

/// The local UI is written in Vietnamese, and the account's Flowie locale is
/// not known before the first successful call, so the tray starts in the
/// same language as the window rather than guessing.
/// VI: Giao diện cục bộ viết bằng tiếng Việt, và locale Flowie của tài khoản
/// VI: chưa biết được trước lần gọi thành công đầu tiên, nên tray bắt đầu bằng
/// VI: cùng ngôn ngữ với cửa sổ thay vì đoán.
pub const VIETNAMESE: bool = true;

/// How often the tray line is refreshed from what the worker reports.
/// VI: Dòng trên tray được làm mới từ báo cáo của worker bao lâu một lần.
const REFRESH: Duration = Duration::from_millis(500);

/// Everything the menu callbacks need, behind one lock so a click cannot
/// read a half-written configuration.
/// VI: Mọi thứ các callback của menu cần, sau một khoá duy nhất để một cú click
/// VI: không đọc phải cấu hình đang ghi dở.
pub struct Companion {
    pub directory: PathBuf,
    pub config: Mutex<Option<CompanionConfig>>,
    pub shared: Arc<Shared>,
    /// Held for its lifetime; dropping it releases the machine.
    /// VI: Giữ suốt vòng đời; thả ra là nhả máy cho bản khác.
    _instance: InstanceGuard,
}

fn main() {
    tauri::Builder::default()
        // No arguments on the sign-in launch: the companion starts the
        // same way however it was started, so there is one behaviour to
        // reason about rather than two.
        // VI: Không truyền argument nào ở lần khởi động theo đăng nhập:
        // VI: companion khởi động giống nhau dù được gọi theo cách nào, nên
        // VI: chỉ có một hành vi để suy luận thay vì hai.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            setup::load_setup,
            setup::save_setup,
            setup::save_token,
            setup::forget_token,
        ])
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
            let shared = Arc::new(Shared::new(assessed.readiness));
            // Started even when the machine is not set up: the worker reports
            // what is wrong on each pass, so finishing the setup takes effect
            // without restarting the application.
            // VI: Vẫn khởi động kể cả khi máy chưa được thiết lập: worker báo
            // VI: lại điều gì đang thiếu ở mỗi lượt, nên hoàn tất thiết lập xong
            // VI: là có hiệu lực mà không phải khởi động lại ứng dụng.
            // The file records what the person chose; the system records
            // what will happen. They drift when a machine is reimaged or
            // the entry is removed by hand, so startup makes the system
            // match the file rather than leaving a stale answer.
            // VI: File ghi điều người dùng đã chọn; hệ thống ghi điều sẽ xảy ra.
            // VI: Hai bên lệch nhau khi máy được cài lại hoặc mục khởi động bị
            // VI: xóa bằng tay, nên lúc khởi động sẽ đưa hệ thống về đúng file
            // VI: thay vì để một câu trả lời cũ.
            if let Some(config) = assessed.config.as_ref() {
                if let Err(detail) =
                    setup::apply_start_at_login(app.handle(), config.start_at_login)
                {
                    eprintln!("{detail}");
                }
            }

            let running = worker::start(directory.clone(), Arc::clone(&shared));

            app.manage(Companion {
                directory,
                config: Mutex::new(assessed.config),
                shared: Arc::clone(&shared),
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
            let cancel =
                MenuItem::with_id(app, "cancel", "Hủy lượt đang chạy", true, None::<&str>)?;
            // Always available, because the thing it fixes is a wait, and a
            // wait is exactly the state in which the entry that would end it
            // must not itself be disabled.
            // VI: Luôn dùng được, vì thứ nó giải quyết là một lần chờ, và lúc
            // VI: đang chờ chính là lúc mục menu kết thúc lần chờ đó không được
            // VI: phép bị vô hiệu hoá.
            let retry =
                MenuItem::with_id(app, "retry", "Thử kết nối lại ngay", true, None::<&str>)?;
            // Both start disabled: neither address is known until the server
            // has said which workspace this connection belongs to, and an
            // entry that opens nothing is worse than one that is plainly off.
            // VI: Cả hai bắt đầu ở trạng thái vô hiệu: chưa biết địa chỉ nào cho tới khi
            // VI: server cho biết kết nối này thuộc workspace nào, và một mục bấm vào
            // VI: không mở gì cả thì tệ hơn một mục tắt hẳn.
            let open_task =
                MenuItem::with_id(app, "task", "Mở task đang làm", false, None::<&str>)?;
            let open_site = MenuItem::with_id(app, "site", "Mở Flowie", false, None::<&str>)?;
            // Read from the package so the number on the tray is the number of
            // the build that is running. A written-out string survives a
            // release untouched and then tells someone they are on a version
            // they are not, which is worse than showing nothing.
            // VI: Đọc từ package để số hiện trên tray là số của chính bản đang
            // VI: chạy. Một chuỗi viết tay sẽ sống sót qua một lần phát hành mà
            // VI: không ai sửa, rồi nói với người dùng rằng họ đang dùng một
            // VI: phiên bản họ không dùng — tệ hơn là không hiện gì.
            let version = MenuItem::with_id(
                app,
                "version",
                format!("Phiên bản {}", app.package_info().version),
                false,
                None::<&str>,
            )?;
            // Disabled and neutral until a newer release has actually been
            // seen. An entry that is always there and sometimes does nothing
            // teaches people to ignore it.
            // VI: Vô hiệu và trung tính cho tới khi thật sự thấy một bản phát
            // VI: hành mới hơn. Một mục lúc nào cũng có mặt và đôi khi bấm vào
            // VI: không làm gì sẽ dạy người dùng bỏ qua nó.
            let update = MenuItem::with_id(app, "update", "Chưa có bản mới", false, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Cấu hình và chẩn đoán", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &status, &open_task, &open_site, &retry, &pause, &cancel, &open, &version,
                    &update, &quit,
                ],
            )?;

            let status_handle = status.clone();
            let pause_handle = pause.clone();
            let clicked = Arc::clone(&shared);
            let available: update::Available = Arc::new(Mutex::new(None));
            update::watch(
                app.package_info().version.to_string(),
                Arc::clone(&available),
            );
            let offered = Arc::clone(&available);
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
                        let now_paused = toggle_paused(&companion);
                        let _ = pause_handle.set_text(pause_label(now_paused));
                    }
                    "cancel" => clicked.request_cancel(),
                    "retry" => clicked.request_retry(),
                    // Opened in the person's own browser, where they are
                    // already signed in; a webview of ours would ask them to
                    // sign in again to read their own task.
                    // VI: Mở bằng trình duyệt của chính người dùng, nơi họ đã đăng nhập;
                    // VI: một webview của chúng ta sẽ bắt họ đăng nhập lại để đọc task của
                    // VI: chính mình.
                    "task" => {
                        if let Some(url) = clicked.task_url() {
                            let _ = tauri_plugin_opener::open_url(url, None::<&str>);
                        }
                    }
                    "site" => {
                        if let Some(url) = clicked.site() {
                            let _ = tauri_plugin_opener::open_url(url, None::<&str>);
                        }
                    }
                    // The release page, not a download. Nothing here installs
                    // anything: the installer is unsigned, so a companion that
                    // fetched and ran its own replacement would run whatever
                    // answered.
                    // VI: Mở trang phát hành chứ không tải về. Không có gì ở đây
                    // VI: tự cài: bộ cài chưa ký số, nên một companion tự tải và
                    // VI: chạy bản thay thế của chính nó sẽ chạy bất cứ thứ gì
                    // VI: trả lời nó.
                    "update" => {
                        let url = offered
                            .lock()
                            .ok()
                            .and_then(|held| held.as_ref().map(|newer| newer.url.clone()));
                        if let Some(url) = url {
                            let _ = tauri_plugin_opener::open_url(url, None::<&str>);
                        }
                    }
                    "quit" => {
                        // Asked, not forced: the run stops at its next step and
                        // hands the task back, which is the difference between
                        // a task another machine can take and one held until
                        // its lease expires.
                        // VI: Yêu cầu chứ không ép: run dừng ở bước kế tiếp và
                        // VI: trả task lại, đó là khác biệt giữa một task máy
                        // VI: khác nhận được và một task bị giữ tới khi lease
                        // VI: hết hạn.
                        clicked.request_stop();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // The tray only ever shows what the worker reports, so there is
            // one answer to "what is this machine doing" rather than two that
            // can disagree.
            // VI: Tray chỉ hiển thị những gì worker báo về, nên câu hỏi "máy này
            // VI: đang làm gì" chỉ có một câu trả lời chứ không phải hai câu có
            // VI: thể mâu thuẫn.
            let reported = Arc::clone(&shared);
            let task_handle = open_task.clone();
            let site_handle = open_site.clone();
            let update_handle = update.clone();
            let watched = Arc::clone(&available);
            std::thread::spawn(move || loop {
                std::thread::sleep(REFRESH);
                let _ = status_handle.set_text(tray_line(
                    reported.agent(),
                    reported.task().as_deref(),
                    reported.activity().as_deref(),
                    &reported.readiness(),
                ));
                let _ = task_handle.set_enabled(reported.task_url().is_some());
                let _ = site_handle.set_enabled(reported.site().is_some());
                if let Some(newer) = watched.lock().ok().and_then(|held| held.clone()) {
                    let _ =
                        update_handle.set_text(format!("Có bản mới {} — tải về", newer.version));
                    let _ = update_handle.set_enabled(true);
                }
                if running.is_finished() {
                    return;
                }
            });
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
        .build(tauri::generate_context!())
        .expect("Flowie Desktop failed to start")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // The worker is told on the way out even when the exit did not
                // come from the tray menu, so a run still gets its chance to
                // hand the task back.
                // VI: Worker vẫn được báo khi thoát kể cả khi lệnh thoát không
                // VI: tới từ menu tray, để một run vẫn có cơ hội trả task lại.
                if let Some(companion) = app.try_state::<Companion>() {
                    companion.shared.request_stop();
                }
            }
        });
}

/// What the tray shows: the task in hand and what the agent is doing inside
/// it, or the state of the machine when there is no task.
///
/// Both are shown because they answer different questions. The task alone
/// leaves a person watching "Đang làm DTD-204" for twenty minutes with no way
/// to tell a working agent from a stuck one; the line alone loses which task
/// it belongs to.
///
/// Taking the values as arguments rather than reading them inside keeps this
/// decidable without a running application.
/// VI: Những gì tray hiển thị: task đang làm và agent đang làm gì bên trong task
/// VI: đó, hoặc trạng thái của máy khi không có task nào.
/// VI: Hiển thị cả hai vì chúng trả lời hai câu hỏi khác nhau. Chỉ có tên task thì
/// VI: người dùng nhìn "Đang làm DTD-204" suốt hai mươi phút mà không phân biệt được
/// VI: agent đang chạy với agent đang kẹt; chỉ có dòng mô tả thì mất thông tin nó thuộc
/// VI: task nào.
/// VI: Nhận các giá trị qua tham số thay vì tự đọc bên trong giúp quyết định này kiểm
/// VI: được mà không cần một ứng dụng đang chạy.
fn tray_line(
    agent: Option<&str>,
    task: Option<&str>,
    activity: Option<&str>,
    readiness: &Readiness,
) -> String {
    let doing = match (task, activity) {
        (Some(task), Some(doing)) => format!("Đang làm {task} · {doing}"),
        (Some(task), None) => format!("Đang làm {task}"),
        (None, _) => return readiness.summary(VIETNAMESE),
    };
    // The agent's name leads because it answers the question that comes
    // first: whether anything is running at all. A line that opens with the
    // task reads the same whether an agent is driving it or the run is wedged
    // between steps.
    // VI: Tên agent đứng đầu vì nó trả lời câu hỏi tới trước: có thứ gì đang
    // VI: chạy hay không. Một dòng mở đầu bằng tên task đọc giống hệt nhau dù
    // VI: agent đang điều khiển nó hay run đang kẹt giữa hai bước.
    match agent {
        Some(agent) => format!("{agent} · {doing}"),
        None => doing,
    }
}

fn pause_label(paused: bool) -> &'static str {
    if paused {
        "Tiếp tục nhận việc"
    } else {
        "Tạm dừng nhận việc"
    }
}

/// Flips pausing and writes it down, returning the new flag.
///
/// A pause that is not persisted would be forgotten on restart, and the person
/// would believe the machine is holding still when it is not. If the write
/// fails the flag goes back, because a tray saying paused while the file says
/// otherwise misleads after the next restart. The worker reads the file on its
/// next pass, so the tray does not have to tell it anything.
/// VI: Đảo trạng thái tạm dừng và ghi lại, trả về cờ mới.
/// VI: Một lần tạm dừng không được lưu sẽ bị quên khi khởi động lại, và người
/// VI: dùng sẽ tin rằng máy đang đứng yên trong khi nó không. Nếu ghi hỏng thì
/// VI: cờ được trả lại, vì tray báo đang tạm dừng trong khi file nói ngược lại
/// VI: sẽ đánh lừa người dùng sau lần khởi động kế tiếp. Worker đọc file ở lượt
/// VI: kế tiếp, nên tray không cần báo gì cho nó.
fn toggle_paused(companion: &Companion) -> bool {
    let mut held = companion.config.lock().unwrap();
    let Some(config) = held.as_mut() else {
        // Nothing to pause on a machine that was never set up.
        // VI: Không có gì để tạm dừng trên một máy chưa từng được thiết lập.
        return false;
    };
    let next = !config.paused;
    match startup::set_paused(&companion.directory, config, next) {
        Ok(()) => {
            companion.shared.set_readiness(if next {
                Readiness::Paused
            } else {
                Readiness::Disconnected {
                    detail: "not contacted yet".into(),
                }
            });
        }
        Err(error) => {
            config.paused = !next;
            companion.shared.set_readiness(Readiness::NeedsSignIn {
                reason: error.to_string(),
            });
        }
    }
    config.paused
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tray_shows_the_task_in_hand_before_the_machine_state() {
        // While a run is in progress, what the machine could do next is not
        // the useful thing to show.
        // VI: Trong lúc một run đang chạy, thứ máy có thể làm tiếp không phải là
        // VI: thông tin hữu ích để hiển thị.
        assert_eq!(
            tray_line(None, None, None, &Readiness::Ready),
            Readiness::Ready.summary(VIETNAMESE)
        );
        assert!(tray_line(None, Some("DTD-204"), None, &Readiness::Ready).contains("DTD-204"));

        // With both, a person can tell a working agent from a stuck one.
        // VI: Có cả hai thì người dùng phân biệt được agent đang chạy với agent kẹt.
        let both = tray_line(
            Some("Claude"),
            Some("DTD-204"),
            Some("Editing app/page.tsx"),
            &Readiness::Ready,
        );
        assert!(both.contains("DTD-204"), "{both}");
        assert!(both.contains("Editing app/page.tsx"), "{both}");
    }

    #[test]
    fn the_tray_names_the_agent_only_while_one_is_running() {
        // A machine set up for an agent is not a machine running it. Naming
        // the provider while nothing runs tells someone work is under way when
        // the companion is sitting idle.
        // VI: Một máy được cấu hình cho agent nào đó không phải là máy đang chạy
        // VI: agent đó. Nêu tên provider trong lúc không có gì chạy sẽ nói với
        // VI: người dùng rằng công việc đang diễn ra trong khi companion đang rảnh.
        let idle = tray_line(Some("Claude"), None, None, &Readiness::Ready);
        assert_eq!(idle, Readiness::Ready.summary(VIETNAMESE));
        assert!(!idle.contains("Claude"), "{idle}");

        let working = tray_line(Some("Codex"), Some("DTD-204"), None, &Readiness::Ready);
        assert!(working.starts_with("Codex"), "{working}");
        assert!(working.contains("DTD-204"), "{working}");
    }

    #[test]
    fn a_task_in_hand_is_shown_even_while_the_connection_is_down() {
        // The run keeps going through a short outage, and saying
        // "disconnected" while it works would describe the wrong thing.
        // VI: Run vẫn chạy tiếp qua một lần mất kết nối ngắn, và báo "mất kết
        // VI: nối" trong lúc nó đang làm việc là mô tả sai thứ đang diễn ra.
        let offline = Readiness::Disconnected {
            detail: "timed out".into(),
        };
        assert!(tray_line(Some("Claude"), Some("DTD-204"), None, &offline).contains("DTD-204"));
    }

    #[test]
    fn the_pause_label_says_what_the_click_will_do() {
        // A menu entry that names the current state instead of the action
        // reads as a status line, and gets clicked by mistake.
        // VI: Một mục menu nêu trạng thái hiện tại thay vì hành động sẽ bị đọc
        // VI: như một dòng trạng thái, và bị bấm nhầm.
        assert_eq!(pause_label(true), "Tiếp tục nhận việc");
        assert_eq!(pause_label(false), "Tạm dừng nhận việc");
    }
}
