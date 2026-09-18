import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const targets = {
  'aarch64-apple-darwin': 'macos-arm64',
  'x86_64-apple-darwin': 'macos-x86_64',
  'aarch64-pc-windows-msvc': 'windows-arm64.exe',
  'x86_64-pc-windows-msvc': 'windows-x86_64.exe',
  'aarch64-unknown-linux-gnu': 'linux-aarch64',
  'x86_64-unknown-linux-gnu': 'linux-x86_64',
}

export function verifyChecksum(bytes, checksums, asset) {
  const entries = checksums
    .split(/\r?\n/)
    .map((line) => /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line))
    .filter((entry) => entry?.[2] === asset)
  if (entries.length !== 1) throw new Error(`Expected one checksum for ${asset}`)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== entries[0][1].toLowerCase()) throw new Error(`Checksum mismatch for ${asset}`)
}

function prepareEngine(version, target) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('A stable engine version is required')
  if (!Object.hasOwn(targets, target)) throw new Error(`Unsupported engine target: ${target}`)
  const asset = `aria2-next-${version}-${targets[target]}`
  const checksums = `aria2-next-${version}-checksums.sha256`
  const temporary = mkdtempSync(join(tmpdir(), 'engine-release-'))
  try {
    execFileSync(
      'gh',
      [
        'release',
        'download',
        `v${version}`,
        '--repo',
        'AnInsomniacy/aria2-next',
        '--pattern',
        asset,
        '--pattern',
        checksums,
        '--dir',
        temporary,
      ],
      { stdio: 'inherit' },
    )
    const source = join(temporary, asset)
    verifyChecksum(readFileSync(source), readFileSync(join(temporary, checksums), 'utf8'), asset)
    const binaries = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'binaries')
    const suffix = target.includes('windows') ? '.exe' : ''
    const destination = join(binaries, `aria2-next-${target}${suffix}`)
    mkdirSync(binaries, { recursive: true })
    copyFileSync(source, destination)
    if (!suffix) chmodSync(destination, 0o755)
    console.log(`Prepared ${asset} for ${target}`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareEngine(process.argv[2], process.argv[3])
}
