// /api/teams/logo · invite · join
import sharp from 'sharp'
import { handler, getUser, parse, rateLimit, z, HttpError, supabaseAdmin, sha256, isAdminRole } from '../_lib/core.js'
import { randomBytes } from 'node:crypto'

const MAX_BYTES = 2 * 1024 * 1024

async function captainOrAdmin(user, teamId) {
  if (isAdminRole(user.role)) return
  const { data } = await supabaseAdmin().from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'captain') throw new HttpError(403, 'Solo el capitán del equipo o un admin')
}

export default handler({
  logo: {
    // PNG/JPG/WEBP ≤ 2 MB en base64 → WEBP 512×512 con sharp (elimina metadatos). Sin SVG.
    run: async ({ req, body }) => {
      const user = await getUser(req)
      if (!user) throw new HttpError(401, 'Inicia sesión')
      await rateLimit(req, 'logo', 10, 600, user.id)
      const b = parse(z.object({
        teamId: z.string().uuid(),
        dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/, 'Solo PNG, JPG o WEBP').max(Math.ceil(MAX_BYTES * 1.37) + 40),
      }), body)
      await captainOrAdmin(user, b.teamId)
      const input = Buffer.from(b.dataUrl.split(',')[1], 'base64')
      if (input.length > MAX_BYTES) throw new HttpError(413, 'Máximo 2 MB')
      const meta = await sharp(input).metadata().catch(() => null)
      if (!meta || !['png', 'jpeg', 'webp'].includes(meta.format)) throw new HttpError(400, 'Imagen inválida')
      const webp = await sharp(input).resize(512, 512, { fit: 'cover' }).webp({ quality: 88 }).toBuffer()
      const sb = supabaseAdmin()
      const path = `${b.teamId}/logo.webp`
      const up = await sb.storage.from('team-logos').upload(path, webp, { contentType: 'image/webp', upsert: true })
      if (up.error) throw up.error
      await sb.from('teams').update({ logo_path: `${path}?v=${Date.now()}` }).eq('id', b.teamId)
      await sb.from('audit_log').insert({ actor_id: user.id, action: 'team.logo', entity: 'team', entity_id: b.teamId })
      return { url: sb.storage.from('team-logos').getPublicUrl(path).data.publicUrl + `?v=${Date.now()}` }
    },
  },
  invite: {
    // Código de invitación de 7 días; solo se guarda su hash.
    run: async ({ req, body }) => {
      const user = await getUser(req)
      if (!user) throw new HttpError(401, 'Inicia sesión')
      const { teamId } = parse(z.object({ teamId: z.string().uuid() }), body)
      await captainOrAdmin(user, teamId)
      const code = randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X')
      const { error } = await supabaseAdmin().from('team_invites').insert({ team_id: teamId, code_hash: sha256(code) })
      if (error) throw error
      return { code, expiresInDays: 7 }
    },
  },
  join: {
    run: async ({ req, body }) => {
      const user = await getUser(req)
      if (!user) throw new HttpError(401, 'Inicia sesión')
      await rateLimit(req, 'join', 10, 600, user.id)
      const { code } = parse(z.object({ code: z.string().trim().min(6).max(16) }), body)
      const sb = supabaseAdmin()
      const { data: inv } = await sb.from('team_invites').select('team_id, expires_at').eq('code_hash', sha256(code.toUpperCase())).maybeSingle()
      if (!inv || new Date(inv.expires_at) < new Date()) throw new HttpError(404, 'Código inválido o vencido')
      const { error } = await sb.from('team_members').upsert({ team_id: inv.team_id, user_id: user.id, role: 'player' }, { onConflict: 'team_id,user_id', ignoreDuplicates: true })
      if (error) throw error
      return { teamId: inv.team_id }
    },
  },
})
