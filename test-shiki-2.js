import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript']
})

const hast = highlighter.codeToHast('const x = 1;', {
  lang: 'javascript',
  themes: {
    light: 'github-light',
    dark: 'github-dark'
  }
})
console.log(JSON.stringify(hast.children[0].children[0].properties))
