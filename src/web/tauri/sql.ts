type Row = Record<string, unknown>

interface WebSqlState {
  download_history: Row[]
  task_birth: Row[]
}

const STORAGE_KEY = 'motrix-next:web-sql:history'

function emptyState(): WebSqlState {
  return { download_history: [], task_birth: [] }
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function readState(): WebSqlState {
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return emptyState()
  try {
    const parsed = JSON.parse(raw) as Partial<WebSqlState>
    return {
      download_history: Array.isArray(parsed.download_history) ? parsed.download_history : [],
      task_birth: Array.isArray(parsed.task_birth) ? parsed.task_birth : [],
    }
  } catch {
    return emptyState()
  }
}

function writeState(state: WebSqlState): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(state))
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function compareNullableDateDesc(a: Row, b: Row): number {
  const av = Date.parse(asString(a.added_at || a.completed_at))
  const bv = Date.parse(asString(b.added_at || b.completed_at))
  return (Number.isFinite(bv) ? bv : 0) - (Number.isFinite(av) ? av : 0)
}

function sortHistory(rows: Row[], sql: string): Row[] {
  const copy = [...rows]
  const match = sql.match(/ORDER BY ([a-z_]+) (ASC|DESC)/i)
  if (!match) return copy.sort(compareNullableDateDesc)

  const [, column, direction] = match
  copy.sort((a, b) => {
    const av = a[column]
    const bv = b[column]
    const an = typeof av === 'number' ? av : Number(av)
    const bn = typeof bv === 'number' ? bv : Number(bv)
    let result: number
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      result = an - bn
    } else {
      result = asString(av).localeCompare(asString(bv))
    }
    if (result === 0) result = compareNullableDateDesc(a, b)
    return direction.toUpperCase() === 'DESC' ? -result : result
  })
  return copy
}

function applyLimit(rows: Row[], sql: string): Row[] {
  const limitMatch = sql.match(/LIMIT (\d+)(?: OFFSET (\d+))?/i)
  if (!limitMatch) return rows
  const limit = Number(limitMatch[1])
  const offset = Number(limitMatch[2] ?? 0)
  return rows.slice(offset, offset + limit)
}

function parseMetaInfoHash(row: Row): string {
  try {
    const meta = row.meta ? JSON.parse(asString(row.meta)) : {}
    return asString(meta.infoHash)
  } catch {
    return ''
  }
}

class WebDatabase {
  static async load(_name: string): Promise<WebDatabase> {
    return new WebDatabase()
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    const normalized = normalizeSql(sql)
    const state = readState()

    if (normalized.startsWith('PRAGMA') || normalized === 'VACUUM') {
      return { rowsAffected: 0 }
    }

    if (normalized.startsWith('INSERT INTO download_history')) {
      const [
        gid,
        name,
        uri,
        dir,
        total_length,
        status,
        task_type,
        added_at,
        completed_at,
        meta,
      ] = params
      const existing = state.download_history.find((row) => row.gid === gid)
      const next: Row = {
        gid,
        name,
        uri,
        dir,
        total_length,
        status,
        task_type,
        added_at: existing?.added_at || added_at,
        completed_at,
        meta,
      }
      if (existing) Object.assign(existing, next)
      else state.download_history.push(next)
      writeState(state)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('INSERT OR IGNORE INTO task_birth')) {
      const [gid, added_at] = params
      if (!state.task_birth.some((row) => row.gid === gid)) {
        state.task_birth.push({ gid, added_at })
        writeState(state)
        return { rowsAffected: 1 }
      }
      return { rowsAffected: 0 }
    }

    if (normalized.startsWith('DELETE FROM download_history WHERE json_extract')) {
      const [infoHash, excludeGid] = params
      const before = state.download_history.length
      state.download_history = state.download_history.filter((row) => {
        if (parseMetaInfoHash(row) !== infoHash) return true
        return excludeGid != null && row.gid === excludeGid
      })
      writeState(state)
      return { rowsAffected: before - state.download_history.length }
    }

    if (normalized.startsWith('DELETE FROM download_history WHERE gid IN')) {
      const gids = new Set(params)
      const before = state.download_history.length
      state.download_history = state.download_history.filter((row) => !gids.has(row.gid))
      writeState(state)
      return { rowsAffected: before - state.download_history.length }
    }

    if (normalized.startsWith('DELETE FROM task_birth WHERE gid IN')) {
      const gids = new Set(params)
      const before = state.task_birth.length
      state.task_birth = state.task_birth.filter((row) => !gids.has(row.gid))
      writeState(state)
      return { rowsAffected: before - state.task_birth.length }
    }

    if (normalized.startsWith('DELETE FROM download_history WHERE gid =')) {
      const [gid] = params
      const before = state.download_history.length
      state.download_history = state.download_history.filter((row) => row.gid !== gid)
      writeState(state)
      return { rowsAffected: before - state.download_history.length }
    }

    if (normalized.startsWith('DELETE FROM download_history WHERE status =')) {
      const [status] = params
      const before = state.download_history.length
      state.download_history = state.download_history.filter((row) => row.status !== status)
      writeState(state)
      return { rowsAffected: before - state.download_history.length }
    }

    if (normalized === 'DELETE FROM download_history') {
      const rowsAffected = state.download_history.length
      state.download_history = []
      writeState(state)
      return { rowsAffected }
    }

    return { rowsAffected: 0 }
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    const normalized = normalizeSql(sql)
    const state = readState()

    if (normalized === 'PRAGMA integrity_check') {
      return [{ integrity_check: 'ok' }] as T
    }

    if (normalized.startsWith('SELECT MAX(version) as version FROM _sqlx_migrations')) {
      return [{ version: 1 }] as T
    }

    if (normalized === 'SELECT gid, added_at FROM task_birth') {
      return [...state.task_birth] as T
    }

    if (normalized.startsWith('SELECT COUNT(*) as count FROM download_history WHERE status =')) {
      const [status] = params
      return [{ count: state.download_history.filter((row) => row.status === status).length }] as T
    }

    if (normalized.startsWith('SELECT COUNT(*) as count FROM download_history')) {
      return [{ count: state.download_history.length }] as T
    }

    if (normalized.startsWith('SELECT * FROM download_history WHERE gid =')) {
      const [gid] = params
      return state.download_history.filter((row) => row.gid === gid).slice(0, 1) as T
    }

    if (normalized.startsWith('SELECT * FROM download_history WHERE status =')) {
      const [status] = params
      const rows = state.download_history.filter((row) => row.status === status)
      return applyLimit(sortHistory(rows, normalized), normalized) as T
    }

    if (normalized.startsWith('SELECT * FROM download_history')) {
      return applyLimit(sortHistory(state.download_history, normalized), normalized) as T
    }

    return [] as T
  }

  async close(): Promise<void> {}
}

export default WebDatabase
