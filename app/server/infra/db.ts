/**
 * Accès PostgreSQL (pilote `pg`, standard). Aucune logique métier ici : des transactions.
 *
 * `businessTx` est la SEULE porte d'accès aux données d'une entreprise :
 * - déclare l'entreprise à la base (sécurité au niveau des lignes : sans elle, rien n'est lisible) ;
 * - verrouille la ligne de l'entreprise : les écritures d'une même entreprise sont
 *   sérialisées (deux appareils ne s'écrasent jamais), deux entreprises restent parallèles.
 */
import pg from 'pg'

export type Sql = pg.PoolClient

export interface Db {
  pool: pg.Pool
  tx<T>(work: (c: Sql) => Promise<T>): Promise<T>
  businessTx<T>(businessId: string, work: (c: Sql) => Promise<T>): Promise<T>
  /** lecture transversale minimale de l'ordonnanceur (business_id, clé, échéance), jamais de données */
  schedulerTx<T>(work: (c: Sql) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export class BusinessNotFound extends Error {}

export function createDb(connectionString: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 5 })
  async function tx<T>(work: (c: Sql) => Promise<T>): Promise<T> {
    const c = await pool.connect()
    try {
      await c.query('begin')
      const r = await work(c)
      await c.query('commit')
      return r
    } catch (e) {
      await c.query('rollback').catch(() => undefined)
      throw e
    } finally {
      c.release()
    }
  }
  return {
    pool,
    tx,
    businessTx: (businessId, work) =>
      tx(async (c) => {
        await c.query(`select set_config('novia.business_id', $1, true)`, [businessId])
        const r = await c.query('select id from businesses where id = $1 for update', [businessId])
        if (!r.rowCount) throw new BusinessNotFound(businessId)
        return work(c)
      }),
    schedulerTx: (work) =>
      tx(async (c) => {
        await c.query(`select set_config('novia.scope', 'scheduler', true)`)
        return work(c)
      }),
    close: () => pool.end(),
  }
}
