export async function error(message: string): Promise<void> {
  console.error(message)
}

export async function warn(message: string): Promise<void> {
  console.warn(message)
}

export async function info(_message: string): Promise<void> {
  // Keep parity with the production logger policy: info logs are file-only in Tauri.
}

export async function debug(_message: string): Promise<void> {
  // Keep parity with the production logger policy: debug logs are file-only in Tauri.
}
