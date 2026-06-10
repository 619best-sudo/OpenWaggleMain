import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importSkillFromUrl } from '../skill-importer'

const tempDirs: string[] = []

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openwaggle-skill-importer-'))
  tempDirs.push(dir)
  return dir
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('importSkillFromUrl', () => {
  it('imports a remote SKILL.md into the project skills folder', async () => {
    const projectPath = await makeTempProject()
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        `---
name: Remote Skill
description: Imports cleanly.
---

# Remote Skill
`,
        { status: 200 },
      ),
    )

    const result = await importSkillFromUrl(projectPath, 'https://example.com/SKILL.md')

    expect(result).toEqual({ status: 'imported', skillId: 'remote-skill' })
    await expect(
      fs.readFile(
        path.join(projectPath, '.openwaggle', 'skills', 'remote-skill', 'SKILL.md'),
        'utf8',
      ),
    ).resolves.toContain('name: Remote Skill')
  })

  it('should resolve a GitHub repo URL to its raw SKILL.md URL', async () => {
    const projectPath = await makeTempProject()
    const sourceUrl = 'https://github.com/example/single-skill'

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [
              { path: '.claude/skills/ui/SKILL.md', type: 'blob', size: 100 },
              {
                path: '.claude/skills/ui/templates/todo-app-components.md',
                type: 'blob',
                size: 32,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [
              { path: '.claude/skills/ui/SKILL.md', type: 'blob', size: 100 },
              {
                path: '.claude/skills/ui/templates/todo-app-components.md',
                type: 'blob',
                size: 32,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          '---\nname: UI UX Pro Max\ndescription: Premium UI UX skill\n---\n# UI UX Pro Max',
          {
            status: 200,
            headers: { 'content-length': '100', 'content-type': 'text/plain; charset=utf-8' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response('Use these components.', {
          status: 200,
          headers: { 'content-length': '32', 'content-type': 'text/plain; charset=utf-8' },
        }),
      )

    const result = await importSkillFromUrl(projectPath, sourceUrl)

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/example/single-skill/git/trees/main?recursive=1',
      { headers: { accept: 'application/vnd.github+json' } },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/example/single-skill/git/trees/main?recursive=1',
      { headers: { accept: 'application/vnd.github+json' } },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://raw.githubusercontent.com/example/single-skill/main/.claude/skills/ui/SKILL.md',
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'https://raw.githubusercontent.com/example/single-skill/main/.claude/skills/ui/templates/todo-app-components.md',
    )
    expect(result).toEqual({ status: 'imported', skillId: 'ui-ux-pro-max' })
    await expect(
      fs.readFile(
        path.join(
          projectPath,
          '.openwaggle',
          'skills',
          'ui-ux-pro-max',
          'templates',
          'todo-app-components.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('Use these components.')
  })

  it('returns skill choices when a GitHub repo contains multiple skills', async () => {
    const projectPath = await makeTempProject()
    const sourceUrl = 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill'

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tree: [
            { path: '.claude/skills/banner-design/SKILL.md', type: 'blob' },
            { path: '.claude/skills/brand/SKILL.md', type: 'blob' },
            { path: '.claude/skills/design-system/SKILL.md', type: 'blob' },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await expect(importSkillFromUrl(projectPath, sourceUrl)).resolves.toEqual({
      status: 'requires-selection',
      choices: [
        {
          id: 'banner-design',
          name: 'Banner Design',
          path: '.claude/skills/banner-design/SKILL.md',
          sourceUrl:
            'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/banner-design/SKILL.md',
        },
        {
          id: 'brand',
          name: 'Brand',
          path: '.claude/skills/brand/SKILL.md',
          sourceUrl:
            'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/brand/SKILL.md',
        },
        {
          id: 'design-system',
          name: 'Design System',
          path: '.claude/skills/design-system/SKILL.md',
          sourceUrl:
            'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/design-system/SKILL.md',
        },
      ],
    })
  })

  it('should try master branch if main branch lookup fails for GitHub repo URL', async () => {
    const projectPath = await makeTempProject()
    const sourceUrl = 'https://github.com/example/single-skill'

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [{ path: 'SKILL.md', type: 'blob' }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tree: [{ path: 'SKILL.md', type: 'blob', size: 100 }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          '---\nname: UI UX Pro Max\ndescription: Premium UI UX skill\n---\n# UI UX Pro Max',
          {
            status: 200,
            headers: { 'content-length': '100', 'content-type': 'text/plain; charset=utf-8' },
          },
        ),
      )

    const result = await importSkillFromUrl(projectPath, sourceUrl)

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/example/single-skill/git/trees/main?recursive=1',
      { headers: { accept: 'application/vnd.github+json' } },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/example/single-skill/git/trees/master?recursive=1',
      { headers: { accept: 'application/vnd.github+json' } },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://api.github.com/repos/example/single-skill/git/trees/master?recursive=1',
      { headers: { accept: 'application/vnd.github+json' } },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'https://raw.githubusercontent.com/example/single-skill/master/SKILL.md',
    )
    expect(result).toEqual({ status: 'imported', skillId: 'ui-ux-pro-max' })
  })

  it('rejects duplicate imports for an existing skill id', async () => {
    const projectPath = await makeTempProject()
    const skillDir = path.join(projectPath, '.openwaggle', 'skills', 'remote-skill')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'existing\n', 'utf8')
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        `---
name: Remote Skill
description: Imports cleanly.
---

Body`,
        { status: 200 },
      ),
    )

    await expect(importSkillFromUrl(projectPath, 'https://example.com/SKILL.md')).rejects.toThrow(
      /already exists/i,
    )
  })
})
