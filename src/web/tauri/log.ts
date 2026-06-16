export async function error(message: string): Promise<void> {
  console.error(message)
}

export async function warn(message: string): Promise<void> {
  console.warn(message)
}

export async function info(message: string): Promise<void> {
  console.info(message)
}

export async function debug(message: string): Promise<void> {
  console.debug(message)
}
