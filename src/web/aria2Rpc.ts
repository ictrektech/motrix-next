import { changeKeysToCamelCase } from '@shared/utils'

interface JsonRpcResponse<T> {
  id: string
  result?: T
  error?: { code: number; message: string }
}

type RpcPrimitive = string | number | boolean | null
type RpcParam = RpcPrimitive | RpcParam[] | { [key: string]: RpcParam }

let rpcId = 0

async function rpc<T>(method: string, params: RpcParam[] = []): Promise<T> {
  const id = `web-${++rpcId}`
  const response = await fetch('/jsonrpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })

  if (!response.ok) {
    throw new Error(`aria2 JSON-RPC HTTP ${response.status}`)
  }

  const payload = (await response.json()) as JsonRpcResponse<T>
  if (payload.error) {
    throw new Error(payload.error.message)
  }
  return payload.result as T
}

function camelTask<T>(task: T): T {
  return changeKeysToCamelCase(task as Record<string, unknown>) as T
}

async function multicall<T>(calls: Array<{ methodName: string; params: RpcParam[] }>): Promise<T> {
  return rpc<T>('system.multicall', [calls])
}

export async function invokeAria2<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (command) {
    case 'aria2_get_version':
      return camelTask(await rpc('aria2.getVersion')) as T
    case 'aria2_get_global_option':
      return rpc<T>('aria2.getGlobalOption')
    case 'aria2_get_global_stat':
      return camelTask(await rpc('aria2.getGlobalStat')) as T
    case 'aria2_change_global_option':
      return rpc<T>('aria2.changeGlobalOption', [args.options as Record<string, string>])
    case 'aria2_get_option':
      return rpc<T>('aria2.getOption', [args.gid as string])
    case 'aria2_change_option':
      return rpc<T>('aria2.changeOption', [args.gid as string, args.options as Record<string, string>])
    case 'aria2_get_files': {
      const files = await rpc<unknown[]>('aria2.getFiles', [args.gid as string])
      return files.map((file) => camelTask(file)) as T
    }
    case 'aria2_fetch_active_task_list': {
      const tasks = await rpc<unknown[]>('aria2.tellActive')
      return tasks.map((task) => camelTask(task)) as T
    }
    case 'aria2_fetch_task_list': {
      const type = args.type === 'stopped' ? 'stopped' : 'active'
      const limit = Number(args.limit ?? 1000)
      const tasks =
        type === 'stopped'
          ? await rpc<unknown[]>('aria2.tellStopped', [0, Number.isFinite(limit) ? limit : 1000])
          : [
              ...(await rpc<unknown[]>('aria2.tellActive')),
              ...(await rpc<unknown[]>('aria2.tellWaiting', [0, Number.isFinite(limit) ? limit : 1000])),
            ]
      return tasks.map((task) => camelTask(task)) as T
    }
    case 'aria2_fetch_task_item': {
      return camelTask(await rpc('aria2.tellStatus', [args.gid as string])) as T
    }
    case 'aria2_fetch_task_item_with_peers': {
      const gid = args.gid as string
      const [taskResult, peersResult] = await Promise.allSettled([
        rpc<Record<string, unknown>>('aria2.tellStatus', [gid]),
        rpc<unknown[]>('aria2.getPeers', [gid]),
      ])
      if (taskResult.status === 'rejected') throw taskResult.reason
      const task = camelTask(taskResult.value) as Record<string, unknown>
      task.peers = peersResult.status === 'fulfilled' ? peersResult.value.map((peer) => camelTask(peer)) : []
      return task as T
    }
    case 'aria2_add_uri':
      return rpc<T>('aria2.addUri', [args.uris as string[], args.options as Record<string, string>])
    case 'aria2_add_torrent':
      return rpc<T>('aria2.addTorrent', [args.torrent as string, [], args.options as Record<string, string>])
    case 'aria2_force_remove':
      return rpc<T>('aria2.forceRemove', [args.gid as string])
    case 'aria2_force_pause':
      return rpc<T>('aria2.forcePause', [args.gid as string])
    case 'aria2_pause':
      return rpc<T>('aria2.pause', [args.gid as string])
    case 'aria2_unpause':
      return rpc<T>('aria2.unpause', [args.gid as string])
    case 'aria2_pause_all':
      return rpc<T>('aria2.pauseAll')
    case 'aria2_force_pause_all':
      return rpc<T>('aria2.forcePauseAll')
    case 'aria2_unpause_all':
      return rpc<T>('aria2.unpauseAll')
    case 'aria2_save_session':
      return rpc<T>('aria2.saveSession')
    case 'aria2_remove_download_result':
      return rpc<T>('aria2.removeDownloadResult', [args.gid as string])
    case 'aria2_purge_download_result':
      return rpc<T>('aria2.purgeDownloadResult')
    case 'aria2_batch_unpause':
      return multicall<T>((args.gids as string[]).map((gid) => ({ methodName: 'aria2.unpause', params: [gid] })))
    case 'aria2_batch_force_pause':
      return multicall<T>((args.gids as string[]).map((gid) => ({ methodName: 'aria2.forcePause', params: [gid] })))
    case 'aria2_batch_force_remove':
      return multicall<T>((args.gids as string[]).map((gid) => ({ methodName: 'aria2.forceRemove', params: [gid] })))
    case 'aria2_ed2k_search':
    case 'aria2_get_ed2k_search_results':
    case 'aria2_cleanup_ed2k_search':
      throw new Error('ED2K search is not available in web mode')
    default:
      throw new Error(`Unsupported aria2 command: ${command}`)
  }
}
