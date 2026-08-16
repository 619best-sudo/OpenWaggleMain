import type { SkillCatalogResult, SkillImportResult } from '@shared/types/standards'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsPanel } from '../SkillsPanel'

const mockState = vi.hoisted(() => {
  const createCatalog = (): SkillCatalogResult => ({
    projectPath: '/tmp/project',
    skills: [
      {
        id: 'skill-one',
        name: 'Skill One',
        description: 'Test skill',
        folderPath: '/tmp/project/.turing-machine/skills/skill-one',
        skillPath: '/tmp/project/.turing-machine/skills/skill-one/SKILL.md',
        hasScripts: false,
        enabled: true,
        loadStatus: 'ok',
      },
      {
        id: 'curated-skill',
        name: 'Curated Skill',
        description: 'Repo-curated',
        folderPath: '/tmp/project/.agents/skills/curated-skill',
        skillPath: '/tmp/project/.agents/skills/curated-skill/SKILL.md',
        hasScripts: false,
        enabled: true,
        loadStatus: 'ok',
      },
    ],
  })

  return {
    previewMarkdown: '',
    createCatalog,
    catalog: createCatalog(),
    importSkill: vi.fn<(_: string) => Promise<SkillImportResult>>().mockResolvedValue({
      status: 'imported',
      skillId: 'skill-one',
    }),
    removeSkill: vi.fn<(skillId: string) => Promise<void>>().mockResolvedValue(undefined),
    showToast: vi.fn(),
    showConfirm: vi.fn<(_: string, __?: string) => Promise<boolean>>().mockResolvedValue(true),
  }
})

vi.mock('@/shared/hooks/useEscapeHotkey', () => ({
  useEscapeHotkey: vi.fn(),
}))

vi.mock('@/features/sessions/hooks/useProject', () => ({
  useProject: () => ({
    projectPath: '/tmp/project',
    selectFolder: vi.fn(),
    setProjectPath: vi.fn(),
  }),
}))

vi.mock('@/features/skills/hooks/useSkills', () => ({
  useSkills: () => ({
    standardsStatus: { agents: 'found' as const, agentsPath: '/tmp/project/AGENTS.md' },
    catalog: mockState.catalog,
    selectedSkillId: 'skill-one',
    previewMarkdown: mockState.previewMarkdown,
    isLoading: false,
    isPreviewLoading: false,
    error: null,
    refresh: vi.fn(),
    selectSkill: vi.fn(),
    toggleSkill: vi.fn(),
    isImporting: false,
    isRemoving: false,
    importSkill: mockState.importSkill,
    removeSkill: mockState.removeSkill,
  }),
}))

vi.mock('@/shell/ui-store', () => ({
  useUIStore: () => mockState.showToast,
}))

vi.mock('@/shared/lib/ipc', () => ({
  api: {
    showConfirm: (...args: unknown[]) => mockState.showConfirm(args[0] as string, args[1] as string),
  },
}))

function renderPanel(previewMarkdown: string) {
  mockState.previewMarkdown = previewMarkdown
  return render(<SkillsPanel />)
}

describe('SkillsPanel markdown safety', () => {
  beforeEach(() => {
    mockState.previewMarkdown = ''
    mockState.catalog = mockState.createCatalog()
    mockState.importSkill.mockClear()
    mockState.removeSkill.mockClear()
    mockState.showToast.mockClear()
    mockState.showConfirm.mockClear()
    mockState.showConfirm.mockResolvedValue(true)
  })

  it('renders allowed links and blocks unsafe protocols', () => {
    renderPanel(
      '[good](https://example.com) [email](mailto:test@example.com) [bad](javascript:alert(1))',
    )

    expect(screen.getByRole('link', { name: 'good' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    expect(screen.getByRole('link', { name: 'email' })).toHaveAttribute(
      'href',
      'mailto:test@example.com',
    )
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByText('bad')).toBeInTheDocument()
  })

  it('does not render raw HTML payloads as executable nodes', () => {
    const { container } = renderPanel('<img src=x onerror=alert(1) />')

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('keeps syntax highlighting classes for fenced code', () => {
    const { container } = renderPanel('```ts\nconst x = 1\n```')
    const code = container.querySelector('code')

    expect(code).toBeTruthy()
    expect(code?.className).toContain('language-ts')
  })

  it('opens the import dialog and submits a URL through the skills hook', async () => {
    renderPanel('')

    fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. https://github.com/owner/repo'), {
      target: { value: 'https://example.com/SKILL.md' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() =>
      expect(mockState.importSkill).toHaveBeenCalledWith('https://example.com/SKILL.md'),
    )
  })

  it('shows a picker when the import resolves to multiple skills', async () => {
    mockState.importSkill
      .mockResolvedValueOnce({
        status: 'requires-selection',
        choices: [
          {
            id: 'banner-design',
            name: 'Banner Design',
            path: '.claude/skills/banner-design/SKILL.md',
            sourceUrl:
              'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/banner-design/SKILL.md',
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 'imported',
        skillId: 'banner-design',
      })

    renderPanel('')

    fireEvent.click(screen.getByRole('button', { name: 'Import Skill' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. https://github.com/owner/repo'), {
      target: { value: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(await screen.findByText('Choose a skill')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Banner Design/i }))

    await waitFor(() =>
      expect(mockState.importSkill).toHaveBeenNthCalledWith(
        2,
        'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/banner-design/SKILL.md',
      ),
    )
  })

  it('shows the import CTA even when the panel header is hidden', () => {
    render(<SkillsPanel showHeader={false} />)

    expect(screen.getByRole('button', { name: 'Import Skill' })).toBeInTheDocument()
  })

  it('keeps the discovered skills header when the catalog is empty', () => {
    mockState.catalog = { projectPath: '/tmp/project', skills: [] }

    renderPanel('')

    expect(screen.getByText('Discovered Skills')).toBeInTheDocument()
    expect(screen.getByText('No skills discovered')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Import a skill or add one to your project skills folder or `.agents/skills`.',
      ),
    ).toBeInTheDocument()
  })
})

describe('SkillsPanel remove', () => {
  beforeEach(() => {
    mockState.previewMarkdown = ''
    mockState.catalog = mockState.createCatalog()
    mockState.removeSkill.mockClear()
    mockState.showToast.mockClear()
    mockState.showConfirm.mockClear()
    mockState.showConfirm.mockResolvedValue(true)
  })

  it('removes an .openwaggle skill after confirmation', async () => {
    renderPanel('')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Skill One' }))

    await waitFor(() => expect(mockState.showConfirm).toHaveBeenCalled())
    await waitFor(() => expect(mockState.removeSkill).toHaveBeenCalledWith('skill-one'))
    expect(mockState.showToast).toHaveBeenCalledWith('Removed skill "Skill One".', 'success')
  })

  it('does not remove when the confirmation is cancelled', async () => {
    mockState.showConfirm.mockResolvedValue(false)
    renderPanel('')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Skill One' }))

    await waitFor(() => expect(mockState.showConfirm).toHaveBeenCalled())
    expect(mockState.removeSkill).not.toHaveBeenCalled()
    expect(mockState.showToast).not.toHaveBeenCalled()
  })

  it('disables the remove button for repo-curated .agents/skills entries', () => {
    renderPanel('')

    const removeCurated = screen.getByRole('button', { name: 'Remove Curated Skill' })
    expect(removeCurated).toBeDisabled()
  })
})
