import { useEffect, useRef, type CSSProperties } from 'react'
import { mediaUrl, resolveMedia } from '../../media/media'
import { Photo } from '../../ui/common'
import { useReducedMotion } from '../../ui/motion'

/**
 * Fond persistant de la réservation : la pose choisie (ou la prestation) reste
 * présente sous toutes les étapes. Trois plans, jamais démontés d'une étape à l'autre :
 *   photo nette · copie 480 px floutée une fois pour toutes · voile.
 * L'étape (data-step sur .bk) règle par CSS le cadrage, le flou (opacité de la copie
 * floutée) et l'assombrissement ; seuls transform et opacity changent.
 * Au scroll, une légère parallaxe (--sy) fait reculer la photo derrière les surfaces.
 */
export function Scene({ ids, vtName }: { ids: readonly string[]; vtName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const asset = resolveMedia(ids)

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    let frame = 0
    const write = () => {
      frame = 0
      el.style.setProperty('--sy', Math.min(window.scrollY, 600).toFixed(0))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    write()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduce])

  const w = asset?.widths[0]
  return (
    <div className="bk-scene" ref={ref} aria-hidden="true">
      <div className="bk-scene__img" style={vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined}>
        <Photo key={asset?.id} media={ids} alt="" eager sizes="100vw" />
      </div>
      {asset && w && (
        <div className="bk-scene__blur" key={`b-${asset.id}`}>
          <picture>
            <source type="image/avif" srcSet={mediaUrl(asset, w, 'avif')} />
            <source type="image/webp" srcSet={mediaUrl(asset, w, 'webp')} />
            <img src={mediaUrl(asset, w, asset.fallback)} alt="" decoding="async" />
          </picture>
        </div>
      )}
      <div className="bk-scene__shade" />
    </div>
  )
}
