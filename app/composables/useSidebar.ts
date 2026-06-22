// Shared open/closed state for the app navigation sidebar. On large
// screens the sidebar is always visible (driven by CSS), so this state
// only really controls the off-canvas drawer on small screens: the header
// menu button toggles it, and navigating / tapping the backdrop closes it.
export function useSidebar() {
  const open = useState('app-sidebar-open', () => false)
  const toggle = () => { open.value = !open.value }
  const close = () => { open.value = false }
  return { open, toggle, close }
}
