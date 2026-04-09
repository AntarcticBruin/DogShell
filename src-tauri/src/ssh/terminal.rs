use super::error::{AppError, AppResult};
use super::session::get_conn;
use super::state::{AppState, SshConn, TerminalSession};
use super::types::TerminalEvent;
use russh::ChannelMsg;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

fn emit_terminal_chunk(app: &AppHandle, token: &str, session_id: &str, chunk: String) {
    let payload = TerminalEvent {
        token: token.to_string(),
        session_id: session_id.to_string(),
        chunk,
    };
    let _ = app.emit("terminal_data", payload);
}

async fn cleanup_terminal(state: &AppState, session_id: &str, token: &str) {
    if let Some(conn) = state.get_session(session_id) {
        let mut terminal = conn.terminal.lock().await;
        if terminal.as_ref().is_some_and(|current| current.token == token) {
            terminal.take();
        }
    }
}

async fn stop_active_terminal(conn: &Arc<SshConn>) {
    if let Some(terminal) = conn.terminal.lock().await.take() {
        terminal.stop.store(true, Ordering::SeqCst);
        let writer = terminal.writer.lock().await;
        let _ = writer.close().await;
    }
}

pub async fn start(
    state: &AppState,
    app: AppHandle,
    session_id: String,
    cols: Option<u32>,
    rows: Option<u32>,
) -> AppResult<String> {
    let conn = get_conn(state, &session_id)?;
    stop_active_terminal(&conn).await;

    let handle = conn.handle.lock().await;
    let channel = handle.channel_open_session().await?;
    drop(handle);

    let col_width = cols.unwrap_or(120).max(20);
    let row_height = rows.unwrap_or(32).max(8);
    channel
        .request_pty(false, "xterm-256color", col_width, row_height, 0, 0, &[])
        .await?;
    let _ = channel.set_env(false, "TERM", "xterm-256color").await;
    let _ = channel.set_env(false, "COLORTERM", "truecolor").await;
    let _ = channel.set_env(false, "CLICOLOR", "1").await;
    let _ = channel.set_env(false, "CLICOLOR_FORCE", "1").await;
    let _ = channel.set_env(false, "FORCE_COLOR", "3").await;
    let _ = channel.set_env(false, "LANG", "en_US.UTF-8").await;
    let _ = channel.set_env(false, "LC_ALL", "en_US.UTF-8").await;
    channel.request_shell(true).await?;

    let (mut reader, writer) = channel.split();
    let token = Uuid::new_v4().to_string();
    let terminal = Arc::new(TerminalSession {
        token: token.clone(),
        stop: std::sync::atomic::AtomicBool::new(false),
        writer: tokio::sync::Mutex::new(writer),
    });

    *conn.terminal.lock().await = Some(terminal.clone());

    let thread_token = token.clone();
    let thread_session_id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut batch_buffer = String::with_capacity(8192);
        let mut interval = tokio::time::interval(Duration::from_millis(30));

        loop {
            if terminal.stop.load(Ordering::SeqCst) {
                break;
            }

            tokio::select! {
                msg = reader.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            batch_buffer.push_str(&String::from_utf8_lossy(data));
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                            batch_buffer.push_str(&String::from_utf8_lossy(data));
                        }
                        Some(ChannelMsg::ExitStatus { .. }) | Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }

                    if batch_buffer.len() >= 4096 {
                        emit_terminal_chunk(
                            &app,
                            &thread_token,
                            &thread_session_id,
                            std::mem::take(&mut batch_buffer),
                        );
                    }
                }
                _ = interval.tick() => {
                    if !batch_buffer.is_empty() {
                        emit_terminal_chunk(
                            &app,
                            &thread_token,
                            &thread_session_id,
                            std::mem::take(&mut batch_buffer),
                        );
                    }
                }
            }
        }

        if !batch_buffer.is_empty() {
            emit_terminal_chunk(
                &app,
                &thread_token,
                &thread_session_id,
                std::mem::take(&mut batch_buffer),
            );
        }

        let state = app.state::<AppState>();
        cleanup_terminal(state.inner(), &thread_session_id, &thread_token).await;
    });

    Ok(token)
}

pub async fn stop(state: State<'_, AppState>, session_id: String, token: String) -> AppResult<()> {
    let conn = get_conn(state.inner(), &session_id)?;
    let terminal = conn.terminal.lock().await.clone();
    let Some(terminal) = terminal else {
        return Ok(());
    };

    if terminal.token != token {
        return Err(AppError::InvalidSession);
    }

    terminal.stop.store(true, Ordering::SeqCst);
    let writer = terminal.writer.lock().await;
    let _ = writer.close().await;
    Ok(())
}

pub async fn write(
    state: State<'_, AppState>,
    session_id: String,
    token: String,
    data: String,
) -> AppResult<()> {
    let conn = get_conn(state.inner(), &session_id)?;
    let terminal = conn.terminal.lock().await.clone();
    let Some(terminal) = terminal else {
        return Ok(());
    };

    if terminal.token != token {
        return Err(AppError::InvalidSession);
    }

    let writer = terminal.writer.lock().await;
    writer.data(data.as_bytes()).await?;
    Ok(())
}

pub async fn resize(
    state: State<'_, AppState>,
    session_id: String,
    token: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let conn = get_conn(state.inner(), &session_id)?;
    let terminal = conn.terminal.lock().await.clone();
    let Some(terminal) = terminal else {
        return Ok(());
    };

    if terminal.token != token {
        return Err(AppError::InvalidSession);
    }

    let writer = terminal.writer.lock().await;
    writer.window_change(cols.max(20), rows.max(8), 0, 0).await?;
    Ok(())
}
