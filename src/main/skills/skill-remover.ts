import fs from 'node:fs/promises'
import path from 'node:path'
import { isEnoent } from '@shared/utils/node-error'
import { isPathInside } from '../utils/paths'
import { loadSkillCatalog } from './skill-catalog'

/**
 * Permanently delete a skill folder from a project.
 *
 * Removal is restricted to `<projectPath>/.openwaggle/skills/<id>` — the same
 * directory the importer writes to — so repo-curated skills under
 * `<projectPath>/.agents/skills` (which may be version-controlled) cannot be
 * deleted from the UI. The folder is located via the catalog (which honors the
 * `.openwaggle`-wins precedence), then realpath-resolved and bounded inside the
 * project's `.openwaggle/skills` root before any filesystem mutation, so a
 * symlinked folder cannot escape and delete files outside the project.
 *
 * Throws if the skill is not found, or if it resolves to a location that is not
 * under `.openwaggle/skills`.
 */
export async function removeSkill(projectPath: string, skillId: string): Promise<void> {
  const catalog = await loadSkillCatalog(projectPath, {})
  const skill = catalog.skills.find((entry) => entry.id === skillId)
  if (!skill) {
    throw new Error(`Skill "${skillId}" was not found.`)
  }

  const openwaggleSkillsRoot = await resolveRealPath(
    path.join(projectPath, '.openwaggle', 'skills'),
  )
  const folderRealPath = await resolveRealPath(skill.folderPath)

  if (!isPathInside(openwaggleSkillsRoot, folderRealPath)) {
    throw new Error(
      `Skill "${skillId}" is not in .openwaggle/skills and cannot be removed from here. ` +
        'Repo-curated skills under .agents/skills must be removed from the filesystem directly.',
    )
  }

  // Guard against the resolved path being the skills root itself (a degenerate
  // catalog entry), which `fs.rm({ recursive: true })` would happily honor and
  // wipe the whole skills directory.
  if (folderRealPath === openwaggleSkillsRoot) {
    throw new Error(`Refusing to remove the skills root directory.`)
  }

  await fs.rm(folderRealPath, { recursive: true, force: true })
}

async function resolveRealPath(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath)
  } catch (error) {
    if (isEnoent(error)) {
      return path.resolve(targetPath)
    }
    throw error
  }
}
