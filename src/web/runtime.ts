export const isWebApp = import.meta.env.VITE_WEB_APP === 'true'

export function webDownloadDir(): string {
  return '/downloads'
}
