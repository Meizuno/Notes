<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  editable: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const toast = useToast();
const { t } = useI18n();
const editorRef = shallowRef<any>(null);

const handleCreate = ({ editor }: { editor: any }) => {
  editorRef.value = editor;
};

const handleUnmount = () => {
  editorRef.value = null;
};

const handlePaste = async (event: ClipboardEvent) => {
  const editor = editorRef.value;
  if (!props.editable) return;
  if (!editor) return;
  const items = Array.from(event?.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type?.startsWith("image/"));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  event.preventDefault();

  try {
    const dataUrl = await fileToDataUrl(file);

    editor
      .chain()
      .focus()
      .setImage({ src: dataUrl, alt: file.name || "image" })
      .run();
  } catch (error) {
    toast.add({
      title: t("editor.upload_failed"),
      description: t("editor.embed_failed"),
      color: "error",
    });
  }
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
</script>

<template>
  <UEditor
    :model-value="modelValue"
    content-type="markdown"
    :editable="editable"
    :placeholder="t('editor.placeholder')"
    class="w-full"
    :onPaste="handlePaste"
    :onCreate="handleCreate"
    :onUnmount="handleUnmount"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
