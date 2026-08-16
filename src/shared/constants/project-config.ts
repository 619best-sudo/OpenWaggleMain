/**
 * Single source of truth for the project-local config directory and its
 * resource roots.
 *
 * Everything user- and on-disk-visible lives under `<project>/.turing-machine/`.
 * Keep all path construction for skills/extensions/prompts/themes/settings routed
 * through these constants so a future rename is a one-line change — the previous
 * `.openwaggle` name was hardcoded independently in six files, which is what made
 * it risky to change.
 */

/** The project-local directory the app reads and writes its config under. */
export const PROJECT_CONFIG_DIR = '.turing-machine'

/** Path segments for `<project>/.turing-machine`. */
export const PROJECT_CONFIG_DIR_SEGMENTS = [PROJECT_CONFIG_DIR] as const

/** Path segments for the imported-skills root `<project>/.turing-machine/skills`. */
export const PROJECT_SKILLS_DIR_SEGMENTS = [PROJECT_CONFIG_DIR, 'skills'] as const

/**
 * Path segments for the project-local Pi resource roots. Each resolves to
 * `<project>/.turing-machine/<root>`. Used by the Pi settings/resources layers
 * to declare implicit skill/extension/prompt/theme roots.
 */
export const PROJECT_RESOURCE_ROOT_SEGMENTS = {
  skills: PROJECT_SKILLS_DIR_SEGMENTS,
  extensions: [PROJECT_CONFIG_DIR, 'extensions'] as const,
  prompts: [PROJECT_CONFIG_DIR, 'prompts'] as const,
  themes: [PROJECT_CONFIG_DIR, 'themes'] as const,
} as const
