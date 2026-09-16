import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { randomToken } from '../lib/util'
import type { Bindings } from './api'

type Stroke = { tool: 'pen' | 'highlighter' | 'eraser'; color: string; width: number; points: [number, number][] }
type Annotation = { hospital_id: number; material_id: number; media_key: string; strokes_json: string; image_key: string | null; video_time: number | null; version: number; write_key: string }
const app = new Hono<{ Bindings: Bindings; Variables: { hid: number } }>()
function fail(message: string, status: 400 | 404 | 409 = 400): never { throw new HTTPException(status, { message }) }
const out = (a: Annotation) => ({ media_key: a.media_key, strokes: JSON.parse(a.strokes_json), image_key: a.image_key, video_time: a.video_time, version: a.version })
async function material(c: any) {
  const m = await c.env.DB.prepare('SELECT id, images_json FROM materials WHERE id = ? AND hospital_id = ? AND active = 1').bind(c.req.param('id'), c.get('hid')).first()
  if (!m) fail('자료를 찾을 수 없습니다.', 404)
  return m
}
function strokesOf(value: unknown): Stroke[] {
  if (!Array.isArray(value) || value.length > 300 || JSON.stringify(value).length > 250000) fail('필기량이 너무 많습니다. 나누어 저장해 주세요.')
  let count = 0
  return value.map((s: any) => {
    if (!s || !['pen', 'highlighter', 'eraser'].includes(s.tool) || !/^#[0-9a-f]{6}$/i.test(s.color) || !Number.isFinite(s.width) || s.width < 1 || s.width > 40 || !Array.isArray(s.points) || s.points.length < 1) fail('필기 형식을 확인해 주세요.')
    count += s.points.length
    if (count > 12000) fail('필기량이 너무 많습니다.')
    const points = s.points.map((p: any) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((n: any) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) fail('필기 좌표를 확인해 주세요.')
      return p as [number, number]
    })
    return { tool: s.tool, color: s.color, width: s.width, points }
  })
}
app.onError((e, c) => c.json({ error: e instanceof HTTPException ? e.message : '필기 저장 중 오류가 발생했습니다.' }, e instanceof HTTPException ? e.status : 500))
app.use('/:id/annotations', bodyLimit({ maxSize: 4 * 1024 * 1024, onError: c => c.json({ error: '필기 요청이 너무 큽니다.' }, 413) }))
app.get('/:id/annotations', async c => {
  const m = await material(c), media = JSON.parse(m.images_json)
  const records = await c.env.DB.prepare('SELECT * FROM material_annotations WHERE hospital_id = ? AND material_id = ?').bind(c.get('hid'), m.id).all<Annotation>()
  c.header('Cache-Control', 'private, no-store')
  return c.json({ annotations: records.results.filter(a => media.some((x: any) => x.key === a.media_key)).map(out) })
})
app.put('/:id/annotations', async c => {
  const origin = c.req.header('Origin')
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({ error: '다른 사이트의 요청은 허용하지 않습니다.' }, 403)
  const m = await material(c), b = await c.req.json().catch(() => null)
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail('올바른 요청이 필요합니다.')
  const media = JSON.parse(m.images_json).find((x: any) => x.key === b.media_key)
  if (!media) fail('이 자료에 연결된 이미지·영상만 필기할 수 있습니다.')
  if (!Number.isInteger(b.version) || b.version < 0 || typeof b.write_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(b.write_key)) fail('저장 버전을 확인해 주세요.')
  const hid = c.get('hid')
  const current = await c.env.DB.prepare('SELECT * FROM material_annotations WHERE hospital_id = ? AND material_id = ? AND media_key = ?').bind(hid, m.id, b.media_key).first<Annotation>()
  if (current && current.write_key === b.write_key) return c.json({ annotation: out(current), replayed: true })
  if ((current?.version || 0) !== b.version) fail('다른 화면에서 필기가 변경되었습니다. 현재 필기는 유지됩니다. 서버 내용을 다시 확인해 주세요.', 409)
  const strokes = strokesOf(b.strokes)
  const video = media.media_type === 'video' || /\.(mp4|webm)$/.test(media.key)
  const time = strokes.length && video ? b.video_time : null
  if (video && strokes.length && (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > 86400)) fail('영상 장면 시간을 확인해 주세요.')
  let imageKey: string | null = null
  if (strokes.length) {
    if (typeof b.image_png !== 'string' || b.image_png.length > 2900000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.image_png)) fail('필기 이미지는 2MB 이하의 PNG여야 합니다.')
    let bytes: Uint8Array
    try { bytes = Uint8Array.from(atob(b.image_png.split(',')[1]), ch => ch.charCodeAt(0)) } catch { fail('올바른 PNG 파일이 아닙니다.') }
    if (bytes!.length < 33 || bytes!.length > 2 * 1024 * 1024 || bytes![0] !== 137 || String.fromCharCode(...bytes!.slice(1, 4)) !== 'PNG' || String.fromCharCode(...bytes!.slice(12, 16)) !== 'IHDR') fail('올바른 PNG 파일이 아닙니다.')
    const view = new DataView(bytes!.buffer), width = view.getUint32(16), height = view.getUint32(20)
    if (!width || !height || width > 1600 || height > 1600) fail('필기 이미지 크기를 확인해 주세요.')
    imageKey = `h${hid}/m${m.id}/${randomToken(16)}.png`
    await c.env.MEDIA.put(imageKey, bytes!, { httpMetadata: { contentType: 'image/png' } })
  }
  const version = (current?.version || 0) + 1
  const result = current
    ? await c.env.DB.prepare("UPDATE material_annotations SET strokes_json=?, image_key=?, video_time=?, version=?, write_key=?, updated_at=datetime('now') WHERE hospital_id=? AND material_id=? AND media_key=? AND version=?").bind(JSON.stringify(strokes), imageKey, time, version, b.write_key, hid, m.id, b.media_key, b.version).run()
    : await c.env.DB.prepare('INSERT INTO material_annotations (hospital_id,material_id,media_key,strokes_json,image_key,video_time,version,write_key) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(hid,m.id,b.media_key,JSON.stringify(strokes),imageKey,time,version,b.write_key).run()
  if (!result.meta.changes) fail('다른 화면에서 먼저 저장했습니다. 현재 필기는 유지됩니다.', 409)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ annotation: { media_key: b.media_key, strokes, image_key: imageKey, video_time: time, version } })
})
export default app
