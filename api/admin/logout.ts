import { assertOrigin, clearSession, json } from '../_lib/adminSecurity.js'

type Request = { method?: string; headers: Record<string, string | string[] | undefined> }
type Response = { setHeader: (name: string, value: string | string[]) => void; status: (code: number) => { json: (body: unknown) => void } }

export default function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return json(res, 405, { error: 'MÉTODO_NÃO_PERMITIDO' })
  try { assertOrigin(req); clearSession(res); return json(res, 200, { ok: true }) }
  catch (error) { return json(res, 403, { error: error instanceof Error ? error.message : 'ORIGIN_REJECTED' }) }
}
