/**
 * Client HTTP de l'API NOVIA (pilote uniquement). Même origine, cookie de session
 * HttpOnly (illisible par le JavaScript), en-tête anti-CSRF sur toute écriture.
 * Aucune clé, aucun secret côté navigateur.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-novia': '1' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, 'Serveur NOVIA injoignable : vérifiez la connexion.')
  }
  const data = (await r.json().catch(() => ({}))) as { error?: string }
  if (!r.ok) throw new ApiError(r.status, data.error ?? 'Erreur du serveur NOVIA.')
  return data as T
}

export interface Me {
  user: { id: string; displayName: string }
  businesses: { id: string; name: string; role: 'OWNER' | 'PRO' }[]
}
