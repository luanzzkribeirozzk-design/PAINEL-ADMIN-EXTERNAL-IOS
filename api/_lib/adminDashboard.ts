import { db, Timestamp } from '../_lib/firebaseAdmin.js'
import { requireAdmin } from '../_lib/adminSecurity.js'

type Request = { headers: Record<string, string | string[] | undefined> }
const dateValue = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : typeof value === 'string' ? value : null

export async function buildDashboard(accessId: string) {
  if (!db) throw new Error('BACKEND_NOT_CONFIGURED')
  const accessRef = db.collection('adminAccess').doc(accessId)
  const [accessSnapshot, licensesSnapshot, bindingsSnapshot, eventsSnapshot, flagsSnapshot, bulkSnapshot] = await Promise.all([
    accessRef.get(),
    db.collection('licenses').where('createdByAdminId', '==', accessId).limit(200).get(),
    db.collection('licenseDevices').limit(1000).get(),
    db.collection('auditEvents').where('actor', '==', accessId).orderBy('createdAt', 'desc').limit(60).get().catch(() => ({ docs: [] as never[] })),
    db.collection('systemFlags').doc('global').get(),
    db.collection('bulkKeyBatches').where('ownerType', '==', 'admin').where('ownerId', '==', accessId).limit(100).get().catch(() => ({ docs: [] as never[] })),
  ])
  if (!accessSnapshot.exists) throw new Error('ACCESS_REVOKED')
  const access = accessSnapshot.data() ?? {}
  const bindingsByLicense = new Map<string, FirebaseFirestore.DocumentData[]>()
  bindingsSnapshot.docs.forEach(doc => { const value = doc.data(); const list = bindingsByLicense.get(String(value.licenseId)) ?? []; list.push({ ...value, id: doc.id }); bindingsByLicense.set(String(value.licenseId), list) })
  const licenses = licensesSnapshot.docs.map(doc => { const value = doc.data(); const bindings = (bindingsByLicense.get(doc.id) ?? []).map(binding => ({ id: binding.id, devicePreview: binding.devicePreview ?? null, ip: binding.ip ?? null, firstUsedAt: dateValue(binding.firstUsedAt), lastUsedAt: dateValue(binding.lastUsedAt) })); return { id: doc.id, key: value.keyPreview ?? '••••', durationDays: Number(value.durationDays ?? 1), devices: Number(value.devices ?? 1), devicesUsed: Number(value.devicesUsed ?? bindings.length), status: value.status ?? 'ready', expiresAt: dateValue(value.expiresAt), activatedAt: dateValue(value.activatedAt), createdAt: dateValue(value.createdAt), lastUsedAt: dateValue(value.lastUsedAt ?? bindings[0]?.lastUsedAt), bindings } }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const bulkHistory = bulkSnapshot.docs.map(doc => { const value = doc.data(); return { id: doc.id, count: Number(value.count ?? 0), durationDays: Number(value.durationDays ?? 0), devices: Number(value.devices ?? 1), createdAt: dateValue(value.createdAt) } }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { admin: { id: accessId, keyPreview: access.keyPreview ?? 'KEY-••••', credits: Number(access.credits ?? 0), devices: Number(access.devices ?? 1), devicesUsed: Number(access.devicesUsed ?? 0), status: access.status ?? 'active', prefix: access.prefix ?? 'KEY', createdAt: dateValue(access.createdAt), lastUsedAt: dateValue(access.lastUsedAt) }, licenses, events: eventsSnapshot.docs.map(doc => { const value = doc.data(); return { id: doc.id, action: String(value.action ?? 'Operação'), target: String(value.target ?? ''), result: value.result ?? 'success', createdAt: dateValue(value.createdAt) } }), bulkHistory, globalPaused: Boolean(flagsSnapshot.data()?.globalPaused) }
}

export async function requireAdminDashboard(req: Request) { const session = await requireAdmin(req); return { ...session, dashboard: await buildDashboard(session.session.accessId) } }
