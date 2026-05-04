const PLACEHOLDER_RE = /!\[image]\(base64:#(\d+)\)/g
const FULL_RE = /!\[image]\(data:image\/[^)]+\)/g

function getTextareaEl(ref: Ref<any>): HTMLTextAreaElement | null {
  const comp = ref.value
  if (!comp) return null
  // UTextarea exposes the native element via textareaRef or $el
  return comp.textareaRef ?? comp.$el?.querySelector('textarea') ?? null
}

export function useImagePaste(content: Ref<string>, textareaRef: Ref<any>) {
  const images = ref<Map<number, string>>(new Map())
  let nextId = 0

  function extractImages(raw: string): string {
    return raw.replace(FULL_RE, (match) => {
      const id = nextId++
      const src = match.slice('![image]('.length, -1)
      images.value.set(id, src)
      return `![image](base64:#${id})`
    })
  }

  function restoreImages(display: string): string {
    return display.replace(PLACEHOLDER_RE, (_, idStr) => {
      const src = images.value.get(Number(idStr))
      return src ? `![image](${src})` : `![image](base64:#${idStr})`
    })
  }

  const displayContent = ref(extractImages(content.value))

  watch(content, (val) => {
    const restored = restoreImages(displayContent.value)
    if (val !== restored) {
      displayContent.value = extractImages(val)
    }
  })

  watch(displayContent, (val) => {
    content.value = restoreImages(val)
  })

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue

      e.preventDefault()
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        const id = nextId++
        images.value.set(id, base64)
        const placeholder = `\n![image](base64:#${id})\n`

        const el = getTextareaEl(textareaRef)
        if (el) {
          const start = el.selectionStart
          const end = el.selectionEnd
          displayContent.value = displayContent.value.slice(0, start) + placeholder + displayContent.value.slice(end)
          nextTick(() => {
            const pos = start + placeholder.length
            el.setSelectionRange(pos, pos)
            el.focus()
          })
        } else {
          displayContent.value += placeholder
        }
      }
      reader.readAsDataURL(file)
      return
    }
  }

  // Watch for the textarea to appear (may be behind v-if)
  let currentEl: HTMLTextAreaElement | null = null

  function attach() {
    const el = getTextareaEl(textareaRef)
    if (el === currentEl) return
    if (currentEl) currentEl.removeEventListener('paste', onPaste)
    currentEl = el
    if (el) el.addEventListener('paste', onPaste)
  }

  watch(textareaRef, attach, { flush: 'post' })
  onMounted(() => nextTick(attach))
  onUnmounted(() => {
    if (currentEl) currentEl.removeEventListener('paste', onPaste)
  })

  return { displayContent }
}
