import { describe, expect, it } from 'vitest'
import { buildGeneralForm, buildGeneralSystemConfig, transformGeneralForStore } from '../useGeneralPreference'
import { createDefaultAppConfig } from '@shared/utils/configHydration'

describe('General preference contract', () => {
  it('maps persisted values into the form', () => {
    const form = buildGeneralForm({
      ...createDefaultAppConfig(),
      locale: 'ja',
      theme: 'dark',
      updateChannel: 'beta',
      reduceMotion: true,
      lightweightMode: true,
    })

    expect(form).toMatchObject({
      locale: 'ja',
      theme: 'dark',
      updateChannel: 'beta',
      reduceMotion: true,
      lightweightMode: true,
    })
  })

  it('keeps app-only settings out of the engine config', () => {
    expect(buildGeneralSystemConfig(buildGeneralForm(createDefaultAppConfig()))).toEqual({})
  })

  it('persists the complete form without adding fields', () => {
    const form = buildGeneralForm(createDefaultAppConfig())
    expect(transformGeneralForStore(form)).toEqual(form)
  })
})
