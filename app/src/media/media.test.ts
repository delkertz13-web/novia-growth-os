import { describe, expect, it } from 'vitest'
import { gallery } from '../demo/config/content'
import { defaultWidth, hasFictionalMedia, heroSlots, mediaUrl, objectPosition, resolveMedia, srcSet } from './media'
import type { MediaAsset, MediaManifest } from './types'

const asset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  group: 'gallery',
  width: 1500,
  height: 2000,
  alpha: false,
  hash: 'abc12345',
  widths: [480, 960, 1500],
  fallback: 'jpg',
  focal: [0.5, 0.5],
  tone: '#7a5a4f',
  lqip: 'data:image/webp;base64,AAAA',
  provenance: 'fictif',
  ...over,
})

const make = (assets: MediaAsset[], def: 'fictif' | 'reel' = 'fictif'): MediaManifest => ({
  version: 1,
  provenance: { default: def, note: 'note' },
  assets: Object.fromEntries(assets.map((a) => [a.id, a])),
})

describe('médias', () => {
  it('construit des URL versionnées par empreinte et des srcset par largeur', () => {
    const a = asset('g-pose-01')
    expect(mediaUrl(a, 960, 'avif')).toBe('/media/g-pose-01.abc12345-960.avif')
    expect(srcSet(a, 'webp')).toBe(
      '/media/g-pose-01.abc12345-480.webp 480w, /media/g-pose-01.abc12345-960.webp 960w, /media/g-pose-01.abc12345-1500.webp 1500w',
    )
  })

  it('sert par défaut la taille la plus proche de 960 px', () => {
    expect(defaultWidth(asset('a'))).toBe(960)
    expect(defaultWidth(asset('b', { widths: [480, 700] }))).toBe(700)
  })

  it('convertit le point focal en object-position borné', () => {
    expect(objectPosition({ focal: [0.3, 0.25] })).toBe('30% 25%')
    expect(objectPosition({ focal: [-1, 4] })).toBe('0% 100%')
  })

  it('prend le premier emplacement disponible (Hero, puis visuel de galerie)', () => {
    const m = make([asset('g-pose-01')])
    expect(resolveMedia([heroSlots.photo, 'g-pose-01'], m)?.id).toBe('g-pose-01')
    expect(resolveMedia([heroSlots.photo], m)).toBeUndefined()
    const withHero = make([asset('g-pose-01'), asset('hero', { group: 'hero' })])
    expect(resolveMedia([heroSlots.photo, 'g-pose-01'], withHero)?.id).toBe('hero')
  })

  it('signale la provenance fictive tant qu’un visuel du groupe est fictif', () => {
    expect(hasFictionalMedia('gallery', make([asset('a', { provenance: 'reel' })]))).toBe(false)
    expect(hasFictionalMedia('gallery', make([asset('a', { provenance: 'reel' }), asset('b')]))).toBe(true)
    expect(hasFictionalMedia('gallery', make([asset('h', { group: 'hero' })]))).toBe(false)
    expect(hasFictionalMedia(undefined, make([]))).toBe(false)
  })

  it('les identifiants de galerie sont uniques et ne heurtent pas les emplacements du Hero', () => {
    const ids = gallery.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(heroSlots.photo)
    expect(ids).not.toContain(heroSlots.cutout)
  })
})
