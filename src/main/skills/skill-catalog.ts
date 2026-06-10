import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { SkillCatalogResult, SkillDiscoveryItem } from '@shared/types/standards'
import { isEnoent } from '@shared/utils/node-error'
import { normalizeSkillId as normalizeSkillIdValue } from '@shared/utils/skill-id'
import { isPathInside } from '../utils/paths'
import { parseSkillDocument } from './skill-document'

export type LoadedSkillDefinition = SkillDiscoveryItem

export interface LoadedSkillCatalog extends SkillCatalogResult {
  readonly skills: readonly LoadedSkillDefinition[]
}

export interface LoadedSkillInstructions extends SkillDiscoveryItem {
  readonly instructions: string
}

/**
 * Skill directories scanned in order. Both `.openwaggle/skills` and
 * `.agents/skills` are supported. When a skill ID exists in both,
 * the first directory wins (`.openwaggle` takes precedence).
 */
const SKILL_DIRS = [
  ['.openwaggle', 'skills'],
  ['.agents', 'skills'],
] as const

function resolveSkillRoots(projectPath: string) {
  return SKILL_DIRS.map((segments) => path.join(projectPath, ...segments))
}

export async function loadSkillCatalog(
  projectPath: string,
  toggles: Readonly<Record<string, boolean>> = {},
): Promise<LoadedSkillCatalog> {
  const seenSkillIds = new Set<string>()
  const allSkills: LoadedSkillDefinition[] = []

  for (const skillsRoot of resolveSkillRoots(projectPath)) {
    const folderEntries = await readDirectoryEntries(skillsRoot)
    if (folderEntries === null) continue

    const rootSkills = await Promise.all(
      folderEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadSkillMetadata(projectPath, skillsRoot, entry.name, toggles)),
    )

    for (const skill of rootSkills) {
      if (!seenSkillIds.has(skill.id)) {
        seenSkillIds.add(skill.id)
        allSkills.push(skill)
      }
    }
  }

  allSkills.sort((a, b) => a.id.localeCompare(b.id))

  return {
    projectPath,
    skills: allSkills,
  }
}

export function toSkillCatalogResult(catalog: LoadedSkillCatalog): SkillCatalogResult {
  return catalog
}

export async function loadSkillInstructions(
  projectPath: string,
  skillId: string,
  toggles: Readonly<Record<string, boolean>> = {},
): Promise<LoadedSkillInstructions> {
  const canonicalSkillId = normalizeRequestedSkillId(skillId)

  // Search all skill roots for the requested skill
  for (const skillsRoot of resolveSkillRoots(projectPath)) {
    const folderEntries = await readDirectoryEntries(skillsRoot)
    if (folderEntries === null) continue

    const matchingFolders = folderEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((folderName) => normalizeSkillId(folderName) === canonicalSkillId)

    if (matchingFolders.length === 0) continue

    if (matchingFolders.length > 1) {
      throw new Error(
        `Skill "${canonicalSkillId}" is ambiguous (${matchingFolders.join(', ')}). Use a unique folder id.`,
      )
    }

    const folderName = matchingFolders[0]
    if (!folderName) continue

    const folderPath = path.join(skillsRoot, folderName)
    const skillPath = path.join(folderPath, 'SKILL.md')
    const enabled = toggles[canonicalSkillId] ?? true
    const hasScripts = await hasScriptsFolder(folderPath)

    try {
      const raw = await readSkillFileWithinProject(projectPath, skillPath)
      const parsed = parseSkillDocument(raw)

      return {
        id: canonicalSkillId,
        name: parsed.name,
        description: parsed.description,
        folderPath,
        skillPath,
        hasScripts,
        enabled,
        loadStatus: 'ok',
        instructions: parsed.body,
      }
    } catch (error) {
      throw new Error(formatSkillError(projectPath, folderName, error))
    }
  }

  throw new Error(`Skill "${canonicalSkillId}" was not found.`)
}

function createDefaultSkillDefinition(
  skillId: string,
  folderPath: string,
  skillPath: string,
  enabled: boolean,
): SkillDiscoveryItem {
  return {
    id: skillId,
    name: skillId,
    description: '',
    folderPath,
    skillPath,
    hasScripts: false,
    enabled,
    loadStatus: 'error',
  }
}

async function loadSkillMetadata(
  projectPath: string,
  skillsRoot: string,
  folderName: string,
  toggles: Readonly<Record<string, boolean>>,
): Promise<LoadedSkillDefinition> {
  const folderPath = path.join(skillsRoot, folderName)
  const skillPath = path.join(folderPath, 'SKILL.md')
  const skillId = normalizeSkillId(folderName)
  const enabled = toggles[skillId] ?? true
  const hasScripts = await hasScriptsFolder(folderPath)
  const base = createDefaultSkillDefinition(skillId, folderPath, skillPath, enabled)

  try {
    const raw = await readSkillFileWithinProject(projectPath, skillPath)
    const parsed = parseSkillDocument(raw)
    return {
      ...base,
      name: parsed.name,
      description: parsed.description,
      hasScripts,
      loadStatus: 'ok',
    }
  } catch (error) {
    return {
      ...base,
      hasScripts,
      loadError: formatSkillError(projectPath, folderName, error),
    }
  }
}

async function readSkillFileWithinProject(projectPath: string, skillPath: string) {
  const projectRootReal = await resolveRealPath(projectPath)
  const skillRealPath = await resolveRealPath(skillPath)

  if (!isPathInside(projectRootReal, skillRealPath)) {
    throw new Error('SKILL.md resolves outside the project directory (symlink)')
  }

  return fs.readFile(skillRealPath, 'utf8')
}

async function resolveRealPath(targetPath: string) {
  try {
    return await fs.realpath(targetPath)
  } catch (error) {
    if (isEnoent(error)) {
      return path.resolve(targetPath)
    }
    throw error
  }
}

function formatSkillError(_projectPath: string, folderName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return `${folderName}/SKILL.md: ${message}`
}

async function hasScriptsFolder(folderPath: string) {
  const scriptsPath = path.join(folderPath, 'scripts')
  try {
    const stat = await fs.stat(scriptsPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export function normalizeRequestedSkillId(skillId: string): string {
  const canonicalSkillId = skillId.trim().toLowerCase()
  if (!canonicalSkillId) {
    throw new Error('skillId is required')
  }

  if (normalizeSkillId(canonicalSkillId) !== canonicalSkillId) {
    throw new Error(`Invalid skill id "${skillId}". Use lowercase letters, numbers, '-' or '_'.`)
  }

  return canonicalSkillId
}

export function normalizeSkillId(folderName: string): string {
  return normalizeSkillIdValue(folderName)
}

async function readDirectoryEntries(dirPath: string): Promise<Dirent[] | null> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) {
      return null
    }
    throw error
  }
}
