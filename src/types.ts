export type Status = 'ready' | 'active' | 'paused' | 'blocked' | 'expired' | 'deleted'

export type ThemeName = 'azul' | 'vermelho' | 'verde' | 'roxo' | 'rosa' | 'padrao'

export interface DeviceBinding {
  id: string
  devicePreview: string | null
  ip: string | null
  firstUsedAt: string | null
  lastUsedAt: string | null
}

export interface AdminProfile {
  id: string
  keyPreview: string
  credits: number
  devices: number
  devicesUsed: number
  status: Status
  prefix: string
  createdAt: string | null
  lastUsedAt: string | null
}

export interface AdminLicense {
  id: string
  key: string
  durationDays: number
  devices: number
  devicesUsed: number
  status: Status
  expiresAt: string | null
  activatedAt: string | null
  createdAt: string | null
  lastUsedAt: string | null
  bindings: DeviceBinding[]
}

export interface ActivityEvent {
  id: string
  action: string
  target: string
  result: 'success' | 'warning' | 'blocked'
  createdAt: string | null
}

export interface DashboardData {
  admin: AdminProfile
  licenses: AdminLicense[]
  events: ActivityEvent[]
  globalPaused: boolean
}
