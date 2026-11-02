import type { DashboardData } from './types'

const deviceStorageKey = 'zayron-admin-device-id'

function deviceId() {
  let value = window.localStorage.getItem(deviceStorageKey)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `web_${Date.now()}_${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(deviceStorageKey, value)
  }
  return value
}

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Admin-Device', deviceId())
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `BACKEND_HTTP_${response.status}`)
  return body as T
}

export function fetchDashboard() { return request<DashboardData>('/api/admin/dashboard') }
export function login(key: string) { return request<{ ok: true; dashboard: DashboardData }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) }) }
export function logout() { return request<{ ok: true }>('/api/admin/logout', { method: 'POST' }) }
export function runAdminAction(action: string, payload: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {}
  if (action === 'generateLicense') headers['Idempotency-Key'] = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return request<{ ok: true; key?: string; keys?: string[]; id?: string }>('/api/admin/action', { method: 'POST', headers, body: JSON.stringify({ action, payload }) })
}
