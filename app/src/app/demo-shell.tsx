/**
 * Habillage NOVIA_MODE=demo : bandeau DÉMO, mode présentation, et remontage complet des
 * écrans après une réinitialisation. Absent du build pilote.
 */
import { Outlet } from 'react-router-dom'
import { DemoBanner, useResetEpoch } from '../demo/ui/DemoBanner'

export function Shell() {
  const epoch = useResetEpoch()
  return (
    <>
      <DemoBanner />
      {/* Après une réinitialisation de la démo, les écrans repartent de zéro (aucun état résiduel). */}
      <Outlet key={epoch} />
    </>
  )
}
