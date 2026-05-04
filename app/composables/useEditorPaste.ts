import type { EditorView } from '@tiptap/pm/view'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useEditorPaste() {
  const editorProps = {
    handlePaste: (_view: EditorView, event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return false

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue

          event.preventDefault()
          fileToBase64(file).then((src) => {
            _view.dispatch(
              _view.state.tr.replaceSelectionWith(
                _view.state.schema.nodes.image.create({ src })
              )
            )
          })
          return true
        }
      }
      return false
    },
    handleDrop: (_view: EditorView, event: DragEvent) => {
      const files = event.dataTransfer?.files
      if (!files?.length) return false

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          event.preventDefault()
          fileToBase64(file).then((src) => {
            const pos = _view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!pos) return
            _view.dispatch(
              _view.state.tr.insert(
                pos.pos,
                _view.state.schema.nodes.image.create({ src })
              )
            )
          })
          return true
        }
      }
      return false
    }
  }

  return { editorProps }
}
