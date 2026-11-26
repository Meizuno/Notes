import { ref } from "vue";
import { useRouter } from "vue-router";

import { api } from "../lib/api";
import type { Note } from "../lib/types";
import { useConfirm } from "./useConfirm";
import { useNoteForm } from "./useNoteForm";
import { useVault } from "./useVault";

// Client-side use-case for editing a single note. Holds the edit-specific
// concerns (view-mode toggle, delete-with-confirm) and drives the shared form
// state (useNoteForm) + the typed API (lib/api).
//
// The note is NOT fetched for viewing — the page renders it from its own
// fetch. We only fetch on startEdit, to populate the form.
export function useNoteEditor(id: string) {
  const { title, folder, description, content, visibility, isShared, populate, toUpdateInput } = useNoteForm();
  const { confirm } = useConfirm();
  const { refreshVault } = useVault();
  const router = useRouter();

  const editing = ref(false);
  const saving = ref(false);
  const loadingEdit = ref(false);

  async function startEdit() {
    if (loadingEdit.value) return;
    loadingEdit.value = true;
    try {
      populate(await api.getNote(id));
      editing.value = true;
    } finally {
      loadingEdit.value = false;
    }
  }

  // Returns the saved note so the page can refresh its view synchronously
  // (fresh content / updated_at / is_shared) without a second fetch.
  async function saveEdit(): Promise<Note | undefined> {
    if (!title.value.trim() || saving.value) return;
    saving.value = true;
    try {
      const updated = await api.updateNote(id, toUpdateInput());
      editing.value = false;
      // Title / folder / visibility may have changed — refresh the vault views.
      await refreshVault();
      return updated;
    } finally {
      saving.value = false;
    }
  }

  async function deleteNote() {
    const ok = await confirm({
      title: "Delete note?",
      description: "This note will be removed. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await api.deleteNote(id);
    // Drop the note from the cached sidebar tree + home graph before leaving.
    await refreshVault();
    await router.push("/");
  }

  return {
    editing,
    title,
    folder,
    description,
    content,
    visibility,
    isShared,
    saving,
    loadingEdit,
    startEdit,
    saveEdit,
    deleteNote,
  };
}
