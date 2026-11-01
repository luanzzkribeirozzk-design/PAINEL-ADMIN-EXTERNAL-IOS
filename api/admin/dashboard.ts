import { errorStatus, json, requireAdmin } from '../_lib/adminSecurity.js'
import { buildDashboard } from '../_lib/adminDashboard.js'

type Request = { method?: string; headers: Record<string, string | string[] | undefined> }
type Response = { setHeader: (name: string, value: string | string[]) => void; status: (code: number) => { json: (body: unknown) => void } }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return json(res, 405, { error: 'MÉTODO_NÃO_PERMITIDO' })
  try { const session = await requireAdmin(req); return json(res, 200, await buildDashboard(session.session.accessId)) }
  catch (error) { const code = error instanceof Error ? error.message : 'INTERNAL_ERROR'; return json(res, errorStatus(code), { error: code }) }
}
