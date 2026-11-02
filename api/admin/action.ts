import { randomBytes } from 'node:crypto'
import { db, FieldValue, Timestamp } from '../_lib/firebaseAdmin.js'
import { assertOrigin, audit, errorStatus, hashKey, json, normalizePrefix, parseBody, randomKey, requireAdmin } from '../_lib/adminSecurity.js'
import { decryptBulkKeys, encryptBulkKeys } from '../_lib/bulkEncryption.js'

type Request = { method?: string; body: unknown; headers: Record<string, string | string[] | undefined> }
type Response = { setHeader: (name: string, value: string | string[]) => void; status: (code: number) => { json: (body: unknown) => void } }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const costs: Record<number, number> = { 1: 1, 3: 2, 7: 4, 15: 6, 30: 8, 60: 10, 120: 15 }
const safeIdempotency = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return json(res, 405, { error: 'MÉTODO_NÃO_PERMITIDO' })
  try {
    assertOrigin(req)
    if (!db) throw new Error('BACKEND_NOT_CONFIGURED')
    const { session, ref: accessRef } = await requireAdmin(req)
    const { action, payload } = parseBody(req.body) as { action?: string; payload?: Record<string, unknown> }
    if (!action || !payload) throw new Error('DADOS_INVALIDOS')
    const now = Timestamp.now()

    if (action === 'generateLicense') {
      const days = Number(payload.days)
      const devices = Number(payload.devices)
      const quantity = Math.min(100, Math.max(1, Number(payload.quantity ?? 1)))
      const cost = costs[days]
      if (!cost || !Number.isInteger(quantity) || ![1, 2].includes(devices)) throw new Error('DADOS_INVALIDOS')
      const prefix = normalizePrefix(payload.prefix ?? 'KEY')
      const idempotency = safeIdempotency(first(req.headers['idempotency-key'] ?? req.headers['Idempotency-Key']) ?? '')
      if (!idempotency) throw new Error('IDEMPOTENCY_OBRIGATORIA')
      const idempotencyRef = db.collection('adminIdempotency').doc(`${session.accessId}_${idempotency}`)
      const previous = await idempotencyRef.get()
      if (previous.exists) return json(res, 200, previous.data())
      const rawKeys = Array.from({ length: quantity }, () => randomKey(prefix))
      const licenseRefs = rawKeys.map(() => db!.collection('licenses').doc())
      const bulkRef = quantity > 1 ? db.collection('bulkKeyBatches').doc() : null
      const flagRef = db.collection('systemFlags').doc('global')
      const result = await db.runTransaction(async transaction => {
        const currentSnapshot = await transaction.get(accessRef)
        const flagSnapshot = await transaction.get(flagRef)
        const current = currentSnapshot.data() ?? {}
        if (current.status !== 'active') throw new Error(current.status === 'blocked' ? 'ACCESS_BLOCKED' : 'ACCESS_UNAVAILABLE')
        if (flagSnapshot.data()?.globalPaused) throw new Error('SYSTEM_PAUSED')
        const credits = Number(current.credits ?? 0)
        const totalCost = cost * quantity
        if (credits < totalCost) throw new Error('CREDITOS_INSUFICIENTES')
        rawKeys.forEach((rawKey, index) => transaction.set(licenseRefs[index], { keyHash: hashKey(rawKey), keyPreview: `${rawKey.slice(0, 6)}•••${rawKey.slice(-4)}`, createdBy: session.accessId, createdByAdminId: session.accessId, createdByRole: 'admin', durationDays: days, devices, devicesUsed: 0, status: 'ready', activatedAt: null, expiresAt: null, pausedRemainingMs: null, createdAt: now, updatedAt: now }))
        transaction.update(accessRef, { credits: credits - totalCost, prefix, updatedAt: now })
        if (bulkRef) transaction.set(bulkRef, { ownerType: 'admin', ownerId: session.accessId, encryptedKeys: encryptBulkKeys(rawKeys), count: quantity, durationDays: days, devices, createdAt: now, createdBy: session.accessId })
        transaction.create(idempotencyRef, { ok: true, ids: licenseRefs.map(ref => ref.id), keys: rawKeys, key: rawKeys[0], quantity, cost: totalCost, createdAt: now })
        return { ids: licenseRefs.map(ref => ref.id), keys: rawKeys, key: rawKeys[0] }
      })
      await audit(quantity > 1 ? `${quantity} keys Snapchat criadas` : 'key Snapchat criada', session.accessId, result.ids.join(','))
      return json(res, 200, { ok: true, ...result })
    }

    if (action === 'copyBulkBatch') {
      const batchId = typeof payload.id === 'string' ? payload.id : ''
      if (!batchId) throw new Error('ID_OBRIGATORIO')
      const batch = await db.collection('bulkKeyBatches').doc(batchId).get()
      if (!batch.exists || batch.data()?.ownerType !== 'admin' || batch.data()?.ownerId !== session.accessId) throw new Error('FORBIDDEN')
      const keys = decryptBulkKeys(String(batch.data()?.encryptedKeys ?? ''))
      await audit('lote de keys copiado', session.accessId, batchId)
      return json(res, 200, { ok: true, keys })
    }

    const id = typeof payload.id === 'string' ? payload.id : ''
    if (!id) throw new Error('ID_OBRIGATORIO')
    const licenseRef = db.collection('licenses').doc(id)
    const snapshot = await licenseRef.get()
    if (!snapshot.exists || snapshot.data()?.createdByAdminId !== session.accessId) throw new Error('FORBIDDEN')
    const license = snapshot.data() ?? {}

    if (action === 'pauseLicense' || action === 'unpauseLicense') {
      await db.runTransaction(async transaction => {
        const fresh = await transaction.get(licenseRef)
        const item = fresh.data() ?? {}
        if (item.createdByAdminId !== session.accessId) throw new Error('FORBIDDEN')
        if (action === 'pauseLicense') {
          const remaining = item.status === 'active' && item.expiresAt?.toMillis ? Math.max(0, item.expiresAt.toMillis() - now.toMillis()) : null
          transaction.update(licenseRef, { status: 'paused', pausedAt: now, pausedRemainingMs: remaining, updatedAt: now })
        } else {
          const remaining = Number(item.pausedRemainingMs ?? 0)
          if (item.activatedAt && remaining > 0) transaction.update(licenseRef, { status: 'active', expiresAt: Timestamp.fromMillis(now.toMillis() + remaining), pausedAt: null, pausedRemainingMs: null, updatedAt: now })
          else transaction.update(licenseRef, { status: item.activatedAt ? 'expired' : 'ready', pausedAt: null, pausedRemainingMs: null, updatedAt: now })
        }
      })
      await audit(action === 'pauseLicense' ? 'key pausada' : 'key despausada', session.accessId, id)
      return json(res, 200, { ok: true, id })
    }

    if (action === 'deleteLicense') {
      await audit('key excluída', session.accessId, id)
      const bindings = await db.collection('licenseDevices').where('licenseId', '==', id).get()
      const batch = db.batch(); bindings.docs.forEach(binding => batch.delete(binding.ref)); batch.delete(licenseRef); await batch.commit()
      return json(res, 200, { ok: true, deleted: true, id })
    }

    if (action === 'updatePrefix') {
      const prefix = normalizePrefix(payload.prefix)
      await accessRef.update({ prefix, updatedAt: now })
      await audit('prefixo alterado', session.accessId, prefix)
      return json(res, 200, { ok: true, prefix })
    }

    throw new Error('AÇÃO_NÃO_PERMITIDA')
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR'
    const status = code === 'FORBIDDEN' ? 403 : errorStatus(code)
    return json(res, status, { error: code })
  }
}
