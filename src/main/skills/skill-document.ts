interface ParsedSkillDocument {
  readonly name: string
  readonly description: string
  readonly body: string
}

export type { ParsedSkillDocument }

export function parseSkillDocument(markdown: string): ParsedSkillDocument {
  const trimmed = markdown.trimStart()
  const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(trimmed)
  if (!frontmatterMatch) {
    if (!trimmed.startsWith('---')) {
      throw new Error('SKILL.md is missing YAML frontmatter')
    }
    throw new Error('SKILL.md frontmatter closing delimiter is missing')
  }

  const frontmatter = frontmatterMatch[1] ?? ''
  const body = (frontmatterMatch[2] ?? '').trim()
  const fields = parseFrontmatterFields(frontmatter)

  const name = fields.name?.trim()
  const description = fields.description?.trim()
  if (!name) {
    throw new Error('SKILL.md frontmatter requires "name"')
  }
  if (!description) {
    throw new Error('SKILL.md frontmatter requires "description"')
  }

  return { name, description, body }
}

function parseFrontmatterFields(frontmatter: string) {
  const fields: Record<string, string> = {}
  const lines = frontmatter.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    fields[key] = stripQuotes(rawValue)
  }
  return fields
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
