mod lcu;
mod lockfile;

use futures_util::{SinkExt, StreamExt};
use lcu::{Lcu, LcuResponse};
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest, http::HeaderValue};

/// Client events the UI follows. WAMP "subscribe" is message type 5; events arrive as type 8.
const SUBSCRIPTIONS: &[&str] = &[
    "OnJsonApiEvent_lol-gameflow_v1_gameflow-phase",
    "OnJsonApiEvent_lol-champ-select_v1_session",
];
const RETRY: Duration = Duration::from_secs(2);

#[derive(Default)]
struct AppState {
    lcu: RwLock<Option<Lcu>>,
}

#[derive(Clone, Serialize)]
struct Status {
    connected: bool,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LcuEvent {
    uri: String,
    event_type: String,
    data: Value,
}

#[tauri::command]
async fn lcu_status(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(state.lcu.read().await.is_some())
}

#[tauri::command]
async fn lcu_request(state: State<'_, Arc<AppState>>, method: String, path: String, body: Option<Value>) -> Result<LcuResponse, String> {
    let lcu = state.lcu.read().await.clone().ok_or("League client isn't running.")?;
    lcu.request(&method, &path, body).await.map_err(|e| e.to_string())
}

/// Waits for the League client, keeps one event connection open, and reconnects when the client restarts.
async fn supervise(app: AppHandle, state: Arc<AppState>) {
    let status = |connected: bool, message: &str| {
        let _ = app.emit("lcu-status", Status { connected, message: message.into() });
    };
    status(false, "Waiting for the League client");
    loop {
        let Some(creds) = tokio::task::spawn_blocking(lockfile::find).await.ok().flatten() else {
            tokio::time::sleep(RETRY).await;
            continue;
        };
        match Lcu::new(creds.clone()) {
            Ok(lcu) => *state.lcu.write().await = Some(lcu),
            Err(e) => {
                status(false, &e.to_string());
                tokio::time::sleep(RETRY).await;
                continue;
            }
        }
        status(true, "Connected to the League client");
        if let Err(e) = stream_events(&app, &creds).await {
            eprintln!("[lcu] event stream ended: {e}");
        }
        *state.lcu.write().await = None;
        status(false, "League client closed");
        tokio::time::sleep(RETRY).await;
    }
}

async fn stream_events(app: &AppHandle, creds: &lockfile::Credentials) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut request = format!("wss://127.0.0.1:{}/", creds.port).into_client_request()?;
    request.headers_mut().insert("Authorization", HeaderValue::from_str(&lcu::basic_auth(creds))?);
    let connector = tokio_tungstenite::Connector::NativeTls(lcu::tls_connector()?);
    let (mut socket, _) = tokio_tungstenite::connect_async_tls_with_config(request, None, false, Some(connector)).await?;

    for topic in SUBSCRIPTIONS {
        socket.send(Message::text(format!("[5,\"{topic}\"]"))).await?;
    }
    while let Some(message) = socket.next().await {
        let Message::Text(text) = message? else { continue };
        let Ok(Value::Array(frame)) = serde_json::from_str::<Value>(&text) else { continue };
        if frame.first().and_then(Value::as_u64) != Some(8) {
            continue;
        }
        let Some(payload) = frame.get(2) else { continue };
        let _ = app.emit(
            "lcu-event",
            LcuEvent {
                uri: payload["uri"].as_str().unwrap_or_default().into(),
                event_type: payload["eventType"].as_str().unwrap_or_default().into(),
                data: payload["data"].clone(),
            },
        );
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::default());
    let builder = tauri::Builder::default().plugin(tauri_plugin_process::init());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![lcu_status, lcu_request])
        .setup(move |app| {
            let handle = app.app_handle().clone();
            tauri::async_runtime::spawn(supervise(handle, state));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hex Cards");
}
