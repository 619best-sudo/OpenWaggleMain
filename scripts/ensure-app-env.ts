/**
 * Guarantee `build/app.env` exists before packaging.
 *
 * `electron-builder.yml` lists it under `extraResources`, and electron-builder
 * hard-fails when an `extraResources` source is missing. Since the file is
 * gitignored (it carries credentials), a fresh clone would otherwise fail to
 * package with an opaque error.
 *
 * This creates an empty, commented placeholder when the file is absent. The app
 * then starts fine and simply has no Google OAuth credentials — sign-in reports
 * a missing secret, which is a clear symptom, rather than the build dying.
 *
 * Never populate this from `.env.local` automatically: that file also holds keys
 * that must not be distributed. Copy across only what the shipped app needs.
 */
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BUILD_DIR = join(__dirname, '..', 'build')
const TARGET = join(BUILD_DIR, 'app.env')
const TEMPLATE = join(BUILD_DIR, 'app.env.example')

if (existsSync(TARGET)) {
  console.log('build/app.env present')
} else if (existsSync(TEMPLATE)) {
  copyFileSync(TEMPLATE, TARGET)
  console.log('build/app.env missing — created from app.env.example (no credentials set)')
} else {
  throw new Error(`Neither ${TARGET} nor ${TEMPLATE} exists; cannot prepare packaged env`)
}
