// Paste into: Supabase -> Edge Functions -> Deploy a new function -> Via Editor
// Name the function: cleanup-orders
//
// Needs one extra secret (Edge Functions -> Secrets):  CRON_SECRET  = any long random text you invent.
// Then schedule it daily (see SETUP-GUIDE.md, "Cleanup job").
//
// Every run it does two things:
//   1. Deletes UNPAID orders older than 24 hours, and their uploaded photos.
//   2. Deletes the photo of orders marked 'delivered' more than 7 days ago
//      (keeps the order row, clears photo_url) - the promise in your Privacy Policy.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const PENDING_HOURS = 24
const DELIVERED_DAYS = 7

Deno.serve(async (req) => {
  // Only your scheduler (which knows CRON_SECRET) may run this.
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const result = { pending_deleted: 0, delivered_photos_deleted: 0, errors: [] as string[] }

  try {
    // 1. Abandoned (never paid) orders
    const pendingCutoff = new Date(Date.now() - PENDING_HOURS * 3600 * 1000).toISOString()
    const { data: pending, error: e1 } = await supabase
      .from('orders').select('id, photo_url').eq('status', 'pending').lt('created_at', pendingCutoff)
    if (e1) throw e1
    if (pending?.length) {
      const paths = pending.map((o) => o.photo_url).filter(Boolean) as string[]
      if (paths.length) {
        const { error } = await supabase.storage.from('story-photos').remove(paths)
        if (error) result.errors.push('pending photos: ' + error.message)
      }
      const { error } = await supabase.from('orders').delete().in('id', pending.map((o) => o.id))
      if (error) result.errors.push('pending rows: ' + error.message)
      else result.pending_deleted = pending.length
    }

    // 2. Photos of delivered orders
    const deliveredCutoff = new Date(Date.now() - DELIVERED_DAYS * 86400 * 1000).toISOString()
    const { data: done, error: e2 } = await supabase
      .from('orders').select('id, photo_url').eq('status', 'delivered')
      .lt('delivered_at', deliveredCutoff).not('photo_url', 'is', null)
    if (e2) throw e2
    if (done?.length) {
      const { error } = await supabase.storage.from('story-photos').remove(done.map((o) => o.photo_url as string))
      if (error) result.errors.push('delivered photos: ' + error.message)
      else {
        await supabase.from('orders').update({ photo_url: null }).in('id', done.map((o) => o.id))
        result.delivered_photos_deleted = done.length
      }
    }
  } catch (err) {
    result.errors.push(String((err as Error).message ?? err))
  }

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
