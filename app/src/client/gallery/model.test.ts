import { describe, expect, it } from 'vitest'
import { gallery } from '../../config/content.demo'
import { serviceById } from '../../config/services.demo'
import { bookingHref, categoriesWithCount, distinct, filterGallery, noFilters, parseGalleryParams, viewerList } from './model'

describe('galerie · modèle', () => {
  it('lit la vue et la catégorie dans l’URL, en ignorant les valeurs inconnues', () => {
    expect(parseGalleryParams(new URLSearchParams(''))).toEqual({ view: 'portfolio', cat: 'all' })
    expect(parseGalleryParams(new URLSearchParams('vue=grille&cat=french'))).toEqual({ view: 'grille', cat: 'french' })
    expect(parseGalleryParams(new URLSearchParams('vue=x&cat=inconnue'))).toEqual({ view: 'portfolio', cat: 'all' })
  })

  it('filtre par catégorie et ne propose que les catégories présentes', () => {
    expect(filterGallery(gallery, noFilters)).toHaveLength(gallery.length)
    const french = filterGallery(gallery, { ...noFilters, cat: 'french' })
    expect(french.length).toBeGreaterThan(0)
    expect(french.every((g) => g.category === 'french')).toBe(true)
    const cats = categoriesWithCount(gallery)
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(gallery.length)
    expect(cats.every((c) => c.count > 0)).toBe(true)
  })

  it('liste les valeurs distinctes d’un critère', () => {
    const shapes = distinct(gallery, 'shape')
    expect(new Set(shapes).size).toBe(shapes.length)
    expect(shapes.length).toBeGreaterThan(0)
  })

  it('la visionneuse parcourt la sélection filtrée seulement si elle contient la pose ouverte', () => {
    const french = filterGallery(gallery, { ...noFilters, cat: 'french' })
    expect(viewerList(gallery, french, french[0].id)).toBe(french)
    const other = gallery.find((g) => g.category !== 'french')!
    expect(viewerList(gallery, french, other.id)).toBe(gallery)
  })

  it('« Je veux cette pose » mène à une prestation existante avec la pose en inspiration', () => {
    for (const g of gallery) {
      const url = new URL(bookingHref(g), 'https://demo.local')
      expect(url.pathname).toBe('/reserver')
      expect(serviceById(url.searchParams.get('service')!)).toBeDefined()
      expect(url.searchParams.get('inspiration')).toBe(g.id)
    }
  })
})
