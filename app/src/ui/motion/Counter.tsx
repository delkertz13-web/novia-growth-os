import { useCountUp } from '.'

/**
 * Montant ou compteur qui défile jusqu'à sa valeur. Le lecteur d'écran n'entend que
 * la valeur finale.
 */
export function Counter({ value, format = (n) => String(Math.round(n)), fromZero }: { value: number; format?: (n: number) => string; fromZero?: boolean }) {
  const shown = useCountUp(value, { fromZero })
  return (
    <span className="counter">
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
