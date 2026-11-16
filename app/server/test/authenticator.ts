/**
 * Authentificateur WebAuthn LOGICIEL pour les tests : une vraie paire de clés P-256, de
 * vraies signatures, vérifiées par la même bibliothèque que la production. (Les tests du
 * navigateur utilisent l'authentificateur virtuel de Chromium.)
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest()

/** CBOR minimal : entiers, octets, textes, tableaux d'objets (map). */
function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
    throw new Error('trop grand')
  }
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)])
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v])
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])])
  throw new Error('type CBOR non géré')
}

export function createAuthenticator(origin: string, rpId: string) {
  let key: { id: Buffer; privateKey: KeyObject; counter: number } | undefined

  return {
    /** navigator.credentials.create() */
    register(options: { challenge: string }) {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
      const id = randomBytes(16)
      key = { id, privateKey, counter: 0 }
      const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]))
      const authData = Buffer.concat([sha(rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), Buffer.from([0, id.length]), id, cose])
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }))
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        response: { clientDataJSON: b64(clientData), attestationObject: b64(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))), transports: ['internal'] },
        clientExtensionResults: {},
      }
    },
    /** navigator.credentials.get() */
    login(options: { challenge: string }, overrideOrigin = origin) {
      if (!key) throw new Error('aucune passkey')
      key.counter++
      const counter = Buffer.alloc(4)
      counter.writeUInt32BE(key.counter)
      const authData = Buffer.concat([sha(rpId), Buffer.from([0x05]), counter])
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: overrideOrigin, crossOrigin: false }))
      const signature = sign('sha256', Buffer.concat([authData, sha(clientData)]), key.privateKey)
      return {
        id: b64(key.id),
        rawId: b64(key.id),
        type: 'public-key',
        response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData), signature: b64(signature) },
        clientExtensionResults: {},
      }
    },
  }
}
