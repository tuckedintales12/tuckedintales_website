// Paste this into: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
// Name the function: admin-update-order
//
// Used by your admin page (admin.html) to change an order's status / tracking details,
// and to email the customer about it. Only people listed in the `admins` table can use it.
//
// Optional secrets for the emails (same ones as verify-payment):
//   RESEND_API_KEY, EMAIL_FROM, REPLY_TO, SITE_URL

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM')
const REPLY_TO = Deno.env.get('REPLY_TO') || 'tuckedintales.12@gmail.com'
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://mytuckedintales.com').replace(/\/$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATUSES = ['paid', 'illustrating', 'printing', 'shipped', 'delivered', 'cancelled']
const EMAIL_STATUSES = ['illustrating', 'printing', 'shipped', 'delivered']

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !EMAIL_FROM || !to) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  })
  return r.ok
}

function emailShell(inner: string) {
  return `<div style="background:#fff7e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#26324a">
  <div style="max-width:540px;margin:auto;background:#fff;border:3px solid #172c59;border-radius:20px;padding:28px">
    <div style="font-size:22px;font-weight:bold;color:#172c59">TuckedIn <span style="color:#e8527f">Tales</span></div>
    ${inner}
    <p style="font-size:12px;color:#6b7690;margin-top:28px;border-top:1px solid #e5e9f2;padding-top:14px">Questions? Just reply to this email or write to ${esc(REPLY_TO)}.</p>
  </div></div>`
}

function statusEmail(status: string, o: Record<string, any>, kids: string) {
  const trackUrl = `${SITE_URL}/track.html?o=${encodeURIComponent(o.razorpay_order_id)}`
  const btn = (label: string, url: string) =>
    `<p style="text-align:center"><a href="${url}" style="display:inline-block;background:#f5b83d;color:#172c59;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:999px;border:3px solid #172c59">${label}</a></p>`
  const ref = `<p style="font-size:13px;color:#6b7690">Order number: ${esc(o.razorpay_order_id)}</p>`
  switch (status) {
    case 'illustrating':
      return { subject: `We've started illustrating ${kids}'s book ✏️`, html: emailShell(`
        <h2 style="color:#172c59;margin:18px 0 6px">The illustrating has begun! ✏️</h2>
        <p>Hi ${esc(o.customer_name)}, our artists have started creating <b>${esc(kids)}</b>'s personalised storybook.</p>
        <p>We'll email you again when it moves to printing.</p>${btn('Track my order', trackUrl)}${ref}`) }
    case 'printing':
      return { subject: `${kids}'s book is being printed 🖨️`, html: emailShell(`
        <h2 style="color:#172c59;margin:18px 0 6px">Your book is being printed 🖨️</h2>
        <p>Hi ${esc(o.customer_name)}, <b>${esc(kids)}</b>'s book has been illustrated and is now at the printer.</p>
        <p>We'll let you know as soon as it ships.</p>${btn('Track my order', trackUrl)}${ref}`) }
    case 'shipped': {
      const t = o.tracking_number
        ? `<p style="background:#eaf6ff;border-radius:12px;padding:12px 14px"><b>Courier:</b> ${esc(o.courier || '—')}<br><b>Tracking number:</b> ${esc(o.tracking_number)}</p>`
        : ''
      const link = o.tracking_url && /^https?:\/\//.test(o.tracking_url) ? btn('Track the parcel', esc(o.tracking_url)) : btn('Track my order', trackUrl)
      return { subject: `${kids}'s book is on its way! 🚚`, html: emailShell(`
        <h2 style="color:#172c59;margin:18px 0 6px">It's on its way! 🚚</h2>
        <p>Hi ${esc(o.customer_name)}, <b>${esc(kids)}</b>'s storybook has been shipped to ${o.is_gift ? esc(o.recipient_name) + ', ' : ''}${esc(o.city)}.</p>
        ${t}${link}${ref}`) }
    }
    case 'delivered':
      return { subject: `${kids}'s book has been delivered 💛`, html: emailShell(`
        <h2 style="color:#172c59;margin:18px 0 6px">Delivered! 💛</h2>
        <p>Hi ${esc(o.customer_name)}, <b>${esc(kids)}</b>'s book should now be in your hands. We hope it brings lots of smiles!</p>
        <p>If you loved it, we'd be so grateful for a short review. It helps other parents find us.</p>
        ${btn('Write a review', `${SITE_URL}/#reviews`)}${ref}`) }
    default:
      return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Who is calling? Must be a logged-in user whose email is in the admins table.
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return reply({ error: 'Not signed in' }, 401)
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    const email = userData?.user?.email?.toLowerCase()
    if (userErr || !email) return reply({ error: 'Not signed in' }, 401)
    const { data: admin } = await supabase.from('admins').select('email').eq('email', email).maybeSingle()
    if (!admin) return reply({ error: 'Not allowed' }, 403)

    // 2. What do they want?
    const body = await req.json()
    const orderId = String(body.order_id || '')
    const status = String(body.status || '')
    if (!orderId) return reply({ error: 'order_id is required' }, 400)
    if (!STATUSES.includes(status)) return reply({ error: 'Unknown status' }, 400)

    const { data: row, error: rowErr } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
    if (rowErr || !row) return reply({ error: 'Order not found' }, 404)
    if (row.status === 'pending' || row.status === 'verification_failed') {
      return reply({ error: 'This order has not been paid, so it can\'t be moved forward.' }, 400)
    }

    const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const patch: Record<string, unknown> = { status, status_updated_at: new Date().toISOString() }
    if (status === 'shipped' || body.courier !== undefined) patch.courier = clean(body.courier, 80) || null
    if (status === 'shipped' || body.tracking_number !== undefined) patch.tracking_number = clean(body.tracking_number, 80) || null
    if (status === 'shipped' || body.tracking_url !== undefined) {
      const u = clean(body.tracking_url, 300)
      patch.tracking_url = /^https?:\/\//.test(u) ? u : null
    }

    // 3. Update every book of the order (a sibling bundle has two rows with the same Razorpay id)
    const q = supabase.from('orders').update(patch)
    const { data: updated, error: upErr } = row.razorpay_order_id
      ? await q.eq('razorpay_order_id', row.razorpay_order_id).select()
      : await q.eq('id', row.id).select()
    if (upErr) throw upErr

    // 4. Email the customer once per order, only when the status really changed
    let emailed = false
    if (body.notify !== false && status !== row.status && EMAIL_STATUSES.includes(status)) {
      const primary = (updated ?? []).find((r: any) => !r.is_sibling) ?? updated?.[0]
      if (primary) {
        const kids = (updated ?? []).map((r: any) => String(r.child_name).split(' ')[0]).join(' & ')
        const mail = statusEmail(status, primary, kids)
        if (mail) { try { emailed = await sendEmail(primary.email, mail.subject, mail.html) } catch (_) { emailed = false } }
      }
    }

    return reply({ ok: true, updated: updated?.length ?? 0, emailed })
  } catch (err) {
    return reply({ error: (err as Error).message }, 400)
  }
})
