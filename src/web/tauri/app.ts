import pkg from '../../../package.json'

export async function getVersion(): Promise<string> {
  return pkg.version
}
