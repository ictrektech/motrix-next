export function getCurrentWindow() {
  return {
    async show(): Promise<void> {},
    async hide(): Promise<void> {},
    async close(): Promise<void> {},
    async minimize(): Promise<void> {},
    async maximize(): Promise<void> {},
    async unmaximize(): Promise<void> {},
    async toggleMaximize(): Promise<void> {},
    async isMaximized(): Promise<boolean> {
      return false
    },
    async setTitle(_title: string): Promise<void> {},
    async onFocusChanged(_handler: (event: { payload: boolean }) => void): Promise<() => void> {
      return () => {}
    },
  }
}
