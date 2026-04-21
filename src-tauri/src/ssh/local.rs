use super::error::AppResult;
use super::state::{AppState, LocalConn, LocalTerminalSession};
use super::types::{LocalConnectOptions, LocalConnectResult, TerminalEvent};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex as AsyncMutex};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use encoding_rs::GB18030;

fn emit_terminal_chunk(app: &AppHandle, token: &str, session_id: &str, chunk: String) {
    let payload = TerminalEvent {
        token: token.to_string(),
        session_id: session_id.to_string(),
        chunk,
    };
    let _ = app.emit("terminal_data", payload);
}

async fn cleanup_terminal(state: &AppState, session_id: &str, token: &str) {
    if let Some(conn) = state.get_local_session(session_id) {
        let mut terminals = conn.terminal.lock().await;
        terminals.remove(token);
    }
}

fn decode_local_output(bytes: &[u8]) -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(s) = std::str::from_utf8(bytes) {
            return s.to_string();
        }
        let (decoded, _, _) = GB18030.decode(bytes);
        return decoded.into_owned();
    }

    #[cfg(not(target_os = "windows"))]
    {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

pub async fn connect(opts: LocalConnectOptions, app: AppHandle) -> AppResult<LocalConnectResult> {
    let shell = opts.shell.trim().to_lowercase();
    let shell_path = opts
        .shell_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let startup_command = opts.command.trim();
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 32,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })
    .map_err(|e| super::error::AppError::Message(e.to_string()))?;

    let mut builder = if cfg!(target_os = "windows") {
        match shell.as_str() {
            "powershell" => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("powershell.exe"));
                b.arg("-NoLogo");
                if !startup_command.is_empty() {
                    b.arg("-NoExit");
                    b.arg("-Command");
                    b.arg(startup_command);
                }
                b
            }
            "pwsh" => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("pwsh.exe"));
                b.arg("-NoLogo");
                if !startup_command.is_empty() {
                    b.arg("-NoExit");
                    b.arg("-Command");
                    b.arg(startup_command);
                }
                b
            }
            "wsl" => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("wsl.exe"));
                if !startup_command.is_empty() {
                    b.arg("-e");
                    b.arg("bash");
                    b.arg("-ic");
                    b.arg(format!("{startup_command}; exec bash"));
                }
                b
            }
            "cmd" | _ => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("cmd.exe"));
                if !startup_command.is_empty() {
                    b.arg("/K");
                    b.arg(startup_command);
                }
                b
            }
        }
    } else {
        match shell.as_str() {
            "bash" => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("bash"));
                if !startup_command.is_empty() {
                    b.arg("-ic");
                    b.arg(format!("{startup_command}; exec bash"));
                }
                b
            }
            "zsh" => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("zsh"));
                if !startup_command.is_empty() {
                    b.arg("-ic");
                    b.arg(format!("{startup_command}; exec zsh"));
                }
                b
            }
            "sh" | _ => {
                let mut b = CommandBuilder::new(shell_path.unwrap_or("sh"));
                if !startup_command.is_empty() {
                    b.arg("-lc");
                    b.arg(format!("{startup_command}; exec sh"));
                }
                b
            }
        }
    };

    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");

    let (tx, rx) = mpsc::unbounded_channel::<String>();

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| super::error::AppError::Message(e.to_string()))?;
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = decode_local_output(&buf[..n]);
                    if tx.send(chunk).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| super::error::AppError::Message(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| super::error::AppError::Message(e.to_string()))?;
    drop(pair.slave);

    let session_id = Uuid::new_v4().to_string();
    let conn = Arc::new(LocalConn {
        child: AsyncMutex::new(child),
        master: AsyncMutex::new(pair.master),
        writer: AsyncMutex::new(writer),
        receiver: AsyncMutex::new(rx),
        terminal: AsyncMutex::new(HashMap::new()),
    });

    let state = app.state::<AppState>();
    state.insert_local_session(session_id.clone(), conn);

    Ok(LocalConnectResult { session_id })
}

pub async fn start_terminal(
    state: &AppState,
    app: AppHandle,
    session_id: String,
    cols: Option<u32>,
    rows: Option<u32>,
) -> AppResult<String> {
    let conn = state
        .get_local_session(&session_id)
        .ok_or_else(|| super::error::AppError::InvalidSession)?;

    // Check if a reader task is already running (receiver is locked)
    {
        let terminals = conn.terminal.lock().await;
        if !terminals.is_empty() {
            return Err(super::error::AppError::Message(
                "Local sessions support only one terminal".to_string(),
            ));
        }
    }

    let token = Uuid::new_v4().to_string();
    let terminal = Arc::new(LocalTerminalSession {
        stop: std::sync::atomic::AtomicBool::new(false),
    });

    conn.terminal
        .lock()
        .await
        .insert(token.clone(), terminal.clone());

    if let (Some(cols), Some(rows)) = (cols, rows) {
        let master = conn.master.lock().await;
        let _ = master.resize(PtySize {
            rows: rows.max(8) as u16,
            cols: cols.max(20) as u16,
            pixel_width: 0,
            pixel_height: 0,
        });
    }

    let thread_token = token.clone();
    let thread_session_id = session_id.clone();
    let conn_for_reader = conn.clone();

    tauri::async_runtime::spawn(async move {
        let mut receiver = conn_for_reader.receiver.lock().await;
        let mut batch_buffer = String::with_capacity(8192);
        let mut interval = tokio::time::interval(Duration::from_millis(30));

        loop {
            if terminal.stop.load(Ordering::SeqCst) {
                break;
            }

            tokio::select! {
                chunk = receiver.recv() => {
                    match chunk {
                        Some(data) => {
                            batch_buffer.push_str(&data);
                            if batch_buffer.len() >= 4096 {
                                emit_terminal_chunk(
                                    &app,
                                    &thread_token,
                                    &thread_session_id,
                                    std::mem::take(&mut batch_buffer),
                                );
                            }
                        }
                        None => break, // channel closed, process ended
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

pub async fn write(
    state: State<'_, AppState>,
    session_id: String,
    _token: String,
    data: String,
) -> AppResult<()> {
    let conn = state
        .get_local_session(&session_id)
        .ok_or_else(|| super::error::AppError::InvalidSession)?;

    let mut writer = conn.writer.lock().await;
    writer.write_all(data.as_bytes())?;
    writer.flush()?;
    Ok(())
}

pub async fn stop(state: State<'_, AppState>, session_id: String, token: String) -> AppResult<()> {
    let conn = state
        .get_local_session(&session_id)
        .ok_or_else(|| super::error::AppError::InvalidSession)?;

    let terminal = {
        let terminals = conn.terminal.lock().await;
        terminals.get(&token).cloned()
    };
    if let Some(terminal) = terminal {
        terminal.stop.store(true, Ordering::SeqCst);
    }
    cleanup_terminal(state.inner(), &session_id, &token).await;
    Ok(())
}

pub async fn resize(
    state: State<'_, AppState>,
    session_id: String,
    _token: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let conn = state
        .get_local_session(&session_id)
        .ok_or_else(|| super::error::AppError::InvalidSession)?;

    let master = conn.master.lock().await;
    let _ = master.resize(PtySize {
        rows: rows.max(8) as u16,
        cols: cols.max(20) as u16,
        pixel_width: 0,
        pixel_height: 0,
    });
    Ok(())
}

pub async fn disconnect(state: &AppState, session_id: String) -> AppResult<()> {
    if let Some(conn) = state.remove_local_session(&session_id) {
        {
            let mut terminals = conn.terminal.lock().await;
            for (_, terminal) in terminals.drain() {
                terminal.stop.store(true, Ordering::SeqCst);
            }
        }
        let mut child = conn.child.lock().await;
        let _ = child.kill();
    }
    Ok(())
}
