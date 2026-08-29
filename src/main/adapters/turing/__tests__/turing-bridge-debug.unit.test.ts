import { describe, expect, it } from 'vitest'
import { buildOpenWaggleRuntimeDebugValue } from '../turing-openwaggle-bridge'

/**
 * The bridge status node is the persisted answer to "why doesn't the model see
 * my MCP". A run selects every ENABLED server (enabled = used; the '/' command
 * palette is the gate), so selected and enabled normally coincide — but a
 * server that fails to connect or attaches late still makes the two lists
 * diverge, and the status node must record both sides or the question is
 * unanswerable from the run card alone.
 */
describe('buildOpenWaggleRuntimeDebugValue', () => {
  const session = {
    listCapabilities: () => [],
    toolsForCategorizer: () => [],
    mcpServersSelected: ['chrome-devtools'],
  } as const

  it('records the per-run MCP selection next to the enabled list', () => {
    const value = buildOpenWaggleRuntimeDebugValue(session, {
      bridge: {
        enabledMcpNames: ['chrome-devtools', 'playwright'],
        attemptedMcpNames: ['chrome-devtools', 'playwright'],
        connectedMcpIds: ['turing-machine:mcp:chrome-devtools'],
        connectedMcpToolNames: {},
        failedMcpNames: [],
        issues: [],
        skillToolNames: [],
      },
    })
    expect(value.enabledMcpNames).toEqual(['chrome-devtools', 'playwright'])
    expect(value.selectedMcpNames).toEqual(['chrome-devtools'])
  })

  it('reports an empty selection as empty — not undefined, not the enabled list', () => {
    const value = buildOpenWaggleRuntimeDebugValue(
      { ...session, mcpServersSelected: [] },
      { bridge: undefined },
    )
    expect(value.selectedMcpNames).toEqual([])
    expect(value.enabledMcpNames).toEqual([])
  })
})
