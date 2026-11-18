// Paste this into: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor
// Name the function: create-razorpay-order
//
// Before deploying, add these as Edge Function secrets
// (Project Settings → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already available automatically.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { order: raw } = await req.json()
    const o = raw ?? {}
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

    // ---- Validate what the browser sent (never trust the browser) ----
    let phoneDigits = text(o.phone, 20).replace(/[\s-]/g, '')
    if (/^(\+91|91)\d{10}$/.test(phoneDigits)) phoneDigits = phoneDigits.slice(-10)   // strip country code only when it is clearly one
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) throw new Error('Please enter a valid 10-digit mobile number')
    if (!/^[1-9]\d{5}$/.test(text(o.pincode, 6))) throw new Error('Please enter a valid 6-digit pincode')
    const email = text(o.email, 120)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address')
    if (text(o.customer_name, 100).length < 2) throw new Error('Please enter your name')
    if (!text(o.child_name, 60) || !text(o.address, 200) || !text(o.city, 80)) throw new Error('Some details are missing')
    const isGift = o.is_gift === true
    if (isGift && text(o.recipient_name, 100).length < 2) throw new Error('Please enter the gift recipient\'s name')
    if (!text(o.photo_url, 300).startsWith('orders/')) throw new Error('Photo is missing')

    // ---- The price is calculated HERE from trusted values. Anything the browser
    // sends as an "amount" or "discount" is ignored, so nobody can pay less by editing the page. ----
    const SIZE_PRICES: Record<string, number> = {
      '8" x 6"': 699,
      '9" x 6"': 799,
      '12" x 9"': 1299,
    }
    const LANGUAGES = ["English", "Hindi", "Gujarati", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada"]   // keep in step with order.html
    const pickLanguage = (v: unknown) => (typeof v === 'string' && LANGUAGES.includes(v) ? v : 'English')
    const CUSTOM_STORY_PRICE = 299
    const GIFT_BAG_PRICE = 30

    const SIBLING_DISCOUNT_PERCENT = 10   // 2nd book of a sibling bundle is this % cheaper (same size as the 1st)

    const base = SIZE_PRICES[o.book_size]
    if (!base) throw new Error('Unknown book size')

    // Optional second child (sibling bundle)
    const sib = o.sibling && typeof o.sibling === 'object' ? o.sibling : null
    if (sib) {
      if (!text(sib.child_name, 60) || !text(sib.story_theme, 60)) throw new Error('Please complete your second child\'s details')
      if (!text(sib.photo_url, 300).startsWith('orders/')) throw new Error('The second child\'s photo is missing')
    }
    const siblingPrice = sib ? Math.round(base * (100 - SIBLING_DISCOUNT_PERCENT) / 100) : 0

    const subtotal = base + siblingPrice + (o.customize_addon === true ? CUSTOM_STORY_PRICE : 0) + (isGift && o.gift_bag === true ? GIFT_BAG_PRICE : 0)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Coupon: re-checked on the server every time
    let couponCode: string | null = null
    let discount = 0
    const askedCode = text(o.coupon_code, 30)
    if (askedCode) {
      const { data: c, error: cErr } = await supabase.rpc('check_coupon', { p_code: askedCode, p_subtotal: subtotal })
      if (cErr) throw new Error('Could not check the coupon code. Please try again.')
      if (!c?.valid) throw new Error(c?.message || 'This coupon code is not valid')
      couponCode = c.code
      discount = c.discount
    }

    const total = subtotal - discount
    const amount = total * 100 // Razorpay wants paise
    if (amount < 100) throw new Error('Amount must be at least 100 paise')

    // 1. Create the order with Razorpay
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `order_${Date.now()}`,
      }),
    })
    const rpOrder = await rpRes.json()
    if (rpRes.status === 401) {
      return new Response(JSON.stringify({ error: 'Payment gateway authentication failed' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!rpRes.ok) {
      return new Response(JSON.stringify({ error: rpOrder.error?.description || 'Razorpay order creation failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Save a pending row in the database (only fields we expect, never the raw request).
    //    A sibling bundle saves TWO rows that share the same Razorpay order id.
    const shared = {
      edition: 'Softcover',
      book_size: o.book_size,
      consent_ai_processing: true,
      customer_name: text(o.customer_name, 100),
      email,
      is_gift: isGift,
      recipient_name: isGift ? text(o.recipient_name, 100) : null,
      gift_message: isGift ? text(o.gift_message, 250) || null : null,
      address: text(o.address, 200),
      city: text(o.city, 80),
      pincode: text(o.pincode, 6),
      phone: phoneDigits,
      razorpay_order_id: rpOrder.id,
      status: 'pending',
    }
    const rows: Record<string, unknown>[] = [{
      ...shared,
      child_name: text(o.child_name, 60),
      child_age: Math.min(15, Math.max(1, parseInt(o.child_age, 10) || 1)),
      child_gender: text(o.child_gender, 10),
      story_theme: text(o.story_theme, 60),
      story_language: pickLanguage(o.story_language),
      book_size_price: base,
      customize_addon: o.customize_addon === true,
      custom_description: o.customize_addon === true ? text(o.custom_description, 1500) || null : null,
      gift_bag: isGift && o.gift_bag === true,
      photo_url: text(o.photo_url, 300),
      photo_notes: text(o.photo_notes, 300) || null,
      coupon_code: couponCode,
      discount_amount: discount,
      amount: total,            // the whole order's total sits on the first book
      is_sibling: false,
    }]
    if (sib) {
      rows.push({
        ...shared,
        child_name: text(sib.child_name, 60),
        child_age: Math.min(15, Math.max(1, parseInt(sib.child_age, 10) || 1)),
        child_gender: text(sib.child_gender, 10),
        story_theme: text(sib.story_theme, 60),
        story_language: pickLanguage(sib.story_language),
        book_size_price: siblingPrice,
        customize_addon: false,
        custom_description: null,
        gift_bag: false,
        photo_url: text(sib.photo_url, 300),
        photo_notes: text(sib.photo_notes, 300) || null,
        coupon_code: null,
        discount_amount: 0,
        amount: 0,
        is_sibling: true,
      })
    }
    const { data, error } = await supabase.from('orders').insert(rows).select()
    if (error) throw error
    const first = data.find((r: { is_sibling: boolean }) => !r.is_sibling) ?? data[0]

    return new Response(
      JSON.stringify({ razorpay_order_id: rpOrder.id, key_id: RAZORPAY_KEY_ID, internal_id: first.id, amount, total }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
