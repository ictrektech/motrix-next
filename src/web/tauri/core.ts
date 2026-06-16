import { invokeAria2 } from '../aria2Rpc'

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (command.startsWith('aria2_')) {
    return invokeAria2<T>(command, args)
  }

  switch (command) {
    case 'wait_for_engine':
      return true as T
    case 'start_engine_command':
    case 'refresh_runtime_config':
    case 'save_system_config':
    case 'sync_ed2k_bootstrap_files':
    case 'start_upnp_mapping':
    case 'stop_upnp_mapping':
    case 'cancel_shutdown':
    case 'update_tray_menu_labels':
    case 'update_menu_labels':
    case 'set_dock_visible':
      return undefined as T
    case 'check_path_exists': {
      const path = typeof args.path === 'string' ? args.path : ''
      if (!path) return false as T
      try {
        const response = await fetch(`/api/path-exists?path=${encodeURIComponent(path)}`)
        if (!response.ok) return true as T
        const payload = (await response.json()) as { exists?: boolean }
        return Boolean(payload.exists) as T
      } catch {
        return true as T
      }
    }
    case 'get_ed2k_bootstrap_status':
      return { serverMetModified: null, nodesDatModified: null } as T
    case 'check_for_update':
      return null as T
    case 'is_autostart_launch':
      return false as T
    case 'get_system_proxy':
      return { server: '', bypass: '', isSocks: false } as T
    default:
      return undefined as T
  }
}
