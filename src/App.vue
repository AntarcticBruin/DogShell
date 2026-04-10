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
  sessionId,
  currentConnectedHostId,
  currentConnectingHostId,
  entries,
  currentPath,
  selectedFile,
  showFavorites,
  tailToken,
  terminalToken,
  content,
  terminalContent,
  isConnecting,
  errorMsg,
  logViewer,
  terminalViewer,
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
          :current-connected-host-id="currentConnectedHostId"
          :current-connecting-host-id="currentConnectingHostId"
          @connect="connectToHost"
          @edit="openEditModal"
          @delete="deleteHost"
          @add="openAddModal"
        />

        <LogsWorkspace
          v-else
          v-model:current-path="currentPath"
          v-model:content="content"
          v-model:terminal-content="terminalContent"
          v-model:is-auto-scroll="isAutoScroll"
          v-model:log-viewer-ref="logViewer"
          v-model:terminal-viewer-ref="terminalViewer"
          v-model:is-dragging-over-sidebar="isDraggingOverSidebar"
          :session-id="sessionId"
          :show-favorites="showFavorites"
          :entries="entries"
          :current-host-favorites="currentHostFavorites"
          :selected-file="selectedFile"
          :tail-token="tailToken"
          :terminal-token="terminalToken"
          :highlighted-lines="highlightedLines"
          :is-favorite="isFavorite"
          :transfer-progress="transferProgress"
          @toggle-favorites="toggleFavoritesPanel"
          @disconnect="disconnect"
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
        />
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
      :kind-label="createEntryKind === 'file' ? '文件' : '文件夹'"
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
      title="删除确认"
      :message="deleteTargetEntry ? `确认删除 ${deleteTargetEntry.name} 吗？` : ''"
      confirm-text="删除"
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
        <div class="loading-text">Establishing SSH session and loading the initial workspace.</div>
      </div>
    </div>
  </div>
</template>
