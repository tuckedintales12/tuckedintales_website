// Paste this into: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
// Name the function: verify-payment
//
// Secrets used (Edge Functions → Secrets):
//   RAZORPAY_KEY_SECRET                       (required)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID      (optional: a Telegram message for every paid order)
//   RESEND_API_KEY, EMAIL_FROM, REPLY_TO      (optional: confirmation email to the customer)
//   SITE_URL                                  (optional, default https://mytuckedintales.com)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM')            // e.g. TuckedIn Tales <orders@mytuckedintales.com>
const REPLY_TO = Deno.env.get('REPLY_TO') || 'tuckedintales.12@gmail.com'
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://mytuckedintales.com').replace(/\/$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------- helpers ----------
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !EMAIL_FROM || !to) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  })
}

function emailShell(inner: string) {
  return `<div style="background:#fff7e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#26324a">
  <div style="max-width:540px;margin:auto;background:#fff;border:3px solid #172c59;border-radius:20px;padding:28px">
    <div style="font-size:22px;font-weight:bold;color:#172c59">TuckedIn <span style="color:#e8527f">Tales</span></div>
    ${inner}
    <p style="font-size:12px;color:#6b7690;margin-top:28px;border-top:1px solid #e5e9f2;padding-top:14px">Questions? Just reply to this email or write to ${esc(REPLY_TO)}.</p>
  </div></div>`
}

async function notifyOwner(rows: Record<string, any>[]) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  const o = rows.find((r) => !r.is_sibling) ?? rows[0]
  const kids = rows.map((r) => `• ${r.child_name}, ${r.child_age} (${r.child_gender}) — ${r.story_theme} · 🗣 ${r.story_language || 'English'}`)
  const photos = rows.map((r) => `${r.child_name}: ${r.photo_url}`)
  const text = [
    '🎉 New paid order!',
    `Order: ${o.razorpay_order_id}`,
    `Amount: ₹${o.amount}`,
    '',
    rows.length > 1 ? `👭 SIBLING BUNDLE (${rows.length} books)` : null,
    ...kids,
    `Size: ${o.book_size}${o.gift_bag ? ' + gift bag' : ''}`,
    o.customize_addon ? `Custom story: ${o.custom_description || '(no details)'}` : null,
    ...rows.filter((r) => r.photo_notes).map((r) => `⚠️ Photo notes (${r.child_name}): ${r.photo_notes}`),
    o.coupon_code ? `Coupon: ${o.coupon_code} (-₹${o.discount_amount})` : null,
    o.is_gift ? `🎁 GIFT for: ${o.recipient_name}` : null,
    o.is_gift && o.gift_message ? `Gift message: ${o.gift_message}` : null,
    '',
    `Buyer: ${o.customer_name}`,
    `Email: ${o.email}`,
    `Deliver to: ${o.is_gift ? o.recipient_name + ', ' : ''}${o.address}, ${o.city} ${o.pincode}`,
    `Phone: ${o.phone}`,
    '',
    'Photos (Supabase → Storage → story-photos):',
    ...photos,
  ].filter((l) => l !== null).join('\n')
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  })
}

async function confirmationEmail(rows: Record<string, any>[]) {
  const o = rows.find((r) => !r.is_sibling) ?? rows[0]
  const names = rows.map((r) => esc(String(r.child_name).split(' ')[0]))
  const nameList = names.length > 1 ? names.join(' &amp; ') : names[0]
  const trackUrl = `${SITE_URL}/track.html?o=${encodeURIComponent(o.razorpay_order_id)}`
  const lines = rows
    .map((r) => `<li>${esc(r.child_name)} — ${esc(r.story_theme)}, in ${esc(r.story_language || 'English')} (${esc(r.book_size)})</li>`)
    .join('')
  const html = emailShell(`
    <h2 style="color:#172c59;margin:18px 0 6px">Thank you, ${esc(o.customer_name)}! 🎉</h2>
    <p>We've received your order and payment for <b>${nameList}</b>'s storybook${rows.length > 1 ? 's' : ''}.</p>
    <p style="background:#eaf6ff;border-radius:12px;padding:12px 14px"><b>Your order number</b><br>
      <span style="font-size:16px;letter-spacing:.5px">${esc(o.razorpay_order_id)}</span></p>
    <ul style="padding-left:18px">${lines}</ul>
    <p><b>Total paid:</b> ₹${esc(o.amount)}${o.coupon_code ? ` (coupon ${esc(o.coupon_code)} applied)` : ''}</p>
    <p><b>Delivering to:</b> ${o.is_gift ? esc(o.recipient_name) + ', ' : ''}${esc(o.address)}, ${esc(o.city)} ${esc(o.pincode)}</p>
    <p>We'll email you when your book moves to the next stage. You can also check progress any time:</p>
    <p style="text-align:center"><a href="${trackUrl}" style="display:inline-block;background:#f5b83d;color:#172c59;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:999px;border:3px solid #172c59">Track my order</a></p>
    <p style="font-size:13px;color:#6b7690">For tracking you'll need your order number and the phone number you gave us.</p>`)
  await sendEmail(o.email, `Your TuckedIn Tales order is confirmed (${o.razorpay_order_id})`, html)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()

    // Missing fields -> 400
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ verified: false, error: 'Missing payment fields' }, 400)
    }

    // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(RAZORPAY_KEY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`))
    const expected = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')

    // constant-time comparison
    let diff = expected.length ^ String(razorpay_signature).length
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (String(razorpay_signature).charCodeAt(i) || 0)

    // Mismatch -> 400 and the order is NOT marked as paid
    if (diff !== 0) return json({ verified: false, error: 'Invalid signature' }, 400)

    // Mark paid using the Razorpay order id (the signature is tied to it), so a valid payment can
    // never mark a different order as paid. A sibling bundle has TWO rows with the same id: both update.
    // .neq('status','paid') makes this safe to call twice: only the first call changes the rows,
    // so you only ever get ONE alert / email per order.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: paidRows, error } = await supabase
      .from('orders')
      .update({ status: 'paid', razorpay_payment_id, status_updated_at: new Date().toISOString() })
      .eq('razorpay_order_id', razorpay_order_id)
      .neq('status', 'paid')
      .select()
    if (error) return json({ verified: true, error: 'Payment verified but saving failed' }, 500)

    if (paidRows && paidRows.length) {
      // Each of these can fail without ever breaking the customer's order.
      try { await notifyOwner(paidRows) } catch (_) { /* ignore */ }
      try { await confirmationEmail(paidRows) } catch (_) { /* ignore */ }
      const primary = paidRows.find((r) => !r.is_sibling) ?? paidRows[0]
      if (primary.coupon_code) {
        try { await supabase.rpc('use_coupon', { p_code: primary.coupon_code }) } catch (_) { /* ignore */ }
      }
    }

    return json({ verified: true })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
