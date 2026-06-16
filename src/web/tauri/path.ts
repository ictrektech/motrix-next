import { webDownloadDir } from '../runtime'

export async function downloadDir(): Promise<string> {
  return webDownloadDir()
}

export async function homeDir(): Promise<string> {
  return webDownloadDir()
}

export async function appDataDir(): Promise<string> {
  return '/tmp/motrix-next'
}

export async function appLogDir(): Promise<string> {
  return '/tmp/motrix-next/logs'
}

export async function tempDir(): Promise<string> {
  return '/tmp'
}

export async function join(...parts: string[]): Promise<string> {
  return parts.join('/').replace(/\/+/g, '/')
}
