<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import MonacoEditor from "./MonacoEditor.vue";

const isOpen = defineModel<boolean>("isOpen", { required: true });
const fileName = defineModel<string>("fileName", { required: true });
const filePath = defineModel<string>("filePath", { required: true });
const content = defineModel<string>("content", { required: true });

defineProps<{
  saving: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save"): void;
}>();

const MIN_WIDTH = 640;
const MIN_HEIGHT = 420;
const WINDOW_GAP = 12;

const frame = reactive({
  width: 880,
  height: 760,
  left: 0,
  top: 0,
});

let dragState:
  | {
      offsetX: number;
      offsetY: number;
    }
  | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function syncFrameToViewport() {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - WINDOW_GAP * 2);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - WINDOW_GAP * 2);

  frame.width = clamp(frame.width, MIN_WIDTH, maxWidth);
  frame.height = clamp(frame.height, MIN_HEIGHT, maxHeight);
  frame.left = clamp(frame.left, WINDOW_GAP, Math.max(WINDOW_GAP, window.innerWidth - frame.width - WINDOW_GAP));
  frame.top = clamp(frame.top, WINDOW_GAP, Math.max(WINDOW_GAP, window.innerHeight - frame.height - WINDOW_GAP));
}

function centerFrame() {
  frame.width = Math.min(880, Math.max(MIN_WIDTH, window.innerWidth - 48));
  frame.height = Math.min(760, Math.max(MIN_HEIGHT, window.innerHeight - 48));
  frame.left = Math.max(WINDOW_GAP, Math.round((window.innerWidth - frame.width) / 2));
  frame.top = Math.max(WINDOW_GAP, Math.round((window.innerHeight - frame.height) / 2));
  syncFrameToViewport();
}

function handlePointerMove(event: PointerEvent) {
  if (!dragState) {
    return;
  }

  frame.left = clamp(
    event.clientX - dragState.offsetX,
    WINDOW_GAP,
    Math.max(WINDOW_GAP, window.innerWidth - frame.width - WINDOW_GAP),
  );
  frame.top = clamp(
    event.clientY - dragState.offsetY,
    WINDOW_GAP,
    Math.max(WINDOW_GAP, window.innerHeight - frame.height - WINDOW_GAP),
  );
}

function stopDragging() {
  dragState = null;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopDragging);
}

function startDragging(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, textarea")) {
    return;
  }

  dragState = {
    offsetX: event.clientX - frame.left,
    offsetY: event.clientY - frame.top,
  };
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopDragging);
}

function handleWindowResize() {
  syncFrameToViewport();
}

const frameStyle = computed(() => ({
  width: `${frame.width}px`,
  height: `${frame.height}px`,
  left: `${frame.left}px`,
  top: `${frame.top}px`,
  maxWidth: `calc(100vw - ${WINDOW_GAP * 2}px)`,
  maxHeight: `calc(100vh - ${WINDOW_GAP * 2}px)`,
}));

watch(isOpen, (nextValue) => {
  if (nextValue) {
    centerFrame();
  } else {
    stopDragging();
  }
}, { immediate: true });

watch(
  () => [frame.width, frame.height],
  () => {
    syncFrameToViewport();
  },
);

onMounted(() => {
  window.addEventListener("resize", handleWindowResize);
});

onBeforeUnmount(() => {
  stopDragging();
  window.removeEventListener("resize", handleWindowResize);
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content file-editor-modal draggable-modal" :style="frameStyle">
      <div class="modal-header draggable-modal-header" @pointerdown="startDragging">
        <div>
          <h3>编辑文件</h3>
          <div class="file-editor-path">{{ filePath }}</div>
        </div>
        <button class="close-modal" @click="emit('close')">×</button>
      </div>
      <div class="modal-body file-editor-body">
        <input v-model="fileName" class="file-editor-name" placeholder="文件名" readonly />
        <MonacoEditor v-model:content="content" :file-name="fileName" />
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" :disabled="saving" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="emit('save')">
          {{ saving ? "保存中..." : "保存" }}
        </button>
      </div>
      <div class="file-editor-resize-hint" aria-hidden="true"></div>
    </div>
  </div>
</template>
