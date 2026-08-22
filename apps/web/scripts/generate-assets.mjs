/**
 * Génère toutes les images de l'application depuis les sources vectorielles.
 *
 * §3.2 impose un « jeu d'icônes complet » et des écrans de démarrage iOS. Les
 * produire à la main garantit d'en oublier un et de les voir diverger. Ils sont
 * donc dérivés d'un seul SVG, et régénérables par `pnpm generate:assets`.
 *
 * Les PNG produits sont versionnés : la CI ne doit pas dépendre de sharp pour
 * construire l'application.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, '..', 'assets')
const publicDir = join(here, '..', 'public')
const iconsDir = join(publicDir, 'icons')
const splashDir = join(publicDir, 'splash')

/** Couleur de fond, identique à `--color-slate-board` et au manifeste. */
const BACKGROUND = '#0b1220'

const ICONS = [
  { source: 'icon.svg', size: 192, file: 'icon-192.png' },
  { source: 'icon.svg', size: 512, file: 'icon-512.png' },
  // Android recadre : le dessin tient dans la zone sûre de 80 %.
  { source: 'icon-maskable.svg', size: 512, file: 'icon-maskable-512.png' },
  // iOS n'applique pas de masque et n'accepte pas la transparence : l'icône
  // est pleine, le système arrondit lui-même les coins.
  { source: 'icon.svg', size: 180, file: 'apple-touch-icon-180.png' },
  { source: 'icon.svg', size: 64, file: 'favicon-64.png' },
]

/**
 * Écrans de démarrage iOS — §3.2.
 *
 * iOS n'a pas d'équivalent au splash généré automatiquement par Android :
 * chaque taille d'écran demande son image, sélectionnée par une media query.
 * Sans elles, l'ouverture depuis l'écran d'accueil affiche un écran blanc.
 *
 * `width` et `height` sont en points CSS, `ratio` est le device-pixel-ratio :
 * c'est ce triplet que la media query interroge.
 */
const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3, label: 'iPhone 16 Pro Max' },
  { width: 430, height: 932, ratio: 3, label: 'iPhone 15/16 Plus, 14 Pro Max' },
  { width: 402, height: 874, ratio: 3, label: 'iPhone 16 Pro' },
  { width: 393, height: 852, ratio: 3, label: 'iPhone 14/15/16 Pro' },
  { width: 428, height: 926, ratio: 3, label: 'iPhone 12/13/14 Pro Max' },
  { width: 390, height: 844, ratio: 3, label: 'iPhone 12/13/14' },
  { width: 375, height: 812, ratio: 3, label: 'iPhone X/XS/11 Pro, 13 mini' },
  { width: 414, height: 896, ratio: 3, label: 'iPhone XS Max/11 Pro Max' },
  { width: 414, height: 896, ratio: 2, label: 'iPhone XR/11' },
  { width: 414, height: 736, ratio: 3, label: 'iPhone 8 Plus' },
  { width: 375, height: 667, ratio: 2, label: 'iPhone 8/SE 2e-3e gén.' },
  { width: 768, height: 1024, ratio: 2, label: 'iPad 9.7"' },
  { width: 820, height: 1180, ratio: 2, label: 'iPad Air 10.9"' },
  { width: 1024, height: 1366, ratio: 2, label: 'iPad Pro 12.9"' },
]

export const splashFileName = (screen) =>
  `splash-${screen.width}x${screen.height}@${screen.ratio}x.png`

async function generateIcons() {
  await mkdir(iconsDir, { recursive: true })
  for (const icon of ICONS) {
    const buffer = await sharp(join(assets, icon.source))
      .resize(icon.size, icon.size)
      // Aplatir sur le fond : iOS refuse la transparence, et une icône
      // maskable transparente laisse apparaître des coins vides.
      .flatten({ background: BACKGROUND })
      .png({ compressionLevel: 9 })
      .toBuffer()
    await writeFile(join(iconsDir, icon.file), buffer)
    console.log(`icône  ${icon.file.padEnd(28)} ${icon.size}×${icon.size}`)
  }
}

async function generateSplashScreens() {
  await mkdir(splashDir, { recursive: true })

  for (const screen of SPLASH_SCREENS) {
    const pixelWidth = screen.width * screen.ratio
    const pixelHeight = screen.height * screen.ratio

    // Le logo occupe un tiers de la plus petite dimension : assez présent pour
    // ne pas paraître perdu, assez discret pour ne pas paraître pixellisé.
    const logoSize = Math.round(Math.min(pixelWidth, pixelHeight) / 3)
    const logo = await sharp(join(assets, 'icon.svg')).resize(logoSize, logoSize).png().toBuffer()

    const buffer = await sharp({
      create: {
        width: pixelWidth,
        height: pixelHeight,
        channels: 4,
        background: BACKGROUND,
      },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toBuffer()

    const file = splashFileName(screen)
    await writeFile(join(splashDir, file), buffer)
    console.log(`splash ${file.padEnd(28)} ${screen.label}`)
  }

  // Les balises correspondantes, à coller dans index.html. Les générer évite
  // qu'une image existe sans sa media query, ou l'inverse.
  const tags = SPLASH_SCREENS.map((screen) => {
    const media =
      `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) ` +
      `and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`
    return `    <link rel="apple-touch-startup-image" media="${media}" href="/splash/${splashFileName(screen)}" />`
  }).join('\n')

  await writeFile(join(here, 'splash-tags.generated.html'), `${tags}\n`)
  console.log(`\nBalises écrites dans scripts/splash-tags.generated.html`)
}

await generateIcons()
await generateSplashScreens()
