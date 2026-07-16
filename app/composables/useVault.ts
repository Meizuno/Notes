// The vault's two read views — the sidebar folder tree (`sidebar-tree`) and
// the home force-graph (`graph`) — are SSR-keyed and cached across SPA
// navigation, so a note write won't show up (or a deleted note lingers) until
// their data is refetched. Call refreshVault() after any create/update/delete.
export function useVault() {
  const VAULT_KEYS = ['sidebar-tree', 'graph']
  const refreshVault = () => refreshNuxtData(VAULT_KEYS)
  return { refreshVault }
}
