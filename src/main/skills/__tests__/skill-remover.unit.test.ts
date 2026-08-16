import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { removeSkill } from '../skill-remover'

const tempDirs: string[] = []

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openwaggle-skill-remover-'))
  tempDirs.push(dir)
  return dir
}

async function writeSkill(skillsRoot: string, skillId: string, name: string) {
  const folder = path.join(skillsRoot, skillId)
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(
    path.join(folder, 'SKILL.md'),
    `---\nname: ${name}\ndescription: A skill.\n---\n# ${name}\n`,
    'utf8',
  )
  return folder
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('removeSkill', () => {
  it('deletes a skill folder under .turing-machine/skills', async () => {
    const projectPath = await makeTempProject()
    const openwaggleRoot = path.join(projectPath, '.turing-machine', 'skills')
    const folder = await writeSkill(openwaggleRoot, 'my-skill', 'My Skill')

    await removeSkill(projectPath, 'my-skill')

    await expect(fs.stat(folder)).rejects.toThrow()
  })

  it('refuses to remove a skill that lives under .agents/skills', async () => {
    const projectPath = await makeTempProject()
    const agentsRoot = path.join(projectPath, '.agents', 'skills')
    await writeSkill(agentsRoot, 'curated-skill', 'Curated Skill')

    await expect(removeSkill(projectPath, 'curated-skill')).rejects.toThrow(
      /not in \.turing-machine\/skills/,
    )
    // The folder must still exist — removal was refused.
    await expect(fs.stat(path.join(agentsRoot, 'curated-skill'))).resolves.toBeTruthy()
  })

  it('throws when the skill id is not in the catalog', async () => {
    const projectPath = await makeTempProject()
    await expect(removeSkill(projectPath, 'does-not-exist')).rejects.toThrow(/was not found/)
  })

  it('deletes the correct skill when both .openwaggle and .agents define the same id', async () => {
    // The catalog resolves `.openwaggle` first, so removeSkill must target the
    // .openwaggle copy and leave the .agents copy intact.
    const projectPath = await makeTempProject()
    const openwaggleRoot = path.join(projectPath, '.turing-machine', 'skills')
    const agentsRoot = path.join(projectPath, '.agents', 'skills')
    const openwaggleFolder = await writeSkill(openwaggleRoot, 'shared', 'Shared OW')
    const agentsFolder = await writeSkill(agentsRoot, 'shared', 'Shared Agents')

    await removeSkill(projectPath, 'shared')

    await expect(fs.stat(openwaggleFolder)).rejects.toThrow()
    await expect(fs.stat(agentsFolder)).resolves.toBeTruthy()
  })

  it('removes a skill that has a scripts subfolder', async () => {
    const projectPath = await makeTempProject()
    const openwaggleRoot = path.join(projectPath, '.turing-machine', 'skills')
    const folder = await writeSkill(openwaggleRoot, 'with-scripts', 'With Scripts')
    await fs.mkdir(path.join(folder, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(folder, 'scripts', 'run.sh'), '#!/bin/sh\n', 'utf8')

    await removeSkill(projectPath, 'with-scripts')

    await expect(fs.stat(folder)).rejects.toThrow()
  })
})
