import { describe, expect, it } from 'vitest'
import {
  buildAdvancedForm,
  buildAdvancedSystemConfig,
  generateSecret,
  transformAdvancedForStore,
  validateAdvancedForm,
} from '../useAdvancedPreference'
import { createDefaultAppConfig } from '@shared/utils/configHydration'

const createForm = () => buildAdvancedForm(createDefaultAppConfig()).form

describe('advanced preference contract', () => {
  it('builds the canonical default form', () => {
    const form = createForm()

    expect(form.proxy.mode).toBe('direct')
    expect(form.clipboardSftp).toBe(true)
    expect(form.logLevel).toBe('info')
    expect(form.aria2LogLevel).toBe('info')
  })

  it('maps RPC and proxy settings to engine options', () => {
    const options = buildAdvancedSystemConfig({
      ...createForm(),
      proxy: {
        mode: 'manual',
        server: 'http://127.0.0.1:8080',
        bypass: 'localhost',
        scope: ['download'],
      },
    })

    expect(options).toMatchObject({
      'rpc-listen-port': '29100',
      'all-proxy': 'http://127.0.0.1:8080',
      'no-proxy': 'localhost',
    })
  })

  it('persists clipboard protocol switches as one object', () => {
    const stored = transformAdvancedForStore({ ...createForm(), clipboardSftp: false })

    expect(stored.clipboard).toMatchObject({ sftp: false })
    expect(stored).not.toHaveProperty('clipboardSftp')
  })

  it('rejects unsupported proxy protocols', () => {
    const form = createForm()

    expect(validateAdvancedForm(form)).toBeNull()
    expect(
      validateAdvancedForm({
        ...form,
        proxy: { ...form.proxy, mode: 'manual', server: 'socks5://127.0.0.1:1080' },
      }),
    ).toBe('preferences.proxy-unsupported-protocol')
  })

  it('generates an alphanumeric RPC secret', () => {
    expect(generateSecret()).toMatch(/^[A-Za-z0-9]{16}$/)
  })
})
