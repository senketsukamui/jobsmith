/**
 * Generates PNG icon assets from apps/desktop/assets/icon.svg
 * and builds a macOS .icns file using iconutil (macOS built-in).
 *
 * Usage: node scripts/build-icons.mjs
 */

import { Resvg } from '@resvg/resvg-js'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.join(__dirname, '../apps/desktop/assets')
const svgSource = fs.readFileSync(path.join(assetsDir, 'icon.svg'), 'utf-8')

function renderPng(size) {
  const resvg = new Resvg(svgSource, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

function write(filename, buf) {
  fs.writeFileSync(path.join(assetsDir, filename), buf)
  console.log(`  ✓ ${filename} (${buf.length} bytes)`)
}

console.log('\nGenerating PNG assets...')
write('icon.png', renderPng(512))
write('tray-icon.png', renderPng(32))
write('tray-icon@2x.png', renderPng(64))

// macOS .icns — requires iconutil (built into macOS)
if (process.platform === 'darwin') {
  console.log('\nBuilding icon.icns via iconutil...')

  const iconset = path.join(assetsDir, 'icon.iconset')
  fs.mkdirSync(iconset, { recursive: true })

  const sizes = [16, 32, 64, 128, 256, 512, 1024]
  for (const size of sizes) {
    const buf = renderPng(size)
    if (size <= 512) {
      fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), buf)
    }
    // @2x = half the size label (e.g. 32px file = 16@2x)
    if (size >= 32) {
      const label = size / 2
      fs.writeFileSync(path.join(iconset, `icon_${label}x${label}@2x.png`), buf)
    }
  }

  execSync(`iconutil -c icns "${iconset}" -o "${path.join(assetsDir, 'icon.icns')}"`)
  fs.rmSync(iconset, { recursive: true })
  console.log('  ✓ icon.icns')
} else {
  console.log('\nSkipping .icns (macOS only). Run on macOS to generate icon.icns.')
}

console.log('\nDone.')
