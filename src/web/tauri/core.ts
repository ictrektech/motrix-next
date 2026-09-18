import { invokeAria2 } from '../aria2Rpc'
import {
  databaseReset,
  historyAddRecord,
  historyClearRecords,
  historyGetPage,
  historyGetRecord,
  historyGetRecords,
  historyLoadBirths,
  historyRecordBirth,
  historyRemoveBirths,
  historyRemoveByInfoHash,
  historyRemoveRecord,
  historyRemoveStaleRecords,
} from '../history'

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
    case 'database_initialize':
      return undefined as T
    case 'database_reset':
      databaseReset()
      return undefined as T
    case 'database_schema_version':
      return 3 as T
    case 'history_add_record':
      historyAddRecord(args.record as Parameters<typeof historyAddRecord>[0])
      return undefined as T
    case 'history_get_records':
      return historyGetRecords(
        (args.status as string | null | undefined) ?? null,
        (args.limit as number | null | undefined) ?? null,
      ) as T
    case 'history_get_record':
      return (historyGetRecord(args.gid as string) ?? undefined) as T
    case 'history_get_page':
      return historyGetPage(args.input as Parameters<typeof historyGetPage>[0]) as T
    case 'history_remove_record':
      historyRemoveRecord(args.gid as string)
      return undefined as T
    case 'history_remove_births':
      historyRemoveBirths((args.gids as string[]) ?? [])
      return undefined as T
    case 'history_clear_records':
      historyClearRecords((args.status as string | null | undefined) ?? null)
      return undefined as T
    case 'history_remove_stale':
      historyRemoveStaleRecords((args.gids as string[]) ?? [])
      return undefined as T
    case 'history_remove_by_info_hash':
      historyRemoveByInfoHash(args.infoHash as string, (args.excludeGid as string | null | undefined) ?? null)
      return undefined as T
    case 'history_check_integrity':
      return 'ok' as T
    case 'history_record_birth':
      historyRecordBirth(args.gid as string, args.addedAt as string)
      return undefined as T
    case 'history_load_births':
      return historyLoadBirths() as T
    default:
      return undefined as T
  }
}
