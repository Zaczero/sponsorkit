import { Buffer } from 'node:buffer'
import { $fetch } from 'ofetch'
import DatauriParser from 'datauri/parser'
import sharp from 'sharp'
import { consola } from 'consola'
import type { SponsorkitConfig, Sponsorship } from './types'

export async function resolveAvatars(
  ships: Sponsorship[],
  getFallbackAvatar: SponsorkitConfig['fallbackAvatar'],
  t = consola,
) {
  const fallbackAvatar = await (() => {
    if (typeof getFallbackAvatar === 'string')
      return $fetch(getFallbackAvatar, { responseType: 'arrayBuffer' })
    if (getFallbackAvatar)
      return getFallbackAvatar
    return undefined
  })()

  const fallbackDataUri = fallbackAvatar && pngToDataUri(await round(fallbackAvatar, 0.5, 100))

  return Promise.all(ships.map(async (ship) => {
    const data = ship.privacyLevel === 'PRIVATE'
      ? fallbackAvatar
      : await $fetch(ship.sponsor.avatarUrl, { responseType: 'arrayBuffer' })
        .catch((e) => {
          t.error(`Failed to fetch avatar for ${ship.sponsor.login || ship.sponsor.name} [${ship.sponsor.avatarUrl}]`)
          t.error(e)
          if (fallbackAvatar)
            return fallbackAvatar
          throw e
        })

    if (ship.privacyLevel === 'PRIVATE' && fallbackDataUri)
      ship.sponsor.avatarUrl = fallbackDataUri

    if (data) {
      const radius = ship.sponsor.type === 'Organization' ? 0.1 : 0.5
      ship.sponsor.avatarUrlHighRes = pngToDataUri(await round(data, radius, 120))
      ship.sponsor.avatarUrlMediumRes = pngToDataUri(await round(data, radius, 80))
      ship.sponsor.avatarUrlLowRes = pngToDataUri(await round(data, radius, 50))
    }
  }))
}

function toBuffer(ab: ArrayBuffer) {
  const buf = Buffer.alloc(ab.byteLength)
  const view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i)
    buf[i] = view[i]

  return buf
}

export async function round(image: string | ArrayBuffer, radius = 0.5, size = 100) {
  const rect = Buffer.from(
    `<svg><rect x="0" y="0" width="${size}" height="${size}" rx="${size * radius}" ry="${size * radius}"/></svg>`,
  )

  return await sharp(typeof image === 'string' ? image : toBuffer(image))
    .resize(size, size, { fit: sharp.fit.cover })
    .composite([{
      blend: 'dest-in',
      input: rect,
      density: 72,
    }])
    .png({ quality: 80, compressionLevel: 8 })
    .toBuffer()
}

export function svgToPng(svg: string) {
  return sharp(Buffer.from(svg), { density: 150 })
    .png({ quality: 90 })
    .toBuffer()
}

const parser = new DatauriParser()

function pngToDataUri(png: Buffer) {
  return parser.format('.png', png).content
}
