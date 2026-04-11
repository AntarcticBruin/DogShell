import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AppTab,
  ConnectOptions,
  DirEntry,
  FavoriteItem,
  HostProfile,
  HostSession,
  TailEvent,
  TerminalEvent,
  TerminalTab,
  TransferProgressEvent,
} from "../types/app";
import { highlightLogLine } from "../utils/logHighlight";

function normalizeHostProfile(profile: HostProfile): HostProfile {
  if (profile.authType === "key") {
    return {
      ...profile,
      passphrase: profile.passphrase || undefined,
    };
  }

  return {
    ...profile,
    authType: "password",
    password: profile.password || "",
  };
}

export function useLogCatApp() {
  const appWindow = getCurrentWindow();

  const activeTab = ref<AppTab>("hosts");
  const isModalOpen = ref(false);
  const savedHosts = ref<HostProfile[]>([]);
  const selectedHostId = ref<string | null>(null);

  const hostName = ref("");
  const host = ref("");
  const port = ref(22);
  const username = ref("root");
  const authType = ref<"password" | "key">("password");
  const password = ref("");
  const keyPath = ref("");
  const passphrase = ref("");

  const activeSessionId = ref<string | null>(null);
  const hostSessions = ref<HostSession[]>([]);

  // Computed properties to access current session's state
  const currentSession = computed(() => 
    hostSessions.value.find(s => s.sessionId === activeSessionId.value) || null
  );

  const sessionId = computed(() => currentSession.value?.sessionId || null);
  const currentConnectedHostId = computed(() => currentSession.value?.hostId || null);
  const currentConnectingHostId = ref<string | null>(null);

  const entries = computed({
    get: () => currentSession.value?.entries || [],
    set: (val) => { if (currentSession.value) currentSession.value.entries = val; }
  });
  const currentPath = computed({
    get: () => currentSession.value?.currentPath || "/",
    set: (val) => { if (currentSession.value) currentSession.value.currentPath = val; }
  });
  const selectedFile = computed({
    get: () => currentSession.value?.selectedFile || null,
    set: (val) => { if (currentSession.value) currentSession.value.selectedFile = val; }
  });
  const tailToken = computed({
    get: () => currentSession.value?.tailToken || null,
    set: (val) => { if (currentSession.value) currentSession.value.tailToken = val; }
  });
  const content = computed({
    get: () => currentSession.value?.content || "",
    set: (val) => { if (currentSession.value) currentSession.value.content = val; }
  });
  const terminalTabs = computed({
    get: () => currentSession.value?.terminalTabs || [],
    set: (val) => { if (currentSession.value) currentSession.value.terminalTabs = val; }
  });
  const activeTerminalTabId = computed({
    get: () => currentSession.value?.activeTerminalTabId || null,
    set: (val) => { if (currentSession.value) currentSession.value.activeTerminalTabId = val; }
  });
  const loading = computed({
    get: () => currentSession.value?.loading || false,
    set: (val) => { if (currentSession.value) currentSession.value.loading = val; }
  });
  const transferProgress = computed({
    get: () => currentSession.value?.transferProgress || null,
    set: (val) => { if (currentSession.value) currentSession.value.transferProgress = val; }
  });
  const highlightedLines = computed({
    get: () => currentSession.value?.highlightedLines || [],
    set: (val) => { if (currentSession.value) currentSession.value.highlightedLines = val; }
  });
  const favorites = ref<FavoriteItem[]>([]);
  const showFavorites = ref(false);
  const isConnecting = ref(false);
  const errorMsg = ref("");

  const logViewer = ref<HTMLElement | null>(null);
  const isAutoScroll = ref(true);
  const isFileEditorOpen = ref(false);
  const fileEditorName = ref("");
  const fileEditorPath = ref("");
  const fileEditorContent = ref("");
  const isSavingFileEditor = ref(false);
  const isCreateEntryModalOpen = ref(false);
  const createEntryKind = ref<"file" | "dir">("file");
  const createEntryName = ref("");
  const isCreatingEntry = ref(false);
  const renameTargetEntry = ref<DirEntry | null>(null);
  const isRenameModalOpen = ref(false);
  const renameEntryName = ref("");
  const isRenamingEntry = ref(false);
  const chmodTargetEntry = ref<DirEntry | null>(null);
  const isPermissionModalOpen = ref(false);
  const chmodMode = ref("");
  const isChangingMode = ref(false);
  const deleteTargetEntry = ref<DirEntry | null>(null);
  const isDeleteConfirmOpen = ref(false);
  const isDeletingEntry = ref(false);
  const favoritePaths = computed(() => {
    const paths = new Set<string>();
    const hostId = currentConnectedHostId.value;
    if (!hostId) {
      return paths;
    }

    for (const item of favorites.value) {
      if (item.hostId === hostId) {
        paths.add(item.path);
      }
    }

    return paths;
  });
  const MAX_LINES = 5000;
  const directoryCache = new Map<string, DirEntry[]>();
  let latestDirectoryRequestId = 0;
  const pendingHighlightedChunks = new Map<string, string>();

  let unlistenTail: (() => void) | null = null;
  let unlistenTerminal: (() => void) | null = null;
  let unlistenDragDrop: (() => void) | null = null;
  let unlistenTransferProgress: (() => void) | null = null;
  let ignoreNextPromptLine = false;

  function visibleEntries(list: DirEntry[]) {
    return list;
  }

  function directoryCacheKey(targetSessionId: string, path: string) {
    return `${targetSessionId}:${path}`;
  }

  function getCachedDirectoryEntries(targetSessionId: string, path: string) {
    return directoryCache.get(directoryCacheKey(targetSessionId, path));
  }

  function setCachedDirectoryEntries(targetSessionId: string, path: string, list: DirEntry[]) {
    directoryCache.set(directoryCacheKey(targetSessionId, path), visibleEntries(list));
  }

  function clearDirectoryState() {
    directoryCache.clear();
    latestDirectoryRequestId += 1;
    entries.value = [];
  }

  function invalidateDirectoryCache() {
    directoryCache.clear();
    latestDirectoryRequestId += 1;
  }

  const isDraggingOverSidebar = ref(false);

  onMounted(() => {
    const storedHosts = localStorage.getItem("logcat_hosts");
    if (storedHosts) {
      savedHosts.value = (JSON.parse(storedHosts) as HostProfile[]).map(normalizeHostProfile);
    }

    const storedFavorites = localStorage.getItem("logcat_favorites");
    if (storedFavorites) {
      favorites.value = JSON.parse(storedFavorites) as FavoriteItem[];
    }

    appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        isDraggingOverSidebar.value = true;
      } else if (event.payload.type === "drop") {
        if (sessionId.value) {
          void uploadFiles(event.payload.paths);
        }
        isDraggingOverSidebar.value = false;
      } else if (event.payload.type === "leave") {
        isDraggingOverSidebar.value = false;
      }
    }).then((unlisten) => {
      unlistenDragDrop = unlisten;
    });
  });

  watch(
    savedHosts,
    (newValue) => {
      localStorage.setItem("logcat_hosts", JSON.stringify(newValue));
    },
    { deep: true },
  );

  watch(
    favorites,
    (newValue) => {
      localStorage.setItem("logcat_favorites", JSON.stringify(newValue));
    },
    { deep: true },
  );

  const currentHostFavorites = computed(() =>
    favorites.value.filter((item) => item.hostId === currentConnectedHostId.value),
  );

  function resetHighlightedLines(session: HostSession) {
    session.highlightedLines = [];
    pendingHighlightedChunks.set(session.sessionId, "");
  }

  function appendHighlightedChunk(session: HostSession, chunk: string) {
    const pendingChunk = pendingHighlightedChunks.get(session.sessionId) || "";
    const merged = pendingChunk + chunk;
    const parts = merged.split("\n");
    const endsWithNewline = merged.endsWith("\n");
    const nextPending = endsWithNewline ? null : parts.pop() ?? "";

    if (pendingChunk !== "" && !pendingChunk.endsWith("\n") && session.highlightedLines.length > 0) {
      session.highlightedLines.pop();
    }

    const newLines = parts.map(highlightLogLine);
    session.highlightedLines.push(...newLines);

    if (nextPending !== null) {
      pendingHighlightedChunks.set(session.sessionId, nextPending);
      session.highlightedLines.push(highlightLogLine(nextPending));
    } else {
      pendingHighlightedChunks.set(session.sessionId, "");
    }

    // 维持最大行数限制，防止内存暴涨
    if (session.highlightedLines.length > MAX_LINES) {
      session.highlightedLines.splice(0, session.highlightedLines.length - MAX_LINES);
    }
  }

  function appendTerminalChunk(session: HostSession, tabId: string, chunk: string) {
    if (ignoreNextPromptLine) {
      if (chunk.includes('\r\n') || chunk.includes('\n')) {
        ignoreNextPromptLine = false;
      }
    }
    const tab = session.terminalTabs.find(t => t.id === tabId);
    if (tab) {
      tab.content += chunk;
    }
  }

  function resetHostForm() {
    selectedHostId.value = null;
    hostName.value = "";
    host.value = "";
    port.value = 22;
    username.value = "root";
    authType.value = "password";
    password.value = "";
    keyPath.value = "";
    passphrase.value = "";
  }

  function openAddModal() {
    resetHostForm();
    isModalOpen.value = true;
  }

  function openEditModal(profile: HostProfile) {
    selectedHostId.value = profile.id;
    hostName.value = profile.name;
    host.value = profile.host;
    port.value = profile.port;
    username.value = profile.username;
    authType.value = profile.authType === "key" ? "key" : "password";
    password.value = profile.authType === "key" ? "" : profile.password || "";
    keyPath.value = profile.authType === "key" ? profile.keyPath : "";
    passphrase.value = profile.authType === "key" ? profile.passphrase || "" : "";
    isModalOpen.value = true;
  }

  function closeModal() {
    isModalOpen.value = false;
  }

  function saveHost() {
    if (!host.value || !username.value) return;
    if (authType.value === "key" && !keyPath.value) return;

    const baseProfile = {
      id: selectedHostId.value || crypto.randomUUID(),
      name: hostName.value || host.value,
      host: host.value,
      port: port.value,
      username: username.value,
    };

    const newProfile: HostProfile =
      authType.value === "key"
        ? {
            ...baseProfile,
            authType: "key",
            keyPath: keyPath.value,
            passphrase: passphrase.value || undefined,
          }
        : {
            ...baseProfile,
            authType: "password",
            password: password.value,
          };

    const index = savedHosts.value.findIndex((item) => item.id === newProfile.id);
    if (index >= 0) {
      savedHosts.value[index] = newProfile;
    } else {
      savedHosts.value.push(newProfile);
    }

    closeModal();
  }

  function deleteHost(id: string) {
    savedHosts.value = savedHosts.value.filter((item) => item.id !== id);
  }

  async function connectToHost(profile: HostProfile) {
    selectedHostId.value = profile.id;
    currentConnectingHostId.value = profile.id;
    host.value = profile.host;
    port.value = profile.port;
    username.value = profile.username;
    authType.value = profile.authType === "key" ? "key" : "password";
    password.value = profile.authType === "key" ? "" : profile.password || "";
    keyPath.value = profile.authType === "key" ? profile.keyPath : "";
    passphrase.value = profile.authType === "key" ? profile.passphrase || "" : "";

    loading.value = true;
    isConnecting.value = true;
    errorMsg.value = "";
    activeTab.value = "logs";

    try {
      const options: ConnectOptions = {
        host: host.value,
        port: port.value,
        username: username.value,
        auth:
          authType.value === "key"
            ? {
                type: "key",
                key_path: keyPath.value,
                passphrase: passphrase.value || null,
              }
            : {
                type: "password",
                password: password.value,
              },
        keepalive_ms: 15000,
      };

      const result = await invoke<{ session_id: string }>("connect_ssh", { opts: options });

      const newSession: HostSession = {
        sessionId: result.session_id,
        hostId: profile.id,
        profile,
        currentPath: "/",
        entries: [],
        selectedFile: null,
        tailToken: null,
        content: "",
        highlightedLines: [],
        terminalTabs: [],
        activeTerminalTabId: null,
        transferProgress: null,
        loading: false,
      };
      
      hostSessions.value.push(newSession);
      activeSessionId.value = result.session_id;
      
      clearDirectoryState();
      await ensureTailListener();
      await ensureTerminalListener();
      await ensureTransferProgressListener();
      await startTerminal();
      await refresh();
    } catch (error) {
      errorMsg.value = String(error);
      activeTab.value = "hosts";
    } finally {
      currentConnectingHostId.value = null;
      isConnecting.value = false;
      loading.value = false;
    }
  }

  async function disconnect(targetSessionId: string = sessionId.value!) {
    if (!targetSessionId) return;

    const sessionIndex = hostSessions.value.findIndex(s => s.sessionId === targetSessionId);
    if (sessionIndex === -1) return;
    
    const session = hostSessions.value[sessionIndex];

    await stopTail(targetSessionId);
    await Promise.all(session.terminalTabs.map(tab => stopTerminal(tab.id, targetSessionId)));
    
    try {
      await invoke("disconnect_ssh", { sessionId: targetSessionId });
    } catch (error) {
      console.error(error);
    }

    hostSessions.value.splice(sessionIndex, 1);
    
    if (activeSessionId.value === targetSessionId) {
      activeSessionId.value = hostSessions.value.length > 0 ? hostSessions.value[hostSessions.value.length - 1].sessionId : null;
    }
    
    if (hostSessions.value.length === 0) {
      activeTab.value = "hosts";
    }
  }

  async function ensureTailListener() {
    if (unlistenTail) return;

    unlistenTail = await listen<TailEvent>("tail_data", (event) => {
      const session = hostSessions.value.find(s => s.sessionId === event.payload.session_id);
      if (session && event.payload?.token === session.tailToken) {
        session.content += event.payload.chunk;
        appendHighlightedChunk(session, event.payload.chunk);
        if (isAutoScroll.value && activeSessionId.value === session.sessionId) {
          scrollToBottom();
        }
      }
    });
  }

  async function ensureTerminalListener() {
    if (unlistenTerminal) return;

    unlistenTerminal = await listen<TerminalEvent>("terminal_data", (event) => {
      const session = hostSessions.value.find(s => s.sessionId === event.payload.session_id);
      if (!session) return;

      const tab = session.terminalTabs.find(t => t.token === event.payload.token || (t.isStarting && !t.token));
      if (tab) {
        appendTerminalChunk(session, tab.id, event.payload.chunk);
      }
    });
  }

  async function ensureTransferProgressListener() {
    if (unlistenTransferProgress) return;

    unlistenTransferProgress = await listen<TransferProgressEvent>("transfer_progress", (event) => {
      const session = hostSessions.value.find(s => s.sessionId === event.payload.session_id);
      if (!session) return;

      session.transferProgress = {
        fileName: event.payload.file_name,
        transferred: event.payload.transferred,
        total: event.payload.total,
      };

      if (event.payload.total > 0 && event.payload.transferred >= event.payload.total) {
        setTimeout(() => {
          if (session.transferProgress?.fileName === event.payload.file_name) {
            session.transferProgress = null;
          }
        }, 1500);
      }
    });
  }

  async function refresh(options?: { force?: boolean; path?: string }) {
    const activeSessionId = sessionId.value;
    if (!activeSessionId) return;

    const targetPath = options?.path ?? currentPath.value;
    const requestId = ++latestDirectoryRequestId;
    const cachedEntries = !options?.force ? getCachedDirectoryEntries(activeSessionId, targetPath) : undefined;

    // 性能优化：如果缓存命中，立即同步更新 UI，实现“秒开”体验
    if (cachedEntries) {
      entries.value = cachedEntries;
    } else {
      // 只有在完全没有数据时才显示加载状态，减少闪烁
      loading.value = true;
    }

    try {
      const list = await invoke<DirEntry[]>("list_dir", {
        sessionId: activeSessionId,
        path: targetPath,
      });
      const processedEntries = visibleEntries(list);
      setCachedDirectoryEntries(activeSessionId, targetPath, list);

      if (
        requestId === latestDirectoryRequestId
        && sessionId.value === activeSessionId
        && currentPath.value === targetPath
      ) {
        entries.value = processedEntries;
      }
    } catch (error) {
      if (requestId === latestDirectoryRequestId) {
        errorMsg.value = `Failed to list dir: ${error}`;
      }
    } finally {
      if (requestId === latestDirectoryRequestId) {
        loading.value = false;
      }
    }
  }

  function openDirectory(path: string) {
    if (!sessionId.value) return;

    showFavorites.value = false;
    currentPath.value = path;

    void closeSelectedFile();

    const cachedEntries = getCachedDirectoryEntries(sessionId.value, path);
    if (cachedEntries) {
      entries.value = cachedEntries;
    }

    void refresh({ path });
  }

  async function closeSelectedFile() {
    if (!currentSession.value) return;
    await stopTail();
    currentSession.value.selectedFile = null;
    currentSession.value.content = "";
    resetHighlightedLines(currentSession.value);
  }

  async function enter(entry: DirEntry) {
    if (!currentSession.value) return;
    
    if (entry.kind === "dir") {
      openDirectory(entry.path);
      return;
    }

    if (entry.kind === "file") {
      if (!entry.is_text) {
        errorMsg.value = `File "${entry.name}" is not a text file and cannot be viewed.`;
        return;
      }
      
      showFavorites.value = false;

      if (currentSession.value.selectedFile === entry.path) {
        await closeSelectedFile();
        return;
      }

      currentSession.value.selectedFile = entry.path;
      await startTail();
    }
  }

  async function startTail() {
    if (!sessionId.value || !selectedFile.value || !currentSession.value) return;

    await stopTail();
    currentSession.value.content = "";
    resetHighlightedLines(currentSession.value);

    try {
      currentSession.value.tailToken = await invoke<string>("start_tail", {
        sessionId: sessionId.value,
        path: selectedFile.value,
        lines: 200,
      });
    } catch (error) {
      errorMsg.value = `Failed to tail: ${error}`;
    }
  }

  async function stopTail(targetSessionId: string = sessionId.value!) {
    if (!targetSessionId) return;
    
    const session = hostSessions.value.find(s => s.sessionId === targetSessionId);
    if (!session || !session.tailToken) return;

    try {
      await invoke("stop_tail", { sessionId: targetSessionId, token: session.tailToken });
    } catch (error) {
      console.error(error);
    }

    session.tailToken = null;
  }

  async function startTerminal(cols?: number, rows?: number) {
    if (!sessionId.value || !currentSession.value) return;

    const id = crypto.randomUUID();
    const newTab: TerminalTab = {
      id,
      token: null,
      content: "",
      name: `Terminal ${currentSession.value.terminalTabs.length + 1}`,
      isStarting: true,
    };
    currentSession.value.terminalTabs.push(newTab);
    currentSession.value.activeTerminalTabId = id;

    try {
      const token = await invoke<string>("start_terminal", {
        sessionId: sessionId.value,
        cols,
        rows,
      });
      const tab = currentSession.value.terminalTabs.find(t => t.id === id);
      if (tab) {
        tab.token = token;
      }
    } catch (error) {
      errorMsg.value = `Failed to start terminal: ${error}`;
    } finally {
      const tab = currentSession.value.terminalTabs.find(t => t.id === id);
      if (tab) {
        tab.isStarting = false;
      }
    }
  }

  async function stopTerminal(tabId: string, targetSessionId: string = sessionId.value!) {
    if (!targetSessionId) return;
    const session = hostSessions.value.find(s => s.sessionId === targetSessionId);
    if (!session) return;

    const tabIndex = session.terminalTabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = session.terminalTabs[tabIndex];
    if (tab.token) {
      try {
        await invoke("stop_terminal", { sessionId: targetSessionId, token: tab.token });
      } catch (error) {
        console.error(error);
      }
    }

    session.terminalTabs.splice(tabIndex, 1);
    if (session.activeTerminalTabId === tabId) {
      session.activeTerminalTabId = session.terminalTabs.length > 0 ? session.terminalTabs[session.terminalTabs.length - 1].id : null;
    }
  }

  async function writeTerminal(tabId: string, data: string) {
    if (!sessionId.value || !data || !currentSession.value) return;
    const tab = currentSession.value.terminalTabs.find(t => t.id === tabId);
    if (!tab || !tab.token) return;

    try {
      await invoke("write_terminal", {
        sessionId: sessionId.value,
        token: tab.token,
        data,
      });
    } catch (error) {
      errorMsg.value = `Failed to write terminal: ${error}`;
    }
  }

  async function cdInTerminal(tabId: string, path: string) {
    if (!sessionId.value || !currentSession.value) return;
    const tab = currentSession.value.terminalTabs.find(t => t.id === tabId);
    if (!tab || !tab.token) return;
    
    await closeSelectedFile();
    await writeTerminal(tabId, ` cd ${path}\n`);
  }

  async function resizeTerminal(tabId: string, cols: number, rows: number) {
    if (!sessionId.value || !currentSession.value) return;
    const tab = currentSession.value.terminalTabs.find(t => t.id === tabId);
    if (!tab || !tab.token) return;

    try {
      await invoke("resize_terminal", {
        sessionId: sessionId.value,
        token: tab.token,
        cols,
        rows,
      });
    } catch (error) {
      console.error(error);
    }
  }

  function up() {
    const path = currentPath.value;
    if (path === "/") return;

    const parent = path.endsWith("/") ? path.slice(0, -1) : path;
    const index = parent.lastIndexOf("/");
    openDirectory(index <= 0 ? "/" : parent.slice(0, index));
  }

  function dirname(path: string) {
    if (path === "/") return "/";
    const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
    const index = normalized.lastIndexOf("/");
    return index <= 0 ? "/" : normalized.slice(0, index);
  }

  function joinPath(parent: string, name: string) {
    if (parent === "/") return `/${name}`;
    return `${parent}/${name}`;
  }

  function isFavorite(path: string) {
    return favoritePaths.value.has(path);
  }

  function toggleFavorite(entry: DirEntry) {
    if (!currentConnectedHostId.value || (entry.kind !== "dir" && entry.kind !== "file")) return;

    const index = favorites.value.findIndex(
      (item) => item.hostId === currentConnectedHostId.value && item.path === entry.path,
    );

    if (index >= 0) {
      favorites.value.splice(index, 1);
      return;
    }

    const currentHostName =
      savedHosts.value.find((item) => item.id === currentConnectedHostId.value)?.name || "Current Host";

    favorites.value.push({
      id: crypto.randomUUID(),
      hostId: currentConnectedHostId.value,
      hostName: currentHostName,
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      is_symlink: entry.is_symlink,
    });
  }

  function toggleFavoritesPanel() {
    showFavorites.value = !showFavorites.value;
  }

  async function openFavorite(item: FavoriteItem) {
    if (!sessionId.value) return;

    showFavorites.value = false;

    if (item.kind === "dir") {
      await closeSelectedFile();
      openDirectory(item.path);
      return;
    }

    if (selectedFile.value === item.path) {
      await closeSelectedFile();
      return;
    }

    currentPath.value = dirname(item.path);
    selectedFile.value = item.path;
    const cachedEntries = getCachedDirectoryEntries(sessionId.value, currentPath.value);
    if (cachedEntries) {
      entries.value = cachedEntries;
    }
    await refresh({ path: currentPath.value });
    await startTail();
  }

  function scrollToBottom() {
    void nextTick(() => {
      if (logViewer.value) {
        logViewer.value.scrollTop = logViewer.value.scrollHeight;
      }
    });
  }

  function clearError() {
    errorMsg.value = "";
  }

  function clearContent() {
    if (!currentSession.value) return;
    currentSession.value.content = "";
    resetHighlightedLines(currentSession.value);
  }

  async function pickPrivateKeyPath() {
    try {
      const defaultPath = await invoke<string>("default_ssh_key_dir");
      const selected = await open({
        defaultPath,
        directory: false,
        multiple: false,
      });

      if (typeof selected === "string") {
        keyPath.value = selected;
      }
    } catch (error) {
      errorMsg.value = `Failed to pick key: ${error}`;
    }
  }

  async function uploadFiles(localPaths: string[]) {
    if (!sessionId.value || localPaths.length === 0) return;

    loading.value = true;
    try {
      await Promise.all(
        localPaths.map(async (localPath) => {
          const fileName = localPath.split(/[/\\]/).pop();
          if (!fileName) return;

          const remotePath = currentPath.value.endsWith("/")
            ? `${currentPath.value}${fileName}`
            : `${currentPath.value}/${fileName}`;

          await invoke("upload_file", {
            sessionId: sessionId.value,
            localPath,
            remotePath,
          });
        }),
      );
      await refresh({ force: true });
    } catch (error) {
      errorMsg.value = `Failed to upload files: ${error}`;
    } finally {
      loading.value = false;
    }
  }

  async function downloadFile(entry: DirEntry) {
    if (!sessionId.value) return;

    try {
      const defaultPath = entry.name;
      const localPath = await save({
        defaultPath,
        title: "Save File",
      });

      if (!localPath) return;

      loading.value = true;
      await invoke("download_file", {
        sessionId: sessionId.value,
        remotePath: entry.path,
        localPath,
      });
    } catch (error) {
      errorMsg.value = `Failed to download file: ${error}`;
    } finally {
      loading.value = false;
    }
  }

  async function openFileEditor(entry: DirEntry) {
    if (!sessionId.value) return;
    if (entry.kind !== "file" || !entry.is_text) {
      errorMsg.value = `File "${entry.name}" is not a text file and cannot be edited.`;
      return;
    }

    loading.value = true;

    try {
      const fileContent = await invoke<string>("read_text_file", {
        sessionId: sessionId.value,
        path: entry.path,
      });

      fileEditorName.value = entry.name;
      fileEditorPath.value = entry.path;
      fileEditorContent.value = fileContent;
      isFileEditorOpen.value = true;
    } catch (error) {
      errorMsg.value = `Failed to open file editor: ${error}`;
    } finally {
      loading.value = false;
    }
  }

  function closeFileEditor() {
    isFileEditorOpen.value = false;
    fileEditorName.value = "";
    fileEditorPath.value = "";
    fileEditorContent.value = "";
  }

  function openCreateEntryModal(kind: "file" | "dir") {
    createEntryKind.value = kind;
    createEntryName.value = "";
    isCreateEntryModalOpen.value = true;
  }

  function closeCreateEntryModal() {
    isCreateEntryModalOpen.value = false;
    createEntryName.value = "";
  }

  function requestRenameEntry(entry: DirEntry) {
    renameTargetEntry.value = entry;
    renameEntryName.value = entry.name;
    isRenameModalOpen.value = true;
  }

  function closeRenameModal() {
    isRenameModalOpen.value = false;
    renameTargetEntry.value = null;
    renameEntryName.value = "";
  }

  function requestChangeMode(entry: DirEntry) {
    chmodTargetEntry.value = entry;
    chmodMode.value = entry.mode != null ? entry.mode.toString(8).padStart(3, "0") : "";
    isPermissionModalOpen.value = true;
  }

  function closePermissionModal() {
    isPermissionModalOpen.value = false;
    chmodTargetEntry.value = null;
    chmodMode.value = "";
  }

  function requestCreateFile() {
    openCreateEntryModal("file");
  }

  function requestCreateDir() {
    openCreateEntryModal("dir");
  }

  function requestDeleteEntry(entry: DirEntry) {
    deleteTargetEntry.value = entry;
    isDeleteConfirmOpen.value = true;
  }

  function closeDeleteConfirm() {
    isDeleteConfirmOpen.value = false;
    deleteTargetEntry.value = null;
  }

  async function saveEditedFile() {
    if (!sessionId.value || !fileEditorPath.value) return;

    const targetPath = fileEditorPath.value;
    isSavingFileEditor.value = true;

    try {
      await invoke("write_text_file", {
        sessionId: sessionId.value,
        path: fileEditorPath.value,
        content: fileEditorContent.value,
      });

      closeFileEditor();
      invalidateDirectoryCache();
      await refresh({ force: true });

      if (selectedFile.value === targetPath) {
        await startTail();
      }
    } catch (error) {
      errorMsg.value = `Failed to save file: ${error}`;
    } finally {
      isSavingFileEditor.value = false;
    }
  }

  async function confirmRenameEntry() {
    if (!sessionId.value || !renameTargetEntry.value) return;

    const entry = renameTargetEntry.value;
    const nextName = renameEntryName.value.trim();
    if (!nextName || nextName === entry.name) {
      closeRenameModal();
      return;
    }

    if (nextName.includes("/")) {
      errorMsg.value = "Name cannot contain /";
      return;
    }

    isRenamingEntry.value = true;

    try {
      const newPath = joinPath(dirname(entry.path), nextName);
      await invoke("rename_entry", {
        sessionId: sessionId.value,
        oldPath: entry.path,
        newPath,
      });

      favorites.value = favorites.value.map((item) => {
        if (item.hostId !== currentConnectedHostId.value || item.path !== entry.path) {
          return item;
        }
        return {
          ...item,
          name: nextName,
          path: newPath,
        };
      });

      if (selectedFile.value === entry.path) {
        selectedFile.value = newPath;
      }

      invalidateDirectoryCache();
      await refresh({ force: true });
      closeRenameModal();
    } catch (error) {
      errorMsg.value = `Failed to rename entry: ${error}`;
    } finally {
      isRenamingEntry.value = false;
    }
  }

  async function confirmChangeMode() {
    if (!sessionId.value || !chmodTargetEntry.value) return;

    const mode = chmodMode.value.trim();
    if (!/^[0-7]{3,4}$/.test(mode)) {
      errorMsg.value = "Permissions must be a 3-digit or 4-digit octal number";
      return;
    }

    isChangingMode.value = true;

    try {
      await invoke("chmod_entry", {
        sessionId: sessionId.value,
        path: chmodTargetEntry.value.path,
        mode,
      });
      invalidateDirectoryCache();
      await refresh({ force: true });
      closePermissionModal();
    } catch (error) {
      errorMsg.value = `Failed to change mode: ${error}`;
    } finally {
      isChangingMode.value = false;
    }
  }

  async function confirmDeleteEntry() {
    if (!sessionId.value || !deleteTargetEntry.value) return;

    const entry = deleteTargetEntry.value;
    isDeletingEntry.value = true;

    try {
      await invoke("delete_entry", {
        sessionId: sessionId.value,
        path: entry.path,
        kind: entry.kind,
        isSymlink: entry.is_symlink,
      });

      favorites.value = favorites.value.filter((item) => {
        if (item.hostId !== currentConnectedHostId.value) {
          return true;
        }

        return item.path !== entry.path && !item.path.startsWith(`${entry.path}/`);
      });

      if (
        selectedFile.value === entry.path
        || (entry.kind === "dir" && selectedFile.value?.startsWith(`${entry.path}/`))
      ) {
        await closeSelectedFile();
      }

      invalidateDirectoryCache();
      await refresh({ force: true });
      closeDeleteConfirm();
    } catch (error) {
      errorMsg.value = `Failed to delete entry: ${error}`;
    } finally {
      isDeletingEntry.value = false;
    }
  }

  async function confirmCreateEntry() {
    if (!sessionId.value) return;
    const kind = createEntryKind.value;

    const label = kind === "file" ? "file" : "folder";
    const name = createEntryName.value.trim();

    if (!name) {
      return;
    }

    if (name.includes("/")) {
      errorMsg.value = `${label} name cannot contain /`;
      return;
    }

    isCreatingEntry.value = true;

    try {
      const path = joinPath(currentPath.value, name);
      await invoke(kind === "file" ? "create_file" : "create_dir", {
        sessionId: sessionId.value,
        path,
      });
      invalidateDirectoryCache();
      await refresh({ force: true });
      closeCreateEntryModal();
    } catch (error) {
      errorMsg.value = `Failed to create ${kind}: ${error}`;
    } finally {
      isCreatingEntry.value = false;
    }
  }

  onBeforeUnmount(() => {
    if (unlistenTail) {
      unlistenTail();
    }
    if (unlistenTerminal) {
      unlistenTerminal();
    }
    if (unlistenDragDrop) {
      unlistenDragDrop();
    }
    if (unlistenTransferProgress) {
      unlistenTransferProgress();
    }
  });

  return {
    appWindow,
    activeTab,
    isModalOpen,
    savedHosts,
    selectedHostId,
    hostName,
    host,
    port,
    username,
    authType,
    password,
    keyPath,
    passphrase,
    activeSessionId,
    hostSessions,
    sessionId,
    currentConnectedHostId,
    currentConnectingHostId,
    entries,
    currentPath,
    selectedFile,
    favorites,
    showFavorites,
    tailToken,
    content,
    terminalTabs,
    activeTerminalTabId,
    loading,
    isConnecting,
    errorMsg,
    logViewer,
    isAutoScroll,
    transferProgress,
    isFileEditorOpen,
    fileEditorName,
    fileEditorPath,
    fileEditorContent,
    isSavingFileEditor,
    isCreateEntryModalOpen,
    createEntryKind,
    createEntryName,
    isCreatingEntry,
    renameTargetEntry,
    isRenameModalOpen,
    renameEntryName,
    isRenamingEntry,
    chmodTargetEntry,
    isPermissionModalOpen,
    chmodMode,
    isChangingMode,
    isDeleteConfirmOpen,
    deleteTargetEntry,
    isDeletingEntry,
    currentHostFavorites,
    highlightedLines,
    openAddModal,
    openEditModal,
    closeModal,
    saveHost,
    deleteHost,
    connectToHost,
    disconnect,
    refresh,
    enter,
    startTail,
    stopTail,
    startTerminal,
    stopTerminal,
    writeTerminal,
    cdInTerminal,
    resizeTerminal,
    up,
    isFavorite,
    toggleFavorite,
    toggleFavoritesPanel,
    openFavorite,
    clearError,
    clearContent,
    pickPrivateKeyPath,
    uploadFiles,
    isDraggingOverSidebar,
    downloadFile,
    openFileEditor,
    closeFileEditor,
    saveEditedFile,
    requestRenameEntry,
    closeRenameModal,
    confirmRenameEntry,
    requestChangeMode,
    closePermissionModal,
    confirmChangeMode,
    requestDeleteEntry,
    closeDeleteConfirm,
    confirmDeleteEntry,
    requestCreateFile,
    requestCreateDir,
    closeCreateEntryModal,
    confirmCreateEntry,
  };
}
