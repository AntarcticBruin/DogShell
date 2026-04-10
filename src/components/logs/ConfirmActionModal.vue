<script setup lang="ts">
const isOpen = defineModel<boolean>("isOpen", { required: true });

defineProps<{
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "confirm"): void;
}>();
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content action-modal">
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-modal" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="confirm-message">{{ message }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" :disabled="loading" @click="emit('close')">Cancel</button>
        <button
          class="btn"
          :class="destructive ? 'btn-danger' : 'btn-primary'"
          :disabled="loading"
          @click="emit('confirm')"
        >
          {{ loading ? "Processing..." : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
