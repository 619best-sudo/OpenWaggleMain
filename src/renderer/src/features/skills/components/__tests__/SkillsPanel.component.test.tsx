import type { SkillCatalogResult, SkillImportResult } from '@shared/types/standards'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillsPanel } from '../SkillsPanel'

const mockState = vi.hoisted(() => {
  const catalog: SkillCatalogResult = {
    projectPath: '/tmp/project',
    skills: [
      {
        id: 'skill-one',
        name: 'Skill One',
        description: 'Test skill',
        folderPath: '/tmp/project/.openwaggle/skills/skill-one',
        skillPath: '/tmp/project/.openwaggle/skills/skill-one/SKILL.md',
        hasScripts: false,
        enabled: true,
        loadStatus: 'ok',
      },
    ],
  }

  return {
    previewMarkdown: '',
    catalog,
    importSkill: vi.fn<(_: string) => Promise<SkillImportResult>>().mockResolvedValue({
      status: 'imported',
      skillId: 'skill-one',
    }),
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
    importSkill: mockState.importSkill,
  }),
}))

function renderPanel(previewMarkdown: string) {
  mockState.previewMarkdown = previewMarkdown
  return render(<SkillsPanel />)
}

describe('SkillsPanel markdown safety', () => {
  beforeEach(() => {
    mockState.previewMarkdown = ''
    mockState.importSkill.mockClear()
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
})
