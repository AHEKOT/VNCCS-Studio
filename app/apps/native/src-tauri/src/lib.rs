mod runtime;
mod studio_api;
mod studio_frames;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let handle: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
    runtime::runtime_status,
    runtime::runtime_start,
    runtime::runtime_stop,
    runtime::runtime_logs,
    studio_api::vnccs_post
  ];
  tauri::Builder::default()
    .manage(runtime::RuntimeState::default())
    .setup(|app| {
      let config = &app.config().app.windows[0];
      tauri::WebviewWindowBuilder::from_config(app, config)?
        .initialization_script_for_all_frames(studio_frames::bootstrap())
        .build()?;
      Ok(())
    })
    .invoke_handler(move |invoke| invoke.message.webview().label() == "main" && handle(invoke))
    .build(tauri::generate_context!())
    .expect("error while building VNCCS Studio")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        runtime::stop(&app.state::<runtime::RuntimeState>());
      }
    });
}
