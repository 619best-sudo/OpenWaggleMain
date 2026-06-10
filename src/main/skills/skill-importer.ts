import fs from 'node:fs/promises'
import path from 'node:path'
import type { SkillImportChoice, SkillImportResult } from '@shared/types/standards'
import { normalizeSkillId } from '@shared/utils/skill-id'
import { parseSkillDocument } from './skill-document'

const MAX_SKILL_FILE_BYTES = 128 * 1024
const MAX_SKILL_TOTAL_BYTES = 2 * 1024 * 1024

interface RawImportTarget {
  readonly kind: 'raw-url'
  readonly url: string
}

interface ResolvedImportChoices {
  readonly kind: 'choices'
  readonly choices: SkillImportChoice[]
}

interface ResolvedImportTargets {
  readonly kind: 'targets'
  readonly targets: ImportTarget[]
}

interface GitHubFolderImportTarget {
  readonly kind: 'github-folder'
  readonly owner: string
  readonly repo: string
  readonly ref: string
  readonly skillFilePath: string
  readonly skillFolderPath: string
}

type ImportTarget = RawImportTarget | GitHubFolderImportTarget

export async function importSkillFromUrl(
  projectPath: string,
  sourceUrl: string,
): Promise<SkillImportResult> {
  const resolvedSource = await normalizeImportUrls(sourceUrl)
  if (resolvedSource.kind === 'choices') {
    return {
      status: 'requires-selection',
      choices: resolvedSource.choices,
    }
  }

  const targets = resolvedSource.targets
  let lastError: Error | null = null

  for (const target of targets) {
    try {
      const skillId =
        target.kind === 'github-folder'
          ? await importGitHubSkillFolder(projectPath, target)
          : await importRawSkillMarkdown(projectPath, target.url)
      return { status: 'imported', skillId }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // If it's a specific user error (too large, already exists), don't retry other variants
      if (isTerminalImportError(lastError)) {
        throw lastError
      }
    }
  }

  throw lastError || new Error('Failed to resolve a valid SKILL.md from the provided URL.')
}

function ensureTrailingNewline(markdown: string) {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}

async function normalizeImportUrls(
  sourceUrl: string,
): Promise<ResolvedImportTargets | ResolvedImportChoices> {
  const url = parseHttpUrl(sourceUrl)

  if (url.hostname === 'github.com') {
    return await resolveGitHubUrls(url)
  }

  return { kind: 'targets', targets: [{ kind: 'raw-url', url: url.toString() }] }
}

function parseHttpUrl(sourceUrl: string) {
  let url: URL
  try {
    url = new URL(sourceUrl.trim())
  } catch {
    throw new Error('Enter a valid HTTP or HTTPS URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  }

  return url
}

async function resolveGitHubUrls(url: URL): Promise<ResolvedImportTargets | ResolvedImportChoices> {
  const segments = url.pathname.split('/').filter(Boolean)

  // 1. Specific file: https://github.com/owner/repo/blob/branch/path/to/SKILL.md
  if (segments.length >= 5 && segments[2] === 'blob') {
    const [owner, repo, , branch, ...rest] = segments
    const skillFilePath = rest.join('/')
    return {
      kind: 'targets',
      targets: [
        {
          kind: 'github-folder',
          owner,
          repo,
          ref: branch,
          skillFilePath,
          skillFolderPath: skillFilePath.slice(0, -'/SKILL.md'.length),
        },
      ],
    }
  }

  // 2. Repo root or branch root: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch
  if (segments.length === 2 || (segments.length === 4 && segments[2] === 'tree')) {
    const [owner, repo, , branch] = segments
    return await resolveGitHubRepoSkillUrls({ owner, repo, branch })
  }

  return { kind: 'targets', targets: [{ kind: 'raw-url', url: url.toString() }] }
}

async function resolveGitHubRepoSkillUrls({
  owner,
  repo,
  branch,
}: {
  readonly owner: string
  readonly repo: string
  readonly branch?: string
}): Promise<ResolvedImportTargets | ResolvedImportChoices> {
  const refs = branch ? [branch] : ['main', 'master']
  let lastFetchError: Error | null = null

  for (const ref of refs) {
    const response = await fetchGitHubTree(owner, repo, ref)

    if (!response.ok) {
      lastFetchError = new Error(`Failed to inspect GitHub repository (${response.status}).`)
      continue
    }

    const payload = (await response.json()) as {
      readonly tree?: Array<{
        readonly path?: string
        readonly type?: string
      }>
    }

    const skillPaths = (payload.tree ?? [])
      .filter(
        (item) =>
          item.type === 'blob' &&
          typeof item.path === 'string' &&
          (item.path === 'SKILL.md' || item.path.endsWith('/SKILL.md')),
      )
      .map((item) => item.path as string)

    if (skillPaths.length === 0) {
      lastFetchError = new Error('No SKILL.md files were found in that GitHub repository.')
      continue
    }

    if (skillPaths.length > 1) {
      return {
        kind: 'choices',
        choices: skillPaths.map((skillPath) => {
          const skillFolder = skillPath.slice(0, -'/SKILL.md'.length)
          const id = skillFolder.split('/').pop() ?? skillPath
          return {
            id,
            name: humanizeSkillName(id),
            path: skillPath,
            sourceUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${skillPath}`,
          }
        }),
      }
    }

    return {
      kind: 'targets',
      targets: [
        {
          kind: 'github-folder',
          owner,
          repo,
          ref,
          skillFilePath: skillPaths[0],
          skillFolderPath:
            skillPaths[0] === 'SKILL.md' ? '' : skillPaths[0].slice(0, -'/SKILL.md'.length),
        },
      ],
    }
  }

  if (lastFetchError) {
    throw lastFetchError
  }

  throw new Error('Failed to resolve a SKILL.md from that GitHub repository.')
}

function humanizeSkillName(skillId: string) {
  return skillId
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function importRawSkillMarkdown(projectPath: string, url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill (${response.status} ${response.statusText})`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (isLikelyHtmlResponse(contentType, url)) {
    throw new Error('The provided URL does not point to a SKILL.md file.')
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_SKILL_FILE_BYTES) {
    throw new Error('Remote SKILL.md is too large to import.')
  }

  const markdown = await response.text()
  if (Buffer.byteLength(markdown, 'utf8') > MAX_SKILL_FILE_BYTES) {
    throw new Error('Remote SKILL.md is too large to import.')
  }

  const parsed = parseSkillDocument(markdown)
  const skillId = normalizeSkillId(parsed.name)
  const skillDir = path.join(projectPath, '.openwaggle', 'skills', skillId)
  const skillPath = path.join(skillDir, 'SKILL.md')

  await assertImportDestinationAvailable(skillDir, skillId)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(skillPath, ensureTrailingNewline(markdown), {
    encoding: 'utf8',
    flag: 'wx',
  })

  return skillId
}

async function importGitHubSkillFolder(projectPath: string, target: GitHubFolderImportTarget) {
  const treeResponse = await fetchGitHubTree(target.owner, target.repo, target.ref)
  if (!treeResponse.ok) {
    throw new Error(`Failed to inspect GitHub repository (${treeResponse.status}).`)
  }

  const payload = (await treeResponse.json()) as GitHubTreeResponse
  const allFiles = (payload.tree ?? []).filter(
    (item) =>
      item.type === 'blob' &&
      typeof item.path === 'string' &&
      isPathInsideFolder(item.path, target.skillFolderPath),
  )

  const skillEntry = allFiles.find((item) => item.path === target.skillFilePath)
  if (!skillEntry?.path) {
    throw new Error('The selected SKILL.md could not be found in that repository.')
  }

  const skillMarkdown = await fetchTextFile(
    toRawGitHubUrl(target.owner, target.repo, target.ref, target.skillFilePath),
  )
  const parsed = parseSkillDocument(skillMarkdown)
  const skillId = normalizeSkillId(parsed.name)
  const skillDir = path.join(projectPath, '.openwaggle', 'skills', skillId)

  await assertImportDestinationAvailable(skillDir, skillId)

  const totalBytes = allFiles.reduce((sum, item) => sum + (item.size ?? 0), 0)
  if (totalBytes > MAX_SKILL_TOTAL_BYTES) {
    throw new Error('The selected skill folder is too large to import.')
  }

  await fs.mkdir(skillDir, { recursive: true })

  try {
    for (const file of allFiles) {
      if (!file.path) continue
      const relativePath =
        target.skillFolderPath.length === 0
          ? file.path
          : file.path.slice(target.skillFolderPath.length + 1)
      const destinationPath = path.join(skillDir, relativePath)
      const destinationDir = path.dirname(destinationPath)
      const fileContents =
        file.path === target.skillFilePath
          ? ensureTrailingNewline(skillMarkdown)
          : await fetchTextFile(toRawGitHubUrl(target.owner, target.repo, target.ref, file.path))

      await fs.mkdir(destinationDir, { recursive: true })
      await fs.writeFile(destinationPath, fileContents, { encoding: 'utf8', flag: 'wx' })
    }
  } catch (error) {
    await fs.rm(skillDir, { recursive: true, force: true })
    throw error
  }

  return skillId
}

async function assertImportDestinationAvailable(skillDir: string, skillId: string) {
  if (skillId.length === 0) {
    throw new Error('Unable to derive a local skill id from the imported skill.')
  }

  try {
    await fs.stat(skillDir)
    throw new Error(`Skill "${skillId}" already exists in this project.`)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      if (error instanceof Error) {
        throw error
      }
    }
  }
}

function isPathInsideFolder(filePath: string, folderPath: string) {
  return folderPath.length === 0
    ? true
    : filePath === folderPath || filePath.startsWith(`${folderPath}/`)
}

function toRawGitHubUrl(owner: string, repo: string, ref: string, filePath: string) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
}

async function fetchTextFile(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill file (${response.status} ${response.statusText})`)
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_SKILL_FILE_BYTES) {
    throw new Error('One of the skill files is too large to import.')
  }

  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_SKILL_FILE_BYTES) {
    throw new Error('One of the skill files is too large to import.')
  }

  return text
}

async function fetchGitHubTree(owner: string, repo: string, ref: string) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, {
    headers: {
      accept: 'application/vnd.github+json',
    },
  })
}

interface GitHubTreeResponse {
  readonly tree?: Array<{
    readonly path?: string
    readonly type?: string
    readonly size?: number
  }>
}

function isLikelyHtmlResponse(contentType: string, url: string) {
  return contentType.includes('text/html') && !url.endsWith('/SKILL.md')
}

function isTerminalImportError(error: Error) {
  return (
    error.message.includes('too large') ||
    error.message.includes('already exists') ||
    error.message.includes('No SKILL.md files were found') ||
    error.message.includes('does not point to a SKILL.md file') ||
    error.message.includes('too large to import')
  )
}
