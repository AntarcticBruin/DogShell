<script setup lang="ts">
import ActivityBar from "./components/layout/ActivityBar.vue";
import TitleBar from "./components/layout/TitleBar.vue";
import HostModal from "./components/hosts/HostModal.vue";
import HostsDashboard from "./components/hosts/HostsDashboard.vue";
import ConfirmActionModal from "./components/logs/ConfirmActionModal.vue";
import CreateEntryModal from "./components/logs/CreateEntryModal.vue";
import FileEditorModal from "./components/logs/FileEditorModal.vue";
import PermissionModal from "./components/logs/PermissionModal.vue";
import RenameEntryModal from "./components/logs/RenameEntryModal.vue";
import LogsWorkspace from "./components/logs/LogsWorkspace.vue";
import { useLogCatApp } from "./composables/useLogCatApp";
import "./styles/app.css";
import { computed } from "vue";

const {
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
  connectionType,
  localShell,
  localShellPath,
  command,
  activeSessionId,
  hostSessions,
  sessionId,
  currentConnectingHostId,
  isLocalSession,
  entries,
  currentPath,
  selectedFile,
  showFavorites,
  tailToken,
  terminalTabs,
  activeTerminalTabId,
  content,
  isConnecting,
  errorMsg,
  logViewer,
  isAutoScroll,
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
  isDraggingOverSidebar,
  downloadFile,
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
} = useLogCatApp();

const hostSessionTabs = computed(() => {
  const totals = new Map<string, number>();
  for (const session of hostSessions.value) {
    totals.set(session.hostId, (totals.get(session.hostId) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return hostSessions.value.map((session) => {
    const index = (seen.get(session.hostId) ?? 0) + 1;
    seen.set(session.hostId, index);

    const baseLabel = session.profile.name || session.profile.host;
    const suffix = (totals.get(session.hostId) ?? 1) > 1 ? ` #${index}` : "";

    return {
      sessionId: session.sessionId,
      label: `${baseLabel}${suffix}`,
    };
  });
});

const hostConnectionCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const session of hostSessions.value) {
    counts[session.hostId] = (counts[session.hostId] ?? 0) + 1;
  }
  return counts;
});
</script>

<template>
  <div class="app-container">
    <TitleBar :app-window="appWindow" />

    <div class="app-body">
      <ActivityBar v-model:active-tab="activeTab" />

      <main class="main-content">
        <HostsDashboard
          v-if="activeTab === 'hosts'"
          :saved-hosts="savedHosts"
          :host-connection-counts="hostConnectionCounts"
          :current-connecting-host-id="currentConnectingHostId"
          @connect="connectToHost"
          @edit="openEditModal"
          @delete="deleteHost"
          @add="openAddModal"
        />

        <template v-else-if="activeTab === 'logs'">
          <LogsWorkspace
            v-model:active-session-id="activeSessionId"
            v-model:current-path="currentPath"
            v-model:content="content"
            v-model:terminal-tabs="terminalTabs"
            v-model:active-terminal-tab-id="activeTerminalTabId"
            v-model:is-auto-scroll="isAutoScroll"
            v-model:log-viewer-ref="logViewer"
            v-model:is-dragging-over-sidebar="isDraggingOverSidebar"
            :session-id="sessionId"
            :host-session-tabs="hostSessionTabs"
            :show-favorites="showFavorites"
            :entries="entries"
            :current-host-favorites="currentHostFavorites"
            :selected-file="selectedFile"
            :tail-token="tailToken"
            :highlighted-lines="highlightedLines"
            :is-favorite="isFavorite"
            :transfer-progress="transferProgress"
            :show-sidebar="!isLocalSession"
            @toggle-favorites="toggleFavoritesPanel"
            @disconnect="disconnect"
            @disconnect-session="disconnect"
            @select-hosts-tab="activeTab = 'hosts'"
            @refresh="refresh"
            @up="up"
            @open-entry="enter"
            @open-favorite="openFavorite"
            @toggle-favorite="toggleFavorite"
            @download-file="downloadFile"
            @edit-entry="openFileEditor"
            @rename-entry="requestRenameEntry"
            @change-mode="requestChangeMode"
            @delete-entry="requestDeleteEntry"
            @create-file="requestCreateFile"
            @create-dir="requestCreateDir"
            @clear="clearContent"
            @stop="stopTail"
            @start="startTail"
            @write-terminal="writeTerminal"
            @cd-terminal="cdInTerminal"
            @resize-terminal="resizeTerminal"
            @start-terminal="startTerminal"
            @stop-terminal="stopTerminal"
          />
        </template>
      </main>
    </div>

    <HostModal
      v-model:selected-host-id="selectedHostId"
      v-model:host-name="hostName"
      v-model:host="host"
      v-model:port="port"
      v-model:username="username"
      v-model:auth-type="authType"
      v-model:password="password"
      v-model:key-path="keyPath"
      v-model:passphrase="passphrase"
      v-model:connection-type="connectionType"
      v-model:local-shell="localShell"
      v-model:local-shell-path="localShellPath"
      v-model:command="command"
      :is-open="isModalOpen"
      @close="closeModal"
      @save="saveHost"
      @pick-key-path="pickPrivateKeyPath"
    />

    <FileEditorModal
      v-model:is-open="isFileEditorOpen"
      v-model:file-name="fileEditorName"
      v-model:file-path="fileEditorPath"
      v-model:content="fileEditorContent"
      :saving="isSavingFileEditor"
      @close="closeFileEditor"
      @save="saveEditedFile"
    />

    <CreateEntryModal
      v-model:is-open="isCreateEntryModalOpen"
      v-model:name="createEntryName"
      :kind-label="createEntryKind === 'file' ? 'File' : 'Folder'"
      :current-path="currentPath"
      :saving="isCreatingEntry"
      @close="closeCreateEntryModal"
      @confirm="confirmCreateEntry"
    />

    <RenameEntryModal
      v-model:is-open="isRenameModalOpen"
      v-model:name="renameEntryName"
      :current-path="renameTargetEntry ? renameTargetEntry.path : ''"
      :saving="isRenamingEntry"
      @close="closeRenameModal"
      @confirm="confirmRenameEntry"
    />

    <PermissionModal
      v-model:is-open="isPermissionModalOpen"
      v-model:mode="chmodMode"
      :file-name="chmodTargetEntry ? chmodTargetEntry.name : ''"
      :saving="isChangingMode"
      @close="closePermissionModal"
      @confirm="confirmChangeMode"
    />

    <ConfirmActionModal
      v-model:is-open="isDeleteConfirmOpen"
      title="Delete Confirmation"
      :message="deleteTargetEntry ? `Are you sure you want to delete ${deleteTargetEntry.name}?` : ''"
      confirm-text="Delete"
      :destructive="true"
      :loading="isDeletingEntry"
      @close="closeDeleteConfirm"
      @confirm="confirmDeleteEntry"
    />

    <div v-if="errorMsg" class="error-banner">
      {{ errorMsg }}
      <button @click="clearError()">×</button>
    </div>

    <div v-if="isConnecting" class="loading-overlay">
      <div class="loading-panel">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-title">Connecting</div>
        <div class="loading-text">Starting terminal session...</div>
      </div>
    </div>
  </div>
</template>
