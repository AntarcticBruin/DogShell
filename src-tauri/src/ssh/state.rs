use russh::client::Handle;
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Default)]
pub struct AppState {
    sessions: StdMutex<HashMap<String, Arc<SshConn>>>,
    local_sessions: StdMutex<HashMap<String, Arc<LocalConn>>>,
}

impl AppState {
    pub fn insert_session(&self, id: String, conn: Arc<SshConn>) {
        self.sessions.lock().unwrap().insert(id, conn);
    }

    pub fn get_session(&self, id: &str) -> Option<Arc<SshConn>> {
        self.sessions.lock().unwrap().get(id).cloned()
    }

    pub fn remove_session(&self, id: &str) -> Option<Arc<SshConn>> {
        self.sessions.lock().unwrap().remove(id)
    }

    pub fn insert_local_session(&self, id: String, conn: Arc<LocalConn>) {
        self.local_sessions.lock().unwrap().insert(id, conn);
    }

    pub fn get_local_session(&self, id: &str) -> Option<Arc<LocalConn>> {
        self.local_sessions.lock().unwrap().get(id).cloned()
    }

    pub fn remove_local_session(&self, id: &str) -> Option<Arc<LocalConn>> {
        self.local_sessions.lock().unwrap().remove(id)
    }
}

pub struct SshConn {
    pub handle: AsyncMutex<Handle<super::session::Client>>,
    pub watchers: StdMutex<HashMap<String, Arc<Watcher>>>,
    pub terminal: AsyncMutex<HashMap<String, Arc<TerminalSession>>>,
}

pub struct LocalConn {
    pub child: AsyncMutex<Box<dyn portable_pty::Child + Send>>,
    pub master: AsyncMutex<Box<dyn portable_pty::MasterPty + Send>>,
    pub writer: AsyncMutex<Box<dyn Write + Send>>,
    pub receiver: AsyncMutex<tokio::sync::mpsc::UnboundedReceiver<String>>,
    pub terminal: AsyncMutex<HashMap<String, Arc<LocalTerminalSession>>>,
}

pub struct Watcher {
    pub stop: AtomicBool,
}

pub struct TerminalSession {
    pub stop: AtomicBool,
    pub writer: AsyncMutex<russh::ChannelWriteHalf<russh::client::Msg>>,
}

pub struct LocalTerminalSession {
    pub stop: AtomicBool,
}
