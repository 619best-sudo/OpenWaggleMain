import { describe, expect, it } from 'vitest'
import { blankConfig } from '../default-config-editors'
import { createHarness } from './pi-waggle-command-harness'

function configWithThirdAgentJson() {
  const config = blankConfig()
  return JSON.stringify({
    ...config,
    agents: [...config.agents, { ...config.agents[0], label: 'Mediator' }],
  })
}

describe('pi-waggle multi-agent config', () => {
  it('accepts a third agent entered through advanced active config JSON', async () => {
    const harness = createHarness({
      selectResponses: ['Advanced JSON…'],
      editorResponses: [configWithThirdAgentJson()],
    })

    await harness.waggleCommand.handler('config', harness.ctx)

    expect(harness.appendedEntries).toHaveLength(1)
    expect(harness.ctx.ui.notify).toHaveBeenCalledWith(
      'Updated Waggle configuration for the current branch.',
      'info',
    )
  })
})
