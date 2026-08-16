import { createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript']
})

const html = highlighter.codeToHtml('const x = 1;', {
  lang: 'javascript',
  themes: {
    light: 'github-light',
    dark: 'github-dark'
  }
})
console.log(html)
