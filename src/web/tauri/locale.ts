export async function getLocale(): Promise<string> {
  return navigator.language || 'en-US'
}
