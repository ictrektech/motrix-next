class WebDatabase {
  static async load(_name: string): Promise<WebDatabase> {
    return new WebDatabase()
  }

  async execute(_sql: string, _params: unknown[] = []): Promise<{ rowsAffected: number }> {
    return { rowsAffected: 0 }
  }

  async select<T>(_sql: string, _params: unknown[] = []): Promise<T> {
    return [] as T
  }

  async close(): Promise<void> {}
}

export default WebDatabase
