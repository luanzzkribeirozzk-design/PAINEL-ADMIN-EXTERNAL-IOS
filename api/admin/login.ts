import { db, Timestamp } from '../_lib/firebaseAdmin.js'
import { assertOrigin, audit, clientIP, clearLoginRateLimit, deviceId, errorStatus, hashKey, hashValue, json, loginRateLimit, normalizeKey, setSession } from '../_lib/adminSecurity.js'
import { buildDashboard } from '../_lib/adminDashboard.js'

type Request = { method?: string; body: unknown; headers: Record<string, string | string[] | undefined> }
type Response = { setHeader: (name: string, value: string | string[]) => void; status: (code: number) => { json: (body: unknown) => void } }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return json(res, 405, { error: 'MÉTODO_NÃO_PERMITIDO' })
  try {
    assertOrigin(req)
    if (!db) throw new Error('BACKEND_NOT_CONFIGURED')
    const body = typeof req.body === 'string' ? JSON.parse(req.body) as Record<string, unknown> : req.body as Record<string, unknown>
    const rawKey = normalizeKey(body?.key)
    const rawDevice = deviceId(req)
    if (!rawKey || rawKey.length < 8 || !rawDevice) throw new Error('DADOS_INVALIDOS')
    const rateKey = `${clientIP(req)}:${hashValue('login-key', rawKey)}`
    await loginRateLimit(rateKey)
    const matches = await db.collection('adminAccess').where('keyHash', '==', hashKey(rawKey)).limit(1).get()
    if (matches.empty) throw new Error('UNAUTHORIZED')
    const accessRef = matches.docs[0].ref
    const access = matches.docs[0].data()
    if (access.status !== 'active') throw new Error(access.status === 'blocked' ? 'ACCESS_BLOCKED' : 'ACCESS_UNAVAILABLE')
    const deviceHash = hashValue('admin-device', rawDevice)
    const deviceRef = db.collection('adminAccessDevices').doc(`${accessRef.id}_${deviceHash}`)
    const now = Timestamp.now()
    await db.runTransaction(async transaction => {
      const [accessSnapshot, bindingSnapshot] = await Promise.all([transaction.get(accessRef), transaction.get(deviceRef)])
      const current = accessSnapshot.data() ?? {}
      if (current.status !== 'active') throw new Error(current.status === 'blocked' ? 'ACCESS_BLOCKED' : 'ACCESS_UNAVAILABLE')
      if (!bindingSnapshot.exists && Number(current.devicesUsed ?? 0) >= Number(current.devices ?? 1)) throw new Error('DEVICE_LIMIT')
      if (!bindingSnapshot.exists) {
        transaction.set(deviceRef, { accessId: accessRef.id, deviceHash, devicePreview: `${rawDevice.slice(0, 4)}•••${rawDevice.slice(-4)}`, firstUsedAt: now, lastUsedAt: now })
        transaction.update(accessRef, { devicesUsed: (Number(current.devicesUsed ?? 0) + 1), lastUsedAt: now })
      } else transaction.update(deviceRef, { lastUsedAt: now })
    })
    await clearLoginRateLimit(rateKey)
    setSession(res, accessRef.id)
    await audit('login', accessRef.id, accessRef.id)
    return json(res, 200, { ok: true, dashboard: await buildDashboard(accessRef.id) })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR'
    return json(res, errorStatus(code), { error: code })
  }
}
