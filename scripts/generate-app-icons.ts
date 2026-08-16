/**
 * Regenerate every app icon from a single source image.
 *
 *   pnpm tsx scripts/generate-app-icons.ts [--bg=blue|white|navy|dark]
 *
 * Source of truth is `src/assets/new-logo.png` — the same file the sidebar
 * renders (`SidebarNavigation.tsx`), so the OS icon and the in-app logo can't
 * drift apart. Change that file and re-run this; don't hand-edit the outputs.
 *
 * ## Why this composites instead of just resizing
 *
 * The raw logo is a transparent-background portrait whose art fills 99.4% of
 * its canvas height. Handed straight to the OS that gives two defects:
 *
 *   1. No background — the dock shows a floating silhouette, not an app icon.
 *   2. Oversized — macOS expects the icon body to occupy 824 of 1024 points
 *      (80.5%) with transparent margin around it. Art that reaches the canvas
 *      edge renders visibly larger than every neighbouring dock icon.
 *
 * So the icon is composed: an 824x824 rounded-square body centred in a 1024
 * canvas, with the portrait inset inside it. That is Apple's macOS app-icon
 * grid, and it makes the icon sit at the same visual size as its neighbours.
 *
 * Produces:
 *   build/icon.png    1024x1024 — Linux target + runtime dock/window icon
 *   build/icon.icns             — macOS, via iconutil from a full iconset
 *   build/icon.ico              — Windows/NSIS, 7 sizes
 *   src/renderer/favicon*       — referenced by index.html
 *
 * macOS-only: needs `iconutil`.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const REPO_ROOT = join(__dirname, '..')
const SOURCE = join(REPO_ROOT, 'src/assets/new-logo.png')
const BUILD_DIR = join(REPO_ROOT, 'build')
const RENDERER_DIR = join(REPO_ROOT, 'src/renderer')

/** Apple's macOS app-icon grid, in points on a 1024 canvas. */
const CANVAS = 1024
const BODY = 824
const BODY_OFFSET = (CANVAS - BODY) / 2
const CORNER_RADIUS = 185.4
/** Portrait height as a fraction of the body — leaves breathing room inside. */
const ART_SCALE = 0.86

/**
 * Background treatments. The portrait is mostly dark (black outline, dark hair
 * and suit) with a light face, so a near-black background makes the silhouette
 * disappear and leaves a floating face — `dark` is included for completeness
 * but is the weakest choice for this artwork.
 */
const BACKGROUNDS = {
  blue: { top: '#2563eb', bottom: '#1d4ed8' },
  white: { top: '#ffffff', bottom: '#eef1f6' },
  navy: { top: '#1e293b', bottom: '#0f172a' },
  dark: { top: '#1c1f24', bottom: '#141619' },
} as const

type BackgroundName = keyof typeof BACKGROUNDS

const ICONSET: readonly [number, string][] = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
]

/** Sizes packed into the .ico. 256 is the largest Windows renders. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const

function bodySvg(background: BackgroundName): Buffer {
  const { top, bottom } = BACKGROUNDS[background]
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${top}"/>
          <stop offset="1" stop-color="${bottom}"/>
        </linearGradient>
      </defs>
      <rect x="${BODY_OFFSET}" y="${BODY_OFFSET}" width="${BODY}" height="${BODY}"
            rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="url(#g)"/>
    </svg>`,
  )
}

/**
 * Build the master 1024 icon: rounded-square body, portrait inset and centred.
 *
 * The portrait is trimmed to its opaque bounding box first — otherwise the
 * source's own transparent margin would stack on top of the grid margin and
 * shrink the art below the intended size.
 */
async function composeMaster(background: BackgroundName): Promise<Buffer> {
  const artHeight = Math.round(BODY * ART_SCALE)
  const art = await sharp(SOURCE)
    .trim()
    .resize({ height: artHeight, kernel: 'lanczos3', fit: 'inside' })
    .png()
    .toBuffer()
  const artMeta = await sharp(art).metadata()

  return sharp(bodySvg(background))
    .composite([
      {
        input: art,
        left: Math.round((CANVAS - (artMeta.width ?? artHeight)) / 2),
        top: Math.round((CANVAS - (artMeta.height ?? artHeight)) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Downscale the master. Small sizes stay legible because the body anchors them. */
function render(master: Buffer, size: number): Promise<Buffer> {
  if (size === CANVAS) return Promise.resolve(master)
  return sharp(master).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
}

/**
 * Pack PNGs into an ICO container: 6-byte header, one 16-byte directory entry
 * per image, then the PNG payloads verbatim (Windows Vista+ accepts PNG entries).
 */
function buildIco(images: readonly { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length
  images.forEach((image, index) => {
    const entry = 16 * index
    // 256 is encoded as 0 — the field is a single byte.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 0)
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(image.data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.data)])
}

function parseBackground(): BackgroundName {
  const flag = process.argv.find((arg) => arg.startsWith('--bg='))?.slice('--bg='.length)
  if (!flag) return 'white'
  if (!(flag in BACKGROUNDS)) {
    throw new Error(`Unknown --bg=${flag}. Options: ${Object.keys(BACKGROUNDS).join(', ')}`)
  }
  return flag as BackgroundName
}

async function main() {
  const background = parseBackground()
  console.log(`source:     ${SOURCE}`)
  console.log(`background: ${background}`)
  console.log(`grid:       ${BODY}/${CANVAS} body (${((100 * BODY) / CANVAS).toFixed(1)}%), art ${ART_SCALE * 100}% of body`)

  const master = await composeMaster(background)

  writeFileSync(join(BUILD_DIR, 'icon.png'), master)
  console.log('wrote build/icon.png (1024x1024)')

  const iconsetDir = join(BUILD_DIR, 'icon.iconset')
  rmSync(iconsetDir, { recursive: true, force: true })
  mkdirSync(iconsetDir, { recursive: true })
  for (const [size, filename] of ICONSET) {
    writeFileSync(join(iconsetDir, filename), await render(master, size))
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', join(BUILD_DIR, 'icon.icns')])
  rmSync(iconsetDir, { recursive: true, force: true })
  console.log(`wrote build/icon.icns (${ICONSET.length} representations)`)

  const icoImages = []
  for (const size of ICO_SIZES) {
    icoImages.push({ size, data: await render(master, size) })
  }
  writeFileSync(join(BUILD_DIR, 'icon.ico'), buildIco(icoImages))
  console.log(`wrote build/icon.ico (${ICO_SIZES.join(', ')})`)

  writeFileSync(join(RENDERER_DIR, 'favicon-16.png'), await render(master, 16))
  writeFileSync(join(RENDERER_DIR, 'favicon-32.png'), await render(master, 32))
  writeFileSync(
    join(RENDERER_DIR, 'favicon.ico'),
    buildIco([
      { size: 16, data: await render(master, 16) },
      { size: 32, data: await render(master, 32) },
      { size: 48, data: await render(master, 48) },
    ]),
  )
  console.log('wrote src/renderer/favicon-16.png, favicon-32.png, favicon.ico')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
