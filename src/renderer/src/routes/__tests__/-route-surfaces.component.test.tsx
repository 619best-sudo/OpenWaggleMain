import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/shared/ui/Button'
import { ChatRouteSurface } from '../-chat-route-surface'
import { McpRouteSurface } from '../-mcp-route-surface'
import { SettingsRouteSurface } from '../-settings-route-surface'
import { SkillsRouteSurface } from '../-skills-route-surface'
import { TeammatesRouteSurface } from '../-teammates-route-surface'
import { WaggleRouteSurface } from '../-waggle-route-surface'

type SettingsTab = 'profile' | 'general' | 'archived' | 'connections'
type RightSidebarPanel = 'diff' | 'session-tree'
interface RouterState {
  readonly location: {
    readonly pathname: string
  }
}
interface ShellState {
  readonly lastRightSidebarPanel: RightSidebarPanel
  readonly setLastRightSidebarPanel: (panel: RightSidebarPanel) => void
}

const routeSurfaceMocks = vi.hoisted(() => {
  let pathname = '/settings/general'
  let lastRightSidebarPanel: RightSidebarPanel = 'diff'
  const setLastRightSidebarPanel = vi.fn((panel: RightSidebarPanel) => {
    lastRightSidebarPanel = panel
  })
  return {
    setPathname: (nextPathname: string) => {
      pathname = nextPathname
    },
    setLastPanel: (panel: RightSidebarPanel) => {
      lastRightSidebarPanel = panel
    },
    routerState: (): RouterState => ({ location: { pathname } }),
    shellState: (): ShellState => ({ lastRightSidebarPanel, setLastRightSidebarPanel }),
    setLastRightSidebarPanel,
    chatRouteEffects: vi.fn(),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useRouterState: <T,>(input: { readonly select: (state: RouterState) => T }) =>
    input.select(routeSurfaceMocks.routerState()),
}))

vi.mock('@/features/chat/hooks', () => ({
  useChatPanelSections: () => ({ diff: { projectPath: '/repo', onSendMessage: vi.fn() } }),
}))

vi.mock('@/features/chat/components', () => ({
  ChatDiffPane: ({
    isExpanded = false,
    onClose,
    onToggleExpanded,
  }: {
    readonly isExpanded?: boolean
    readonly onClose: () => void
    readonly onToggleExpanded?: () => void
  }) => (
    <aside>
      Diff pane {isExpanded ? 'expanded' : 'sidebar'}
      {onToggleExpanded ? (
        <Button variant="unstyled" type="button" onClick={onToggleExpanded}>
          Toggle diff size
        </Button>
      ) : null}
      <Button variant="unstyled" type="button" onClick={onClose}>
        Close diff
      </Button>
    </aside>
  ),
  ChatPanelContent: ({ onOpenSessionTree }: { readonly onOpenSessionTree: () => void }) => (
    <main>
      Chat content
      <Button variant="unstyled" type="button" onClick={onOpenSessionTree}>
        Open tree
      </Button>
    </main>
  ),
}))

vi.mock('@/features/session-tree/components', () => ({
  SessionTreePanel: ({ onClose }: { readonly onClose: () => void }) => (
    <aside>
      Session Tree panel
      <Button variant="unstyled" type="button" onClick={onClose}>
        Close tree
      </Button>
    </aside>
  ),
}))

vi.mock('@/features/settings/components', () => ({
  AppSettingsView: ({ activeTab }: { readonly activeTab: SettingsTab }) => (
    <section>Settings tab: {activeTab}</section>
  ),
}))

vi.mock('@/features/settings/components/sections/McpSection', () => ({
  McpSection: () => <section>MCP panel</section>,
}))

vi.mock('@/features/settings/components/sections/WaggleSection', () => ({
  WaggleSection: () => <section>Waggle panel</section>,
}))

vi.mock('@/features/teammates/components/TeammatesPanel', () => ({
  TeammatesPanel: () => <section>Teammates panel</section>,
}))

vi.mock('@/features/skills/components', () => ({
  SkillsPanel: () => <section>Skills panel</section>,
}))

vi.mock('@/features/skills/components/SkillsPanel', () => ({
  SkillsPanel: () => <section>Skills panel</section>,
}))

vi.mock('@/shared/ui/PanelErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { readonly children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/shared/ui/RightSidebarLayout', () => ({
  RightSidebarLayout: ({
    children,
    onOpenChange,
    sidebar,
  }: {
    readonly children: React.ReactNode
    readonly onOpenChange: (open: boolean) => void
    readonly sidebar: React.ReactNode
  }) => (
    <section>
      {children}
      {sidebar}
      <Button variant="unstyled" type="button" onClick={() => onOpenChange(false)}>
        Close right sidebar
      </Button>
    </section>
  ),
}))

vi.mock('@/shell', () => ({
  CHAT_MIN_WIDTH: 420,
  DIFF_PANEL_MAX: 900,
  DIFF_PANEL_MIN: 360,
  useUIStore: <T,>(selector: (state: ShellState) => T) => selector(routeSurfaceMocks.shellState()),
}))

vi.mock('../-chat-route-effects', () => ({
  useChatRouteEffects: routeSurfaceMocks.chatRouteEffects,
}))

describe('route surfaces', () => {
  beforeEach(() => {
    routeSurfaceMocks.setPathname('/settings/general')
    routeSurfaceMocks.setLastPanel('diff')
    routeSurfaceMocks.setLastRightSidebarPanel.mockClear()
    routeSurfaceMocks.chatRouteEffects.mockClear()
  })

  it('derives the settings tab from the current route when the route contains a tab segment', () => {
    routeSurfaceMocks.setPathname('/settings/connections')

    render(<SettingsRouteSurface tab="general" />)

    expect(screen.getByText('Settings tab: connections')).toBeInTheDocument()
  })

  it('falls back to the route-provided settings tab for non-tab paths', () => {
    routeSurfaceMocks.setPathname('/settings/unknown')

    render(<SettingsRouteSurface tab="archived" />)

    expect(screen.getByText('Settings tab: archived')).toBeInTheDocument()
  })

  it('wraps the skills panel in its route surface', () => {
    render(<SkillsRouteSurface />)

    expect(screen.getByText('Skills panel')).toBeInTheDocument()
  })

  it('wraps the MCP panel in its route surface', () => {
    render(<McpRouteSurface />)

    expect(screen.getByText('MCP panel')).toBeInTheDocument()
  })

  it('wraps the Waggle panel in its route surface', () => {
    render(<WaggleRouteSurface />)

    expect(screen.getByText('Waggle panel')).toBeInTheDocument()
  })

  it('wraps the Team(New) panel in its route surface', () => {
    render(<TeammatesRouteSurface />)

    expect(screen.getByText('Teammates panel')).toBeInTheDocument()
  })

  it('renders chat content with the active diff sidebar and closes it through route state', async () => {
    const onDiffOpenChange = vi.fn()
    const onSessionTreeOpenChange = vi.fn()

    render(
      <ChatRouteSurface
        branchId="branch-1"
        diffOpen
        nodeId="node-1"
        sessionId="session-1"
        sessionTreeOpen={false}
        onDiffOpenChange={onDiffOpenChange}
        onSessionTreeOpenChange={onSessionTreeOpenChange}
      />,
    )

    expect(screen.getByText('Chat content')).toBeInTheDocument()
    expect(await screen.findByText('Diff pane sidebar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close right sidebar' }))

    expect(routeSurfaceMocks.chatRouteEffects).toHaveBeenCalledWith({
      branchId: 'branch-1',
      diffOpen: true,
      nodeId: 'node-1',
      sessionId: 'session-1',
    })
    expect(routeSurfaceMocks.setLastRightSidebarPanel).toHaveBeenCalledWith('diff')
    expect(onDiffOpenChange).toHaveBeenCalledWith(false)
    expect(onSessionTreeOpenChange).not.toHaveBeenCalled()
  })

  it('expands the diff into the full chat surface', async () => {
    const onDiffOpenChange = vi.fn()
    const onSessionTreeOpenChange = vi.fn()

    render(
      <ChatRouteSurface
        branchId="branch-1"
        diffOpen
        nodeId="node-1"
        sessionId="session-1"
        sessionTreeOpen={false}
        onDiffOpenChange={onDiffOpenChange}
        onSessionTreeOpenChange={onSessionTreeOpenChange}
      />,
    )

    expect(await screen.findByText('Diff pane sidebar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle diff size' }))

    expect(await screen.findByText('Diff pane expanded')).toBeInTheDocument()
    expect(screen.queryByText('Chat content')).not.toBeInTheDocument()
    expect(onDiffOpenChange).not.toHaveBeenCalled()
    expect(onSessionTreeOpenChange).not.toHaveBeenCalled()
  })

  it('renders Session Tree when that panel is open and routes close events to the tree toggle', async () => {
    const onDiffOpenChange = vi.fn()
    const onSessionTreeOpenChange = vi.fn()

    render(
      <ChatRouteSurface
        branchId={null}
        diffOpen={false}
        nodeId={null}
        sessionId="session-1"
        sessionTreeOpen
        onDiffOpenChange={onDiffOpenChange}
        onSessionTreeOpenChange={onSessionTreeOpenChange}
      />,
    )

    expect(await screen.findByText('Session Tree panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close right sidebar' }))

    expect(routeSurfaceMocks.setLastRightSidebarPanel).toHaveBeenCalledWith('session-tree')
    expect(onSessionTreeOpenChange).toHaveBeenCalledWith(false)
    expect(onDiffOpenChange).not.toHaveBeenCalled()
  })
})
