import { useCallback, useState, type CSSProperties } from 'react'
import { galleryById, galleryCategories, lengthLabels, shapeLabels } from '../config/content.demo'
import type { GalleryItem } from '../config/schema'
import { defaultWidth, mediaUrl, objectPosition, resolveMedia, srcSet } from '../media/media'
import type { MediaAsset } from '../media/types'
import { Icon } from './Icon'

const categoryLabel = (id: GalleryItem['category']) => galleryCategories.find((c) => c.id === id)?.label ?? ''

interface PhotoProps {
  /** visuel de galerie */
  item?: GalleryItem
  /** identifiant d'un visuel de galerie */
  imageId?: string
  /**
   * Emplacement(s) média à essayer dans l'ordre (ex. ['hero', 'g-pose-01']).
   * Par défaut : l'identifiant du visuel de galerie.
   */
  media?: string | readonly (string | undefined)[]
  /** texte alternatif si le visuel n'est pas un visuel de galerie */
  alt?: string
  className?: string
  /** chargement immédiat (au-dessus de la ligne de flottaison) */
  eager?: boolean
  /** image principale de l'écran (LCP) : chargement prioritaire */
  priority?: boolean
  /** largeur affichée, pour le choix de la taille servie */
  sizes?: string
  /** affiche la mention « Visuel fictif » si le visuel n'est pas une réalisation réelle */
  provenanceBadge?: boolean
  /** libellé du placeholder si aucun visuel n'est fourni */
  placeholderLabel?: string
}

/**
 * Visuel issu du pipeline médias (AVIF/WebP, point focal, aperçu flou), sinon
 * emplacement clairement identifié « Visuel à fournir ».
 */
export function Photo({
  item,
  imageId,
  media,
  alt,
  className = '',
  eager,
  priority,
  sizes = '(min-width: 720px) 50vw, 100vw',
  provenanceBadge,
  placeholderLabel,
}: PhotoProps) {
  const g = item ?? (imageId ? galleryById(imageId) : undefined)
  const ids = media ?? [g?.id]
  const asset = resolveMedia(ids)
  const text = alt ?? g?.alt ?? ''

  // `src` explicite dans la configuration : prioritaire, servi tel quel.
  if (g?.src && !media) {
    return (
      <div className={`photo is-loaded ${className}`}>
        <img src={g.src} alt={text} loading={eager || priority ? 'eager' : 'lazy'} decoding="async" />
      </div>
    )
  }
  if (asset) {
    return (
      <MediaImage
        asset={asset}
        alt={text}
        className={className}
        eager={eager || priority}
        priority={priority}
        sizes={sizes}
        provenanceBadge={provenanceBadge}
      />
    )
  }
  const label =
    placeholderLabel ?? (g ? `Visuel à fournir · ${categoryLabel(g.category)} · ${shapeLabels[g.shape]} ${lengthLabels[g.length].toLowerCase()}` : 'Visuel à fournir')
  return (
    <div className={`photo photo--ph ${className}`} role="img" aria-label={text ? `Emplacement photo : ${text}` : 'Emplacement photo'}>
      <Icon name="camera" size={26} className="photo__ph-icon" />
      <div className="photo__ph-label">
        <span>{label}</span>
      </div>
    </div>
  )
}

function MediaImage({
  asset,
  alt,
  className,
  eager,
  priority,
  sizes,
  provenanceBadge,
}: {
  asset: MediaAsset
  alt: string
  className: string
  eager?: boolean
  priority?: boolean
  sizes: string
  provenanceBadge?: boolean
}) {
  const [loadedKey, setLoadedKey] = useState('')
  const key = `${asset.id}.${asset.hash}`
  const loaded = loadedKey === key
  // Image déjà en cache : `load` peut avoir eu lieu avant l'attachement du gestionnaire.
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth > 0) setLoadedKey(key)
    },
    [key],
  )
  const style = {
    '--tone': asset.alpha ? 'transparent' : asset.tone,
    '--lqip': `url("${asset.lqip}")`,
    '--focal': objectPosition(asset),
  } as CSSProperties

  return (
    <div className={`photo photo--media ${loaded ? 'is-loaded' : ''} ${className}`} style={style} data-alpha={asset.alpha || undefined}>
      <picture>
        <source type="image/avif" srcSet={srcSet(asset, 'avif')} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet(asset, 'webp')} sizes={sizes} />
        <img
          ref={ref}
          src={mediaUrl(asset, defaultWidth(asset), asset.fallback)}
          srcSet={srcSet(asset, asset.fallback)}
          sizes={sizes}
          width={asset.width}
          height={asset.height}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : undefined}
          onLoad={() => setLoadedKey(key)}
        />
      </picture>
      {provenanceBadge && asset.provenance === 'fictif' && <span className="photo__prov">Visuel fictif</span>}
    </div>
  )
}
