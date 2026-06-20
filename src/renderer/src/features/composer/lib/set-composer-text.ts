import { useComposerStore } from '../state/composer-store'
import { setEditorText } from './lexical-utils'

export function replaceComposerText(text: string) {
  const composer = useComposerStore.getState()
  composer.setInput(text)
  composer.setCursorIndex(text.length)
  if (composer.lexicalEditor) {
    setEditorText(composer.lexicalEditor, text)
  }
}
