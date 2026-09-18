import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { verifyChecksum } from './prepare-engine.mjs'

const asset = 'aria2-next-2.8.0-windows-x86_64.exe'
const bytes = Buffer.from('release fixture')
const digest = createHash('sha256').update(bytes).digest('hex')

test('accepts the published checksum for the selected asset', () => {
  verifyChecksum(bytes, `${digest}  ${asset}\n`, asset)
  verifyChecksum(bytes, `${digest.toUpperCase()} *${asset}\r\n`, asset)
})

test('rejects corrupted bytes and checksums for a different platform', () => {
  assert.throws(() => verifyChecksum(Buffer.from('corrupt'), `${digest}  ${asset}`, asset), /mismatch/)
  assert.throws(() => verifyChecksum(bytes, `${digest}  aria2-next-2.8.0-linux-x86_64`, asset), /one checksum/)
})

test('rejects missing, malformed and ambiguous checksums', () => {
  for (const checksums of ['', `invalid  ${asset}`, `${digest}  ${asset}\n${digest}  ${asset}`]) {
    assert.throws(() => verifyChecksum(bytes, checksums, asset), /one checksum/)
  }
})
