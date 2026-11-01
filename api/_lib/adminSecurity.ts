import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { db, FieldValue, Timestamp } from './firebaseAdmin.js'

type HeaderValue = string | string[] | undefined
type RequestLike = { headers: Record<string, HeaderValue>; body?: unknown }
type ResponseLike = { setHeader: (name: string, value: string | string[]) => void; status: (code: number) => { json: (body: unknown) => void } }

type Session = { accessId: string; issuedAt: number; expiresAt: number }

const SESSION_TTL_SECONDS = 60 * 60 * 12
const rateMemory = new Map<string, { count: number; resetAt: number }>()
const first = (value: HeaderValue) => Array.isArray(value) ? value[0] : value
const header = (req: RequestLike, name: string) => first(req.headers[name] ?? req.headers[name.toLowerCase()] ?? req.headers[name.toUpperCase()]) ?? ''
const sessionSecret = () => { const value = process.env.ADMIN_SESSION_SECRET; if (!value || value.length < 32) throw new Error('ADMIN_SESSION_SECRET_NOT_CONFIGURED'); return value }
const pepper = () => { const value = process.env.LICENSE_PEPPER; if (!value || value.length < 24) throw new Error('LICENSE_PEPPER_NOT_CONFIGURED'); return value }
const base64 = (value: string) => Buffer.from(value).toString('base64url')
const unbase64 = (value: string) => Buffer.from(value, 'base64url').toString('utf8')
const sign = (value: string) => createHmac('sha256', sessionSecret()).update(value).digest('base64url')
const safeEqual = (a: string, b: string) => { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right) }

export const hashKey = (value: string) => createHash('sha256').update(`${pepper()}:${value}`).digest('hex')
export const hashValue = (prefix: string, value: string) => createHash('sha256').update(`${prefix}:${value}`).digest('hex')
export const normalizeKey = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 160) : ''
export const normalizePrefix = (value: unknown) => { const prefix = typeof value === 'string' ? value.trim().toUpperCase() : ''; if (!/^[A-Z][A-Z0-9_-]{0,15}$/.test(prefix)) throw new Error('PREFIXO_INVALIDO'); return prefix }
export const now = () => Timestamp.now()
export const clientIP = (req: RequestLike) => (header(req, 'x-forwarded-for') || header(req, 'x-real-ip') || 'unknown').split(',')[0].trim().slice(0, 80)
export const deviceId = (req: RequestLike) => header(req, 'x-admin-device').trim().slice(0, 200)

export function assertOrigin(req: RequestLike) {
  const origin = header(req, 'origin')
  if (!origin) return
  const configured = (process.env.ADMIN_ALLOWED_ORIGIN ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const host = header(req, 'x-forwarded-host') || header(req, 'host')
  const expected = host ? [`https://${host}`, `http://${host}`] : []
  if (![...configured, ...expected].includes(origin)) throw new Error('ORIGIN_REJECTED')
}

function cookieValue(req: RequestLike, name: string) { const cookie = header(req, 'cookie'); const found = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`)); return found?.slice(name.length + 1) ?? '' }

export function setSession(res: ResponseLike, accessId: string) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = base64(JSON.stringify({ accessId, issuedAt, expiresAt: issuedAt + SESSION_TTL_SECONDS } satisfies Session))
  const token = `${payload}.${sign(payload)}`
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
  res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=None${secure ? '; Secure' : ''}`)
}
export function clearSession(res: ResponseLike) { res.setHeader('Set-Cookie', 'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure') }

function readSession(req: RequestLike): Session {
  const token = cookieValue(req, 'admin_session')
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload))) throw new Error('UNAUTHORIZED')
  const session = JSON.parse(unbase64(payload)) as Session
  if (!session.accessId || !session.expiresAt || session.expiresAt < Math.floor(Date.now() / 1000)) throw new Error('SESSION_EXPIRED')
  return session
}

export async function requireAdmin(req: RequestLike) {
  if (!db) throw new Error(process.env.FIREBASE_PROJECT_ID ? 'BACKEND_INIT_FAILED' : 'BACKEND_NOT_CONFIGURED')
  const session = readSession(req)
  const ref = db.collection('adminAccess').doc(session.accessId)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new Error('ACCESS_REVOKED')
  const data = snapshot.data() ?? {}
  if (data.status !== 'active') throw new Error(data.status === 'blocked' ? 'ACCESS_BLOCKED' : 'ACCESS_UNAVAILABLE')
  return { session, ref, data }
}

export async function loginRateLimit(key: string) {
  const current = Date.now(); const memory = rateMemory.get(key)
  if (memory && memory.resetAt > current && memory.count >= 8) throw new Error('RATE_LIMITED')
  rateMemory.set(key, memory && memory.resetAt > current ? { count: memory.count + 1, resetAt: memory.resetAt } : { count: 1, resetAt: current + 10 * 60_000 })
  if (!db) return
  const ref = db.collection('adminRateLimits').doc(hashValue('admin-login', key))
  await db.runTransaction(async transaction => { const snapshot = await transaction.get(ref); const data = snapshot.data() ?? {}; const started = Number(data.windowStartedAt ?? current); const attempts = Number(data.attempts ?? 0); if (current - started < 10 * 60_000 && attempts >= 8) throw new Error('RATE_LIMITED'); transaction.set(ref, { attempts: current - started < 10 * 60_000 ? attempts + 1 : 1, windowStartedAt: current, updatedAt: now() }, { merge: true }) })
}
export async function clearLoginRateLimit(key: string) { rateMemory.delete(key); if (db) await db.collection('adminRateLimits').doc(hashValue('admin-login', key)).delete().catch(() => undefined) }

export async function audit(action: string, actor: string, target: string, result = 'success') { if (db) await db.collection('auditEvents').add({ action: `Admin: ${action}`, actor, target, result, createdAt: FieldValue.serverTimestamp() }) }
export function parseBody(body: unknown) { const value = typeof body === 'string' ? JSON.parse(body) : body; return value && typeof value === 'object' ? value as Record<string, unknown> : {} }

export function json(res: ResponseLike, status: number, body: unknown) { res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); return res.status(status).json(body) }
export function errorStatus(code: string) { if (['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_REVOKED'].includes(code)) return 401; if (['ACCESS_BLOCKED', 'ACCESS_UNAVAILABLE', 'DEVICE_LIMIT', 'RATE_LIMITED', 'ORIGIN_REJECTED', 'SYSTEM_PAUSED', 'FORBIDDEN'].includes(code)) return 403; if (['DADOS_INVALIDOS', 'PREFIXO_INVALIDO', 'CREDITOS_INSUFICIENTES', 'IDEMPOTENCY_OBRIGATORIA'].includes(code)) return 400; return 500 }
export function randomKey(prefix: string) { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes = randomBytes(10); let suffix = ''; for (const byte of bytes) suffix += alphabet[byte % alphabet.length]; return `${prefix}-${suffix}` }
