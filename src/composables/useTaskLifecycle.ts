/** @fileoverview Pure utilities for persisted task reconstruction.
 *
 * Restores history records into task models and supports cleanup logic.
 */
import type { Aria2Task, Aria2File, HistoryRecord, HistoryMeta } from '@shared/types'
import { normalizeSep } from '@shared/utils/autoArchive'
import {
  collectTaskIdentityBuckets,
  getTaskDisplayName,
  getTaskSharingTime,
  getTaskUri,
  isBtMetadataTask,
} from '@shared/utils/task'
import { logger } from '@shared/logger'

/** Detect magnet tasks that are still resolving BitTorrent metadata. */
export function isMetadataTask(task: Aria2Task): boolean {
  return isBtMetadataTask(task)
}

// ── Centralized history snapshot helpers ────────────────────────────
// All meta read/write MUST go through these functions. Never JSON.parse
// HistoryRecord.meta directly in consumer code.

/** Parse structured meta from a persisted history record (read path).
 *  Never throws — returns empty object on corrupt/missing meta. */
export function parseHistoryMeta(record: HistoryRecord): HistoryMeta {
  if (!record.meta) return {}
  try {
    return JSON.parse(record.meta) as HistoryMeta
  } catch {
    return {}
  }
}

/** Extract all expected file paths from a history record.
 *
 * Used by stale cleanup to check whether downloaded files still exist.
 * Multi-file records return all paths; legacy single-file records return
 * a single synthetic path from dir + name. */
export function extractHistoryFilePaths(record: HistoryRecord): string[] {
  const meta = parseHistoryMeta(record)
  if (meta.files && meta.files.length > 0) {
    return meta.files.map((f) => f.path).filter(Boolean)
  }
  // Legacy fallback: single file path from dir + name
  if (record.dir && record.name) {
    const dir = record.dir.replace(/[\\/]+$/, '')
    return [`${dir}/${record.name}`]
  }
  return []
}

/** Determine if stale record cleanup should run based on user config. */
export function shouldRunStaleCleanup(config: Partial<{ autoDeleteStaleRecords: boolean }> | undefined): boolean {
  return config?.autoDeleteStaleRecords === true
}

/** Reconstruct an Aria2Task from a persisted HistoryRecord.
 *
 * Synthesizes the `files[]` and optional `bittorrent` fields so TaskItem can
 * render persisted records through the same paths as live aria2 tasks.
 *
 * Fields not available in the DB (downloadSpeed, connections, etc.) are
 * zero-filled, which is correct for stopped/completed tasks. */
export function historyRecordToTask(record: HistoryRecord): Aria2Task {
  const dir = record.dir ?? ''
  const totalLength = String(record.total_length ?? 0)
  const completedLength = record.status === 'complete' ? totalLength : '0'

  // Centralised meta parsing — never JSON.parse directly.
  const meta = parseHistoryMeta(record)

  // Build files array: prefer multi-file snapshot from meta.files,
  // fall back to a single-file synthesis when no snapshot is available.
  let files: Aria2File[]
  if (meta.files && meta.files.length > 0) {
    // Full restoration from snapshot — preserves all paths, lengths, and mirror URIs.
    files = meta.files.map((f, i) => ({
      index: String(i + 1),
      path: f.path,
      length: f.length ?? '0',
      completedLength: record.status === 'complete' ? (f.length ?? '0') : '0',
      selected: f.selected ?? 'true',
      uris: f.uris.map((uri) => ({ uri, status: 'used' as const })),
    }))
  } else {
    // Single-file fallback — path is dir + separator + name.
    // dir may end with `\\` (Windows) or `/` (Unix); avoid double separators.
    const filePath = dir && record.name ? `${dir.replace(/[\\/]+$/, '')}/${record.name}` : record.name
    const uris = record.uri ? [{ uri: record.uri, status: 'used' as const }] : []
    files = [{ index: '1', path: filePath, length: totalLength, completedLength, selected: 'true', uris }]
  }

  const task: Aria2Task = {
    gid: record.gid,
    status: record.status as Aria2Task['status'],
    totalLength,
    completedLength,
    uploadLength: '0',
    downloadSpeed: '0',
    uploadSpeed: '0',
    connections: '0',
    dir,
    files,
  }

  // BT tasks get a bittorrent.info stub so getTaskName() resolves correctly
  if (record.task_type === 'bt') {
    task.bittorrent = { info: { name: record.name } }
    if (meta.magnetLink) {
      task.bittorrent.magnetLink = meta.magnetLink
    }
    if (meta.announceList && meta.announceList.length > 0) {
      task.bittorrent.announceList = meta.announceList.map((tier) => [...tier])
    }
    if (meta.sharingTime) {
      task.bittorrent.finishedTime = meta.sharingTime
    }
  }

  if (record.task_type === 'ed2k') {
    task.ed2k = {
      name: record.name,
      length: totalLength,
    }
    if (meta.ed2kLink) {
      task.ed2k.ed2kLink = meta.ed2kLink
    }
    if (meta.ed2kHash) {
      task.ed2k.hash = meta.ed2kHash
    }
    if (meta.sharingTime) {
      task.ed2k.sharingTime = meta.sharingTime
    }
  }

  // Restore infoHash from meta — essential for magnet link reconstruction
  if (meta.infoHash) {
    task.infoHash = meta.infoHash
  }

  return task
}

export function buildHistoryRecord(task: Aria2Task): HistoryRecord {
  const name = getTaskDisplayName(task, { defaultName: task.gid })
  const firstFile = task.files?.[0]
  const meta: HistoryMeta = {}

  if (task.infoHash) meta.infoHash = task.infoHash
  if (task.bittorrent?.magnetLink) meta.magnetLink = task.bittorrent.magnetLink
  if (task.bittorrent?.announceList?.length) meta.announceList = task.bittorrent.announceList
  if (task.ed2k?.ed2kLink) meta.ed2kLink = task.ed2k.ed2kLink
  if (task.ed2k?.hash) meta.ed2kHash = task.ed2k.hash

  const sharingTime = getTaskSharingTime(task)
  if (sharingTime > 0) meta.sharingTime = String(sharingTime)

  if (task.files?.length) {
    meta.files = task.files.map((file) => ({
      path: file.path,
      length: file.length,
      selected: file.selected,
      uris: (file.uris ?? []).map((entry) => entry.uri).filter(Boolean),
    }))
  }

  const now = new Date().toISOString()
  const record: HistoryRecord = {
    gid: task.gid,
    name,
    total_length: Number(task.totalLength) || 0,
    status: task.status,
    task_type: task.bittorrent ? 'bt' : task.ed2k ? 'ed2k' : 'uri',
    added_at: now,
    completed_at: now,
  }
  const uri = getTaskUri(task, true) || firstFile?.uris?.[0]?.uri
  if (uri) record.uri = uri
  if (task.dir) record.dir = task.dir
  if (Object.keys(meta).length > 0) record.meta = JSON.stringify(meta)
  return record
}

/** Merge live aria2 tasks with persisted history records.
 *
 * Deduplicates by GID and stable protocol identities. Live engine data wins.
 *
 * Aria2 live data always takes priority. History-only records (from
 * previous sessions) are appended after the live data. */
export function mergeHistoryIntoTasks(aria2Tasks: Aria2Task[], historyRecords: HistoryRecord[]): Aria2Task[] {
  if (historyRecords.length === 0) return aria2Tasks

  // ── Post-archive path correction ────────────────────────────────
  // After auto-archive moves a file, aria2's DownloadResult snapshot
  // still reports the original dir (aria2 RPC has no mechanism to
  // update stopped tasks — DownloadResult is immutable, see aria2
  // DownloadResult.h).  The history DB stores the corrected dir from
  // updateHistoryFilePath().  Patch aria2's stale paths here so that
  // resolveTaskFilePath / check_path_exists see the archived location
  // after WebView recreation (lightweight mode) or window re-open.
  const recordByGid = new Map<string, HistoryRecord>()
  for (const r of historyRecords) recordByGid.set(r.gid, r)

  const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'waiting', 'paused'])
  for (const task of aria2Tasks) {
    if (LIVE_STATUSES.has(task.status)) continue
    const dbRecord = recordByGid.get(task.gid)
    if (!dbRecord?.dir) continue
    if (normalizeSep(dbRecord.dir) === normalizeSep(task.dir ?? '')) continue

    // Patch dir — the DB value reflects the post-archive directory.
    task.dir = dbRecord.dir

    // Patch files[].path from the DB meta snapshot when available
    // (multi-file or mirror tasks store individual file paths).
    const meta = parseHistoryMeta(dbRecord)
    if (meta.files && task.files) {
      for (let i = 0; i < task.files.length && i < meta.files.length; i++) {
        if (meta.files[i].path) task.files[i].path = meta.files[i].path
      }
    } else if (task.files?.[0] && dbRecord.name) {
      // Single-file fallback: reconstruct from corrected dir + name.
      task.files[0].path = `${dbRecord.dir}/${dbRecord.name}`
    }
  }

  const identities = collectTaskIdentityBuckets(aria2Tasks.filter((task) => !isMetadataTask(task)))
  const seenGids = new Set(identities.gids)
  const seenInfoHashes = new Set(identities.btInfoHashes)
  const seenEd2kHashes = new Set(identities.ed2kHashes)
  const seenEd2kLinks = new Set(identities.ed2kLinks)

  const historyOnly = historyRecords.filter((r) => {
    // Same-session: GID match → aria2 data wins
    if (seenGids.has(r.gid)) return false
    const meta = parseHistoryMeta(r)
    if (meta.infoHash && seenInfoHashes.has(meta.infoHash)) return false
    if (meta.ed2kHash && seenEd2kHashes.has(meta.ed2kHash)) return false
    if (meta.ed2kLink && seenEd2kLinks.has(meta.ed2kLink)) return false
    return true
  })

  return [...aria2Tasks, ...historyOnly.map(historyRecordToTask)]
}

// ── Post-archive history path update ────────────────────────────────

/** Minimal history store interface needed by updateHistoryFilePath.
 *  Avoids coupling to the full Pinia store type. */
interface HistoryStoreSubset {
  getRecordByGid: (gid: string) => Promise<HistoryRecord | null>
  addRecord: (record: HistoryRecord) => Promise<void>
}

/**
 * Update a history record's file paths after auto-archive moves the file.
 *
 * Handles two record flavours:
 * - **Multi-file / mirror** records (meta.files present): patches matching
 *   `files[].path` entries in the JSON snapshot.
 * - **Single-file** records (no meta.files): updates `record.dir` to the
 *   archive directory so `historyRecordToTask()` synthesizes the correct
 *   `dir/name` path.
 *
 * Uses the existing `addRecord` upsert — no new SQL needed.
 */
export async function updateHistoryFilePath(
  store: HistoryStoreSubset,
  gid: string,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const record = await store.getRecordByGid(gid)
  if (!record) return

  const meta = parseHistoryMeta(record)
  let changed = false
  const normalizedOld = normalizeSep(oldPath)

  // Patch meta.files snapshot — used by multi-file and mirror tasks
  if (meta.files && meta.files.length > 0) {
    for (const f of meta.files) {
      if (normalizeSep(f.path) === normalizedOld) {
        f.path = newPath
        changed = true
      }
    }
  }

  // Update dir to the archive directory (parent of newPath).
  // historyRecordToTask() uses dir+name for single-file fallback.
  const lastSlash = newPath.lastIndexOf('/')
  if (lastSlash > 0) {
    const newDir = newPath.substring(0, lastSlash)
    if (record.dir !== newDir) {
      record.dir = newDir
      changed = true
    }
  }

  if (!changed) return

  record.meta = Object.keys(meta).length > 0 ? JSON.stringify(meta) : undefined
  await store.addRecord(record)
  logger.debug('AutoArchive.historyUpdated', `gid=${gid} dir=${record.dir}`)
}
