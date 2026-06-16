export async function platform(): Promise<string> {
  return 'linux'
}

export async function arch(): Promise<string> {
  return 'x86_64'
}

export async function version(): Promise<string> {
  return navigator.userAgent
}
