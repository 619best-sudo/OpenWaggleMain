import { describe, expect, it } from 'vitest'
import { looksLikeMachinePlanText } from '../machine-plan-detection'

describe('looksLikeMachinePlanText', () => {
  const completePlan =
    '{"goal":"Build the page","tasks":[{"id":"t1","title":"Do it","prompt":"Create index.html"}]}'

  it('recognizes a complete plan JSON object', () => {
    expect(looksLikeMachinePlanText(completePlan)).toBe(true)
  })

  it('recognizes a plan inside a ```json fence', () => {
    expect(looksLikeMachinePlanText(`\`\`\`json\n${completePlan}\n\`\`\``)).toBe(true)
  })

  it('recognizes a plan whose fence has not closed yet (streaming)', () => {
    expect(looksLikeMachinePlanText('```json\n{"goal":"Build the page"')).toBe(true)
  })

  it('recognizes a partial plan as soon as the goal key streams', () => {
    expect(looksLikeMachinePlanText('{"goal":"Build the pa')).toBe(true)
  })

  it('recognizes a partial plan once the tasks key appears', () => {
    expect(looksLikeMachinePlanText('{"summary":"x","tasks":[{"id":"t1"')).toBe(true)
  })

  it('ignores ordinary prose', () => {
    expect(looksLikeMachinePlanText('Here is my plan: first we will edit the file.')).toBe(false)
  })

  it('ignores unrelated JSON objects', () => {
    expect(looksLikeMachinePlanText('{"foo":1,"bar":"baz"}')).toBe(false)
  })

  it('ignores empty text', () => {
    expect(looksLikeMachinePlanText('')).toBe(false)
  })
})
