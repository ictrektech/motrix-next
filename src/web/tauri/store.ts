interface WebStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  save(): Promise<void>
}

export async function load(name: string): Promise<WebStore> {
  const prefix = `motrix-next:${name}:`
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = localStorage.getItem(prefix + key)
      return raw ? (JSON.parse(raw) as T) : null
    },
    async set<T>(key: string, value: T): Promise<void> {
      localStorage.setItem(prefix + key, JSON.stringify(value))
    },
    async save(): Promise<void> {},
  }
}
