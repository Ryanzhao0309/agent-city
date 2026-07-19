use std::{
    env,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct SidecarProcess(Mutex<Option<CommandChild>>);

fn copy_seed_data(source: &Path, destination: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_seed_data(&source_path, &destination_path)?;
        } else if !destination_path.exists() {
            fs::copy(source_path, destination_path)?;
        }
    }
    Ok(())
}

fn start_sidecar(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    // Keep local desktop development on the same database as the web/API
    // process. Otherwise Tauri's app-data directory silently creates a second,
    // empty city that looks like an old installation. Packaged builds continue
    // to use the platform app-data directory unless explicitly overridden.
    let data_dir = env::var_os("AGENT_CITY_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .expect("src-tauri must have a project parent")
                    .join(".agent-city-data")
            } else {
                app.path()
                    .app_data_dir()
                    .expect("platform app-data directory must be available")
            }
        });
    fs::create_dir_all(&data_dir)?;
    copy_seed_data(&resource_dir.join("seed-data"), &data_dir)?;

    let server_dir: PathBuf = resource_dir.join("server");
    let entry_path = server_dir.join("dist/index.js");
    let manifest_path = server_dir.join("asset-manifest.json");
    let command = app
        .shell()
        .sidecar("agent-city-server")?
        .arg(entry_path)
        .current_dir(&server_dir)
        .env("HOST", "127.0.0.1")
        .env("PORT", "34127")
        .env("AGENT_CITY_API_ONLY", "1")
        .env("AGENT_CITY_DATA_DIR", &data_dir)
        .env(
            "AGENT_CITY_SEED_DB_PATH",
            resource_dir.join("seed-data").join("agent-city.sqlite"),
        )
        .env("AGENT_CITY_ASSET_MANIFEST", manifest_path)
        .env("AGENT_CITY_KEYCHAIN_SERVICE", "com.agentcity.desktop");

    let (mut events, child) = command.spawn()?;
    tauri::async_runtime::spawn(async move {
        while events.recv().await.is_some() {}
    });
    Ok(child)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let child = start_sidecar(&app.handle())
                .map_err(|error| format!("Unable to start Agent City local service: {error}"))?;
            app.manage(SidecarProcess(Mutex::new(Some(child))));

            let show_item = MenuItem::with_id(app, "show", "显示 Agent City", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 Agent City", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Agent City · 后台任务运行中")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, tauri::tray::TrayIconEvent::Click { .. }) {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Agent City desktop application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                if let Ok(mut child) = state.0.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
