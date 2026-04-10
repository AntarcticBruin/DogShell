<script setup lang="ts">
import { reactive, watch } from "vue";

const isOpen = defineModel<boolean>("isOpen", { required: true });
const mode = defineModel<string>("mode", { required: true });

defineProps<{
  fileName: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "confirm"): void;
}>();

const permissionRows = [
  { key: "owner", label: "所有者" },
  { key: "group", label: "组" },
  { key: "other", label: "其他" },
] as const;

const permissions = reactive({
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  other: { read: false, write: false, execute: false },
});

let syncingFromMode = false;
let syncingFromCheckboxes = false;

function digitToFlags(digit: number) {
  return {
    read: Boolean(digit & 4),
    write: Boolean(digit & 2),
    execute: Boolean(digit & 1),
  };
}

function flagsToDigit(flags: { read: boolean; write: boolean; execute: boolean }) {
  return (flags.read ? 4 : 0) + (flags.write ? 2 : 0) + (flags.execute ? 1 : 0);
}

function applyModeToCheckboxes(rawMode: string) {
  const normalized = rawMode.trim().replace(/^0/, "").padStart(3, "0").slice(-3);
  const digits = normalized.split("").map((value) => Number.parseInt(value, 10));
  const [owner, group, other] = digits.map((digit) => digitToFlags(Number.isNaN(digit) ? 0 : digit));

  permissions.owner = owner;
  permissions.group = group;
  permissions.other = other;
}

function applyCheckboxesToMode() {
  mode.value = [
    flagsToDigit(permissions.owner),
    flagsToDigit(permissions.group),
    flagsToDigit(permissions.other),
  ].join("");
}

watch(
  mode,
  (nextMode) => {
    if (syncingFromCheckboxes) {
      return;
    }

    if (!/^[0-7]{3,4}$/.test(nextMode.trim())) {
      return;
    }

    syncingFromMode = true;
    applyModeToCheckboxes(nextMode);
    syncingFromMode = false;
  },
  { immediate: true },
);

watch(
  permissions,
  () => {
    if (syncingFromMode) {
      return;
    }

    syncingFromCheckboxes = true;
    applyCheckboxesToMode();
    syncingFromCheckboxes = false;
  },
  { deep: true },
);
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content action-modal">
      <div class="modal-header">
        <div>
          <h3>修改权限</h3>
          <div class="modal-subtitle">{{ fileName }}</div>
        </div>
        <button class="close-modal" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="permission-grid">
          <div class="permission-grid-head">对象</div>
          <div class="permission-grid-head">读取</div>
          <div class="permission-grid-head">写入</div>
          <div class="permission-grid-head">执行</div>

          <template v-for="row in permissionRows" :key="row.key">
            <div class="permission-grid-label">{{ row.label }}</div>
            <label class="permission-check">
              <input v-model="permissions[row.key].read" type="checkbox" />
              <span class="permission-box">r</span>
            </label>
            <label class="permission-check">
              <input v-model="permissions[row.key].write" type="checkbox" />
              <span class="permission-box">w</span>
            </label>
            <label class="permission-check">
              <input v-model="permissions[row.key].execute" type="checkbox" />
              <span class="permission-box">x</span>
            </label>
          </template>
        </div>

        <div class="form-group">
          <label>八进制权限</label>
          <input v-model="mode" placeholder="例如 755" maxlength="4" @keyup.enter="emit('confirm')" />
        </div>
        <div class="confirm-message">可以勾选权限，也可以直接输入三位或四位八进制数字。</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" :disabled="saving" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="saving || !mode.trim()" @click="emit('confirm')">
          {{ saving ? "保存中..." : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>
