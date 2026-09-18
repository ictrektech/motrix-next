/** @fileoverview localStorage-backed implementation of the Rust history commands for web builds.
 *
 * Mirrors src-tauri/src/database/history.rs semantics: upsert-by-GID with
 * immutable added_at, COALESCE(added_at, completed_at) DESC ordering, and the
 * same page-query sort columns, so the frontend store behaves identically.
 */
import type { HistoryRecord } from '@shared/types'

interface WebHistoryState {
  records: HistoryRecord[]
  births: Record<string, string>
  nextId: number
}

const STORAGE_KEY = 'v-burst:web-history'
const MAX_LIMIT = 10_000

function emptyState(): WebHistoryState {
  return { records: [], births: {}, nextId: 1 }
}

let state: WebHistoryState | null = null

function load(): WebHistoryState {
  if (state) return state
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WebHistoryState>
      state = {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        births: parsed.births && typeof parsed.births === 'object' ? parsed.births : {},
        nextId: Number.isFinite(parsed.nextId) ? Number(parsed.nextId) : 1,
      }
      return state
    }
  } catch {
    // Corrupt storage behaves like a fresh database.
  }
  state = emptyState()
  return state
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(load()))
  } catch {
    // Quota/private-mode failures degrade to in-memory history.
  }
}

function sortValue(record: HistoryRecord): number {
  const value = record.added_at ?? record.completed_at ?? ''
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareDesc(a: HistoryRecord, b: HistoryRecord): number {
  return sortValue(b) - sortValue(a) || (b.id ?? 0) - (a.id ?? 0)
}

function mergeMeta(existing: string | undefined, incoming: string | undefined): string | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  try {
    const base = JSON.parse(existing) as Record<string, unknown>
    const patch = JSON.parse(incoming) as Record<string, unknown>
    return JSON.stringify({ ...base, ...patch })
  } catch {
    return incoming
  }
}

/** Upsert by GID; preserves the first added_at and complete-time completed_at. */
export function historyAddRecord(record: HistoryRecord): void {
  const db = load()
  const existing = db.records.find((row) => row.gid === record.gid)
  if (!existing) {
    db.records.push({ ...record, id: record.id ?? db.nextId++ })
  } else {
    existing.name = record.name
    existing.uri = record.uri
    existing.dir = record.dir
    existing.total_length = record.total_length
    existing.status = record.status
    existing.task_type = record.task_type
    existing.added_at = existing.added_at ?? record.added_at
    existing.completed_at =
      existing.status === 'complete' && record.status === 'complete'
        ? (existing.completed_at ?? record.completed_at)
        : record.completed_at
    existing.meta = mergeMeta(existing.meta, record.meta)
  }
  persist()
}

export function historyGetRecords(status?: string | null, limit?: number | null): HistoryRecord[] {
  const db = load()
  const filtered = status ? db.records.filter((row) => row.status === status) : [...db.records]
  filtered.sort(compareDesc)
  const cap = Number.isFinite(limit ?? NaN) ? Math.min(Number(limit), MAX_LIMIT) : MAX_LIMIT
  return filtered.slice(0, cap)
}

export function historyGetRecord(gid: string): HistoryRecord | null {
  return load().records.find((row) => row.gid === gid) ?? null
}

const PAGE_SORT_COLUMNS = new Set(['name', 'status', 'total_length', 'task_type', 'completed_at'])

export function historyGetPage(input: {
  status?: string | null
  page: number
  pageSize: number
  sortField?: string | null
  sortOrder?: string | null
}): { records: HistoryRecord[]; total: number } {
  const db = load()
  const filtered = input.status ? db.records.filter((row) => row.status === input.status) : [...db.records]
  const column = input.sortField && PAGE_SORT_COLUMNS.has(input.sortField) ? input.sortField : 'added'
  const direction = input.sortOrder === 'ascend' ? 1 : -1
  const recordKey =
    column === 'added' ? null : (column as 'name' | 'status' | 'total_length' | 'task_type' | 'completed_at')
  const cell = (row: HistoryRecord): string | number | null =>
    recordKey === null ? (row.added_at ?? row.completed_at ?? null) : (row[recordKey] ?? null)
  filtered.sort((a, b) => {
    const av = cell(a)
    const bv = cell(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction
    const as = String(av ?? '')
    const bs = String(bv ?? '')
    return as.localeCompare(bs) * direction || compareDesc(a, b)
  })
  const size = Math.min(Math.max(Math.trunc(input.pageSize) || 1, 1), 100)
  const offset = (Math.max(Math.trunc(input.page) || 1, 1) - 1) * size
  return { records: filtered.slice(offset, offset + size), total: filtered.length }
}

export function historyRemoveRecord(gid: string): void {
  const db = load()
  db.records = db.records.filter((row) => row.gid !== gid)
  delete db.births[gid]
  persist()
}

export function historyClearRecords(status?: string | null): void {
  const db = load()
  if (status) {
    for (const row of db.records) {
      if (row.status === status) delete db.births[row.gid]
    }
    db.records = db.records.filter((row) => row.status !== status)
  } else {
    db.records = []
    db.births = {}
  }
  persist()
}

export function historyRemoveStaleRecords(gids: string[]): void {
  if (gids.length === 0) return
  const db = load()
  const stale = new Set(gids)
  db.records = db.records.filter((row) => !stale.has(row.gid))
  persist()
}

export function historyRemoveByInfoHash(infoHash: string, excludeGid?: string | null): void {
  if (!infoHash) return
  const db = load()
  db.records = db.records.filter((row) => {
    if (row.gid === excludeGid) return true
    try {
      const meta = row.meta ? (JSON.parse(row.meta) as { infoHash?: string }) : null
      return meta?.infoHash !== infoHash
    } catch {
      return true
    }
  })
  persist()
}

export function historyRecordBirth(gid: string, addedAt: string): void {
  const db = load()
  if (!(gid in db.births)) db.births[gid] = addedAt
  persist()
}

export function historyLoadBirths(): Array<[string, string]> {
  return Object.entries(load().births)
}

export function historyRemoveBirths(gids: string[]): void {
  const db = load()
  for (const gid of gids) delete db.births[gid]
  persist()
}

export function databaseReset(): void {
  state = emptyState()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures; the in-memory reset already took effect.
  }
}
