<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

const content = defineModel<string>("content", { required: true });

const props = defineProps<{
  fileName: string;
  readOnly?: boolean;
}>();

const containerRef = ref<HTMLElement | null>(null);

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let resizeObserver: ResizeObserver | null = null;
let suppressModelSync = false;

(self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (_workerId: string, label: string) => Worker;
  };
}).MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

function detectLanguage(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".rs")) return "rust";
  if (lowerName.endsWith(".ts") || lowerName.endsWith(".tsx")) return "typescript";
  if (lowerName.endsWith(".js") || lowerName.endsWith(".jsx") || lowerName.endsWith(".mjs")) return "javascript";
  if (lowerName.endsWith(".json")) return "json";
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerName.endsWith(".vue")) return "html";
  if (lowerName.endsWith(".css") || lowerName.endsWith(".scss") || lowerName.endsWith(".less")) return "css";
  if (lowerName.endsWith(".md")) return "markdown";
  if (lowerName.endsWith(".xml")) return "xml";
  if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) return "yaml";
  if (lowerName.endsWith(".toml")) return "ini";
  if (lowerName.endsWith(".sh") || lowerName.endsWith(".bash")) return "shell";
  if (lowerName.endsWith(".sql")) return "sql";
  if (lowerName.endsWith(".py")) return "python";
  if (lowerName.endsWith(".java")) return "java";
  if (lowerName.endsWith(".go")) return "go";
  if (lowerName.endsWith(".c")) return "c";
  if (lowerName.endsWith(".cpp") || lowerName.endsWith(".cc") || lowerName.endsWith(".cxx")) return "cpp";
  if (lowerName.endsWith(".h") || lowerName.endsWith(".hpp")) return "cpp";
  if (lowerName.endsWith(".log")) return "plaintext";

  return "plaintext";
}

const language = computed(() => detectLanguage(props.fileName));

watch(content, (nextValue) => {
  if (!model || suppressModelSync || model.getValue() === nextValue) {
    return;
  }

  model.setValue(nextValue);
});

watch(language, (nextLanguage) => {
  if (model) {
    monaco.editor.setModelLanguage(model, nextLanguage);
  }
});

onMounted(() => {
  if (!containerRef.value) {
    return;
  }

  model = monaco.editor.createModel(content.value, language.value);
  editorInstance = monaco.editor.create(containerRef.value, {
    model,
    theme: "vs-dark",
    readOnly: props.readOnly ?? false,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "Consolas, 'Courier New', monospace",
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    roundedSelection: false,
    renderWhitespace: "selection",
    wordWrap: "on",
    smoothScrolling: true,
    tabSize: 2,
    insertSpaces: true,
  });

  model.onDidChangeContent(() => {
    if (!model) {
      return;
    }

    suppressModelSync = true;
    content.value = model.getValue();
    suppressModelSync = false;
  });

  resizeObserver = new ResizeObserver(() => {
    editorInstance?.layout();
  });
  resizeObserver.observe(containerRef.value);

  editorInstance.focus();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  editorInstance?.dispose();
  editorInstance = null;
  model?.dispose();
  model = null;
});
</script>

<template>
  <div ref="containerRef" class="monaco-editor-host"></div>
</template>
