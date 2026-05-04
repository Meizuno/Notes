// Promise-based confirmation dialog. The single `<ConfirmDialog />`
// instance mounted in `app.vue` listens to a module-level reactive
// state and resolves the open promise when the user picks an action
// (or dismisses via ESC / backdrop).
//
// Module-level state is fine here: this is client-only — `confirm()`
// is only ever called from event handlers, never during SSR.

type ConfirmOpts = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'success'
}

type ConfirmState = {
  open: boolean
  opts: ConfirmOpts | null
  resolver: ((value: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  open: false,
  opts: null,
  resolver: null
})

function settle(value: boolean) {
  const r = state.resolver
  state.resolver = null
  state.open = false
  r?.(value)
}

export function useConfirm() {
  function confirm(opts: ConfirmOpts): Promise<boolean> {
    // If a previous confirm is still hanging, resolve it as cancelled
    // before opening a new one.
    if (state.resolver) settle(false)
    state.opts = opts
    state.open = true
    return new Promise<boolean>((resolve) => {
      state.resolver = resolve
    })
  }

  return { confirm, _state: state, _settle: settle }
}
