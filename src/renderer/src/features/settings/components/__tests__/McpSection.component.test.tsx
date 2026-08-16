import { MCP_ADAPTER_PACKAGE_SOURCE } from '@shared/constants/mcp'
import type { McpSettingsView } from '@shared/types/mcp'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getMcpSettingsMock,
  setMcpAdapterEnabledMock,
  setMcpServerEnabledMock,
  writeMcpSourceConfigMock,
  showConfirmMock,
} = vi.hoisted(() => ({
  getMcpSettingsMock: vi.fn(),
  setMcpAdapterEnabledMock: vi.fn(),
  setMcpServerEnabledMock: vi.fn(),
  writeMcpSourceConfigMock: vi.fn(),
  showConfirmMock: vi.fn(),
}))

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    getMcpSettings: getMcpSettingsMock,
    setMcpAdapterEnabled: setMcpAdapterEnabledMock,
    setMcpServerEnabled: setMcpServerEnabledMock,
    writeMcpSourceConfig: writeMcpSourceConfigMock,
    showConfirm: showConfirmMock,
  },
})

const { McpSection } = await import('../sections/McpSection')
const { usePreferencesStore } = await import('@/features/settings/state/preferences-store')
const { useUIStore } = await import('@/shell/ui-store')

const PROJECT_PATH = '/tmp/openwaggle-project'

const MCP_VIEW = {
  adapter: {
    enabled: true,
    packageSource: MCP_ADAPTER_PACKAGE_SOURCE,
    runtimeConfigPath: '/tmp/pi-agent/turing-machine-mcp/project/mcp.json',
  },
  sources: [
    {
      id: 'global-standard',
      label: 'Global standard MCP',
      path: '/Users/test/.config/mcp/mcp.json',
      scope: 'global',
      kind: 'standard',
      exists: false,
      editable: true,
      serverCount: 0,
      disabledServerCount: 0,
      rawJson: '{\n  "mcpServers": {}\n}\n',
    },
    {
      id: 'project-standard',
      label: 'Project standard MCP',
      path: `${PROJECT_PATH}/.mcp.json`,
      scope: 'project',
      kind: 'standard',
      exists: true,
      editable: true,
      serverCount: 1,
      disabledServerCount: 0,
      rawJson: '{\n  "mcpServers": {\n    "playwright": { "command": "npx" }\n  }\n}\n',
    },
    {
      id: 'project-turing-machine',
      label: 'Project Turing Machine MCP',
      path: `${PROJECT_PATH}/.turing-machine/agent/mcp.json`,
      scope: 'project',
      kind: 'turing-machine',
      exists: true,
      editable: true,
      serverCount: 1,
      disabledServerCount: 0,
      rawJson: '{\n  "mcpServers": {\n    "alpha": { "command": "alpha" }\n  }\n}\n',
    },
  ],
  effective: {
    mcpServers: {
      playwright: { command: 'npx' },
      alpha: { command: 'alpha' },
    },
    disabledMcpServers: {},
    settings: {},
    imports: [],
  },
  servers: [
    {
      name: 'alpha',
      enabled: true,
      sourceId: 'project-turing-machine',
      sourceLabel: 'Project Turing Machine MCP',
      sourcePath: `${PROJECT_PATH}/.turing-machine/agent/mcp.json`,
      command: 'alpha',
      transport: 'stdio',
      directTools: 'inherited',
    },
  ],
  runtimeConfigPath: '/tmp/pi-agent/turing-machine-mcp/project/mcp.json',
} satisfies McpSettingsView

function sourceAt(index: number) {
  const source = MCP_VIEW.sources[index]
  if (!source) {
    throw new Error(`Expected MCP view source at index ${String(index)}`)
  }
  return source
}

describe('McpSection', () => {
  beforeEach(() => {
    getMcpSettingsMock.mockReset()
    setMcpAdapterEnabledMock.mockReset()
    setMcpServerEnabledMock.mockReset()
    writeMcpSourceConfigMock.mockReset()
    showConfirmMock.mockReset()
    getMcpSettingsMock.mockResolvedValue(MCP_VIEW)
    setMcpAdapterEnabledMock.mockResolvedValue({
      ...MCP_VIEW,
      adapter: { ...MCP_VIEW.adapter, enabled: false },
    } satisfies McpSettingsView)
    setMcpServerEnabledMock.mockResolvedValue(MCP_VIEW)
    writeMcpSourceConfigMock.mockResolvedValue(MCP_VIEW)
    useUIStore.getState().clearToast()

    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      settings: {
        ...DEFAULT_SETTINGS,
        projectPath: PROJECT_PATH,
      },
      isLoaded: true,
      loadError: null,
    })
  })

  it('opens the advanced MCP configuration dialog', async () => {
    render(<McpSection />)

    expect(await screen.findByText('MCP Connection')).toBeInTheDocument()
    expect(screen.getByText('Connected Servers')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByRole('dialog', { name: 'Advanced Configuration' })).toBeInTheDocument()
  })

  it('toggles only the effective source entry for a server', async () => {
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('switch', { name: 'Disable alpha' }))

    await waitFor(() => {
      expect(setMcpServerEnabledMock).toHaveBeenCalledWith({
        projectPath: PROJECT_PATH,
        sourceId: 'project-turing-machine',
        serverName: 'alpha',
        enabled: false,
      })
    })
  })

  it('writes raw JSON to the selected edit target', async () => {
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))

    // Select the project standard source
    const sourceSelect = screen.getByRole('combobox', { name: /Edit/i })
    fireEvent.change(sourceSelect, { target: { value: 'project-standard' } })

    const textboxes = screen.getAllByRole('textbox')
    const editor = textboxes[textboxes.length - 1]
    if (!editor) {
      throw new Error('Expected MCP JSON editor textarea')
    }
    fireEvent.change(editor, {
      target: { value: '{\n  "mcpServers": {}\n}\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save JSON' }))

    await waitFor(() => {
      expect(writeMcpSourceConfigMock).toHaveBeenCalledWith({
        projectPath: PROJECT_PATH,
        sourceId: 'project-standard',
        rawJson: '{\n  "mcpServers": {}\n}\n',
      })
    })

    expect(useUIStore.getState().toastData).toMatchObject({
      message: 'MCP JSON saved.',
      variant: 'success',
    })
  })

  it('quick-adds a stdio server into the selected MCP source', async () => {
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add Server' }))

    const sourceSelect = screen.getByRole('combobox', { name: /Install for/i })
    fireEvent.change(sourceSelect, { target: { value: 'project-turing-machine' } })

    fireEvent.change(screen.getByPlaceholderText('playwright'), {
      target: { value: 'filesystem' },
    })
    fireEvent.change(screen.getByPlaceholderText('npx'), {
      target: { value: 'npx' },
    })
    fireEvent.change(screen.getByPlaceholderText('-y @playwright/mcp@latest'), {
      target: { value: '-y @modelcontextprotocol/server-filesystem .' },
    })

    const buttons = screen.getAllByRole('button', { name: 'Add Server' })
    fireEvent.click(buttons[buttons.length - 1]!)

    await waitFor(() => {
      expect(writeMcpSourceConfigMock).toHaveBeenCalledWith({
        projectPath: PROJECT_PATH,
        sourceId: 'project-turing-machine',
        rawJson:
          '{\n' +
          '  "mcpServers": {\n' +
          '    "alpha": {\n' +
          '      "command": "alpha"\n' +
          '    },\n' +
          '    "filesystem": {\n' +
          '      "command": "npx",\n' +
          '      "args": [\n' +
          '        "-y",\n' +
          '        "@modelcontextprotocol/server-filesystem",\n' +
          '        "."\n' +
          '      ]\n' +
          '    }\n' +
          '  }\n' +
          '}\n',
      })
    })
  })

  it('quick-adds a GitHub MCP server into the selected MCP source', async () => {
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add Server' }))

    const sourceSelect = screen.getByRole('combobox', { name: /Install for/i })
    fireEvent.change(sourceSelect, { target: { value: 'project-turing-machine' } })

    fireEvent.click(screen.getByRole('button', { name: 'GitHub URL' }))
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/example/browser-tools-mcp' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add From GitHub' }))

    await waitFor(() => {
      expect(writeMcpSourceConfigMock).toHaveBeenCalledWith({
        projectPath: PROJECT_PATH,
        sourceId: 'project-turing-machine',
        rawJson:
          '{\n' +
          '  "mcpServers": {\n' +
          '    "alpha": {\n' +
          '      "command": "alpha"\n' +
          '    },\n' +
          '    "browser-tools-mcp": {\n' +
          '      "command": "npx",\n' +
          '      "args": [\n' +
          '        "-y",\n' +
          '        "github:example/browser-tools-mcp"\n' +
          '      ]\n' +
          '    }\n' +
          '  }\n' +
          '}\n',
      })
    })
  })

  it('notifies when saving raw JSON fails', async () => {
    writeMcpSourceConfigMock.mockRejectedValueOnce(new Error('Invalid JSON'))

    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))

    const sourceSelect = screen.getByRole('combobox', { name: /Edit/i })
    fireEvent.change(sourceSelect, { target: { value: 'project-standard' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save JSON' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid JSON')
    expect(useUIStore.getState().toastData).toMatchObject({
      message: 'MCP JSON was not saved: Invalid JSON',
      variant: 'error',
    })
  })

  it('disables the adapter package source without touching server config from the renderer', async () => {
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('switch', { name: 'Disable MCP Connection' }))

    await waitFor(() => {
      expect(setMcpAdapterEnabledMock).toHaveBeenCalledWith(false, PROJECT_PATH)
    })
  })

  it('shows invalid source diagnostics returned by the main process', async () => {
    getMcpSettingsMock.mockResolvedValueOnce({
      ...MCP_VIEW,
      sources: [
        {
          ...sourceAt(0),
          exists: true,
          parseError: 'Invalid MCP JSON config at /Users/test/.config/mcp/mcp.json',
        },
        ...MCP_VIEW.sources.slice(1),
      ],
      adapter: {
        ...MCP_VIEW.adapter,
        lastError: 'Invalid Pi settings JSON at /Users/test/.pi/settings.json',
      },
    } satisfies McpSettingsView)

    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))

    expect(
      await screen.findByText('Invalid MCP JSON config at /Users/test/.config/mcp/mcp.json'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Invalid Pi settings JSON at /Users/test/.pi/settings.json'),
    ).toBeInTheDocument()
  })

  it('starts with a minimal MCP UI and keeps advanced panels collapsed', async () => {
    render(<McpSection />)

    expect(await screen.findByText('MCP Connection')).toBeInTheDocument()
    expect(screen.getByText('Connected Servers')).toBeInTheDocument()
    expect(screen.queryByText('Effective servers')).not.toBeInTheDocument()
  })

  it('removes a server from its source after confirmation', async () => {
    showConfirmMock.mockResolvedValue(true)
    render(<McpSection />)

    // The "alpha" server lives in the project-turing-machine source (editable).
    fireEvent.click(await screen.findByRole('button', { name: 'Remove alpha' }))

    await waitFor(() => {
      expect(showConfirmMock).toHaveBeenCalledWith(
        'Remove this MCP server?',
        expect.stringContaining('"alpha" will be removed from'),
      )
    })
    await waitFor(() => {
      expect(writeMcpSourceConfigMock).toHaveBeenCalledWith({
        projectPath: PROJECT_PATH,
        sourceId: 'project-turing-machine',
        // The alpha entry is stripped from the project-turing-machine source, which
        // originally held only alpha — so the resulting mcpServers is empty.
        rawJson: '{\n  "mcpServers": {}\n}\n',
      })
    })
    expect(useUIStore.getState().toastData).toMatchObject({
      message: 'Removed MCP server "alpha".',
      variant: 'success',
    })
  })

  it('does not remove a server when the confirmation is cancelled', async () => {
    showConfirmMock.mockResolvedValue(false)
    render(<McpSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove alpha' }))

    await waitFor(() => {
      expect(showConfirmMock).toHaveBeenCalled()
    })
    expect(writeMcpSourceConfigMock).not.toHaveBeenCalled()
  })
})
