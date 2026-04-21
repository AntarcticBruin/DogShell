<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LocalShell } from "../../types/app";

const selectedHostId = defineModel<string | null>("selectedHostId", { required: true });
const hostName = defineModel<string>("hostName", { required: true });
const host = defineModel<string>("host", { required: true });
const port = defineModel<number>("port", { required: true });
const username = defineModel<string>("username", { required: true });
const authType = defineModel<"password" | "key">("authType", { required: true });
const password = defineModel<string>("password", { required: true });
const keyPath = defineModel<string>("keyPath", { required: true });
const passphrase = defineModel<string>("passphrase", { required: true });

const connectionType = defineModel<"ssh" | "local">("connectionType", { required: true });
const localShell = defineModel<LocalShell>("localShell", { required: true });
const localShellPath = defineModel<string>("localShellPath", { required: true });
const command = defineModel<string>("command", { required: true });

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save"): void;
  (event: "pick-key-path"): void;
}>();

const isWindows = navigator.userAgent.toLowerCase().includes("windows");
const CUSTOM_SHELL_VALUE = "__custom__";
const customShellDraft = ref("");
const isAddingCustomShell = ref(false);
const isUsingCustomShell = ref(false);

type ShellOption = {
  shell: LocalShell;
  path?: string;
  label: string;
};

const shellOptions = computed<ShellOption[]>(() => {
  const options: ShellOption[] = isWindows
    ? [
        { shell: "cmd", label: "Command Prompt" },
        { shell: "powershell", label: "Windows PowerShell" },
        { shell: "pwsh", label: "PowerShell" },
        { shell: "pwsh", path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", label: "PowerShell 7" },
        { shell: "bash", path: "C:\\Program Files\\Git\\bin\\bash.exe", label: "Git Bash" },
        { shell: "wsl", label: "WSL" },
      ]
    : [
        { shell: "sh", label: "sh" },
        { shell: "sh", path: "/bin/sh", label: "sh (/bin)" },
        { shell: "bash", label: "bash" },
        { shell: "bash", path: "/bin/bash", label: "bash (/bin)" },
        { shell: "bash", path: "/usr/local/bin/bash", label: "bash (/usr/local/bin)" },
        { shell: "zsh", label: "zsh" },
        { shell: "zsh", path: "/bin/zsh", label: "zsh (/bin)" },
        { shell: "zsh", path: "/usr/local/bin/zsh", label: "zsh (/usr/local/bin)" },
      ];

  if (localShellPath.value && !isUsingCustomShell.value) {
    const exists = options.some(option => option.shell === localShell.value && (option.path || "") === localShellPath.value);
    if (!exists) {
      options.unshift({
        shell: localShell.value,
        path: localShellPath.value,
        label: "Custom Path",
      });
    }
  }

  return options;
});

function matchesPresetShellPath(shell: LocalShell, path: string) {
  return shellOptions.value.some(option => option.shell === shell && (option.path || "") === path);
}

const selectedShellValue = computed({
  get: () => {
    if (isUsingCustomShell.value) {
      return CUSTOM_SHELL_VALUE;
    }

    const matched = shellOptions.value.find(
      option => option.shell === localShell.value && (option.path || "") === localShellPath.value,
    );
    if (matched) {
      return `${matched.shell}::${matched.path || ""}`;
    }
    if (localShellPath.value) {
      return CUSTOM_SHELL_VALUE;
    }
    return `${localShell.value}::`;
  },
  set: (value: string) => {
    if (value === CUSTOM_SHELL_VALUE) {
      isUsingCustomShell.value = true;
      isAddingCustomShell.value = true;
      customShellDraft.value = localShellPath.value;
      return;
    }

    const [shell, ...pathParts] = value.split("::");
    localShell.value = shell as LocalShell;
    localShellPath.value = pathParts.join("::");
    isUsingCustomShell.value = false;
    isAddingCustomShell.value = false;
    customShellDraft.value = "";
  },
});

function applyCustomShellPath() {
  const normalized = customShellDraft.value.trim();
  if (!normalized) {
    isAddingCustomShell.value = false;
    customShellDraft.value = "";
    return;
  }

  localShellPath.value = normalized;
  isUsingCustomShell.value = true;
  isAddingCustomShell.value = false;
  customShellDraft.value = "";
}

watch(
  () => connectionType.value,
  (value) => {
    if (value !== "local") {
      isUsingCustomShell.value = false;
      isAddingCustomShell.value = false;
      customShellDraft.value = "";
    }
  },
);

watch(
  () => [localShell.value, localShellPath.value, connectionType.value] as const,
  ([shell, path, type]) => {
    if (type !== "local") return;
    if (!path) {
      isUsingCustomShell.value = false;
      return;
    }
    if (!isUsingCustomShell.value) {
      isUsingCustomShell.value = !matchesPresetShellPath(shell, path);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ selectedHostId ? "Edit" : "Add" }} {{ connectionType === "local" ? "Local Terminal" : "Host" }}</h3>
        <button class="close-modal" @click="emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Connection Type</label>
          <div class="auth-switch">
            <button
              type="button"
              class="auth-switch-btn"
              :class="{ active: connectionType === 'ssh' }"
              @click="connectionType = 'ssh'"
            >
              SSH
            </button>
            <button
              type="button"
              class="auth-switch-btn"
              :class="{ active: connectionType === 'local' }"
              @click="connectionType = 'local'"
            >
              Local Terminal
            </button>
          </div>
        </div>

        <template v-if="connectionType === 'local'">
          <div class="form-group">
            <label>Name</label>
            <input v-model="hostName" placeholder="My Terminal" />
          </div>
          <div class="form-group">
            <label>Shell</label>
            <select v-model="selectedShellValue">
              <option
                v-for="option in shellOptions"
                :key="`${option.shell}-${option.path || 'default'}`"
                :value="`${option.shell}::${option.path || ''}`"
              >
                {{ option.label }}
              </option>
              <option :value="CUSTOM_SHELL_VALUE">Custom Path</option>
            </select>
          </div>
          <div v-if="isAddingCustomShell" class="form-group">
            <label>Custom Shell Path</label>
            <input
              v-model="customShellDraft"
              :placeholder="isWindows ? 'e.g. C:\\Tools\\pwsh.exe' : 'e.g. /usr/local/bin/bash'"
              @keydown.enter="applyCustomShellPath"
              @blur="applyCustomShellPath"
            />
          </div>
          <div class="form-group">
            <label>Startup Command</label>
            <input v-model="command" placeholder="e.g. claude, bash, python3" />
          </div>
        </template>

        <template v-else>
          <div class="form-group">
            <label>Name</label>
            <input v-model="hostName" placeholder="Production Server" />
          </div>
          <div class="form-group">
            <label>Host Address</label>
            <input v-model="host" placeholder="192.168.1.100" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Port</label>
              <input v-model.number="port" type="number" />
            </div>
            <div class="form-group">
              <label>Username</label>
              <input v-model="username" />
            </div>
          </div>
          <div class="form-group">
            <label>Authentication</label>
            <div class="auth-switch">
              <button
                type="button"
                class="auth-switch-btn"
                :class="{ active: authType === 'password' }"
                @click="authType = 'password'"
              >
                Password
              </button>
              <button
                type="button"
                class="auth-switch-btn"
                :class="{ active: authType === 'key' }"
                @click="authType = 'key'"
              >
                SSH Key
              </button>
            </div>
          </div>
          <div class="form-group">
            <template v-if="authType === 'password'">
              <label>Password</label>
              <input v-model="password" type="password" />
            </template>
            <template v-else>
              <label>Private Key Path</label>
              <div class="file-picker">
                <input v-model="keyPath" placeholder="Select a private key file" />
                <button type="button" class="btn btn-outline file-picker-btn" @click="emit('pick-key-path')">
                  Browse
                </button>
              </div>
            </template>
          </div>
          <div v-if="authType === 'key'" class="form-group">
            <label>Passphrase</label>
            <input v-model="passphrase" type="password" placeholder="Optional" />
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" @click="emit('save')">Save</button>
      </div>
    </div>
  </div>
</template>
