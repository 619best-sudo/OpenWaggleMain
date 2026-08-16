import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript']
})

try {
  const tokens = highlighter.codeToTokensBase('const x = 1;', {
    lang: 'javascript',
    themes: {
      light: 'github-light',
      dark: 'github-dark'
    }
  })
  console.log(tokens[0])
} catch (e) {
  console.error(e.message)
}
