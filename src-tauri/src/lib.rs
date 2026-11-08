use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

#[tauri::command]
fn haptic(kind: String) {
  #[cfg(target_os = "macos")]
  {
    use objc2::{class, msg_send, rc::Retained, runtime::AnyObject};

    let pattern = match kind.as_str() {
      "success" | "impact" => 1_i64,
      "warning" | "error" => 2_i64,
      _ => 0_i64,
    };
    let manager: Retained<AnyObject> =
      unsafe { msg_send![class!(NSHapticFeedbackManager), defaultPerformer] };
    let _: () = unsafe {
      msg_send![
        &*manager,
        performFeedbackPattern: pattern,
        performanceTime: 0_i64
      ]
    };
  }

  #[cfg(not(target_os = "macos"))]
  let _ = kind;
}

fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
  let app_menu = SubmenuBuilder::new(app, "App")
    .about(None)
    .separator()
    .quit()
    .build()?;
  let edit_menu = SubmenuBuilder::new(app, "Edit")
    .item(&PredefinedMenuItem::undo(app, None)?)
    .item(&PredefinedMenuItem::redo(app, None)?)
    .separator()
    .item(&PredefinedMenuItem::cut(app, None)?)
    .item(&PredefinedMenuItem::copy(app, None)?)
    .item(&PredefinedMenuItem::paste(app, None)?)
    .item(&PredefinedMenuItem::select_all(app, None)?)
    .build()?;
  let fullscreen = MenuItemBuilder::with_id("fullscreen", "Fullscreen")
    .accelerator("CmdOrCtrl+Shift+F")
    .build(app)?;
  let view_menu = SubmenuBuilder::new(app, "View")
    .item(&fullscreen)
    .build()?;
  let window_menu = SubmenuBuilder::new(app, "Window")
    .item(&PredefinedMenuItem::minimize(app, None)?)
    .item(&PredefinedMenuItem::close_window(app, None)?)
    .build()?;

  MenuBuilder::new(app)
    .items(&[&app_menu, &edit_menu, &view_menu, &window_menu])
    .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      app.set_menu(build_menu(app.handle())?)?;
      app.on_menu_event(|app, event| {
        if event.id().as_ref() == "fullscreen" {
          if let Some(window) = app.get_webview_window("main") {
            let fullscreen = window.is_fullscreen().unwrap_or(false);
            let _ = window.set_fullscreen(!fullscreen);
          }
        }
      });
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![haptic])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
