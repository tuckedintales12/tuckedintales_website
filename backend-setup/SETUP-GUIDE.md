# TuckedIn Tales — Setup Guide

This package is a working front-end (design + full order flow) wired up to
connect to a real backend. Everything works right now as a demo; follow the
steps below to make it take real orders and real payments.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The marketing site (homepage) |
| `order.html` | The 5-step order flow (photo upload → payment) |
| `tuckedintales-logo-mark.svg` | The standalone logo, for Figma/Illustrator/Canva |
| `tuckedintales-logo-system.html` | Logo lockups, sizes, and color palette reference |
| `1-database-schema.sql` | Creates the `orders` table in Supabase |
| `2-create-razorpay-order.ts` | Edge Function: securely creates a Razorpay order |
| `3-verify-payment.ts` | Edge Function: verifies payment and marks the order paid |

**Keep `index.html` and `order.html` in the same folder** — the
buttons between them use relative links.

---

## Part 1 — Get it online (no backend yet)

You can deploy the site as-is right now and it'll work as a browsable demo
with a working (but disconnected) order form:

1. Buy a domain (e.g. tuckedintales.in or .com) from any registrar.
2. Create a free account on [Netlify](https://netlify.com) or
   [Vercel](https://vercel.com).
3. Drag both `.html` files into a new site deploy.
4. Point your domain at it (each platform has a simple "Add custom domain"
   flow with DNS instructions).

At this point the order form works end-to-end in the browser but nothing is
saved and no payment is actually taken — you'll see an orange warning banner
on the order page reminding you of that.

---

## Part 2 — Connect the real backend

### Step 1 — Create a Supabase project
Go to [supabase.com](https://supabase.com), sign up free, and create a new
project. Save the database password it gives you.

### Step 2 — Run the database schema
Open **SQL Editor** in your project → paste the contents of
`1-database-schema.sql` → click **Run**. This creates the `orders` table.

### Step 3 — Create a storage bucket for photos
Go to **Storage → Create bucket** → name it exactly `story-photos`.
Keep it **private** — these are photos of children, so don't make this bucket
public. You'll add signed-URL access when you build the illustration
pipeline.

### Step 4 — Create a Razorpay account (test mode)
Go to [razorpay.com](https://razorpay.com), sign up, and make sure you're in
**Test Mode** (top-left toggle). Go to **Settings → API Keys → Generate Test
Keys**. Copy the **Key ID** and **Key Secret**.

### Step 5 — Add Razorpay keys as Supabase secrets
In Supabase: **Project Settings → Edge Functions → Secrets**. Add:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

### Step 6 — Deploy the two Edge Functions
In Supabase: **Edge Functions → Deploy a new function → Via Editor**.
- Create one named `create-razorpay-order`, paste in the contents of
  `2-create-razorpay-order.ts`, click **Deploy**.
- Repeat for `verify-payment` using `3-verify-payment.ts`.

No CLI, no terminal, no local setup — this is all done in the browser.

### Step 7 — Connect order.html to your project
Open `order.html` in a text editor, find this block near the top of the
`<script>` tag:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

Replace both with your real values from **Project Settings → API** in
Supabase. Re-upload the file to Netlify/Vercel. The warning banner will
disappear once these are correct.

### Step 8 — Test it
Place a full test order on the live site and pay with Razorpay's test card:

```
Card number: 4111 1111 1111 1111
Expiry: any future date
CVV: any 3 digits
```

Then check Supabase: the `orders` table should show a new row with
`status = 'paid'`, and the photo should appear in your `story-photos`
storage bucket.

---

## Part 3 — Going live for real customers

1. In Razorpay, complete KYC and switch from **Test Mode** to **Live Mode**.
2. Generate **Live API Keys** and update the two Supabase secrets
   (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) with the live values.
3. Nothing in `order.html` needs to change — the Supabase URL/key stay the
   same either way.

---

## What's still manual after this

Getting paid and capturing orders is now automated. Two things still need
you (or a future integration) in the loop:

- **Illustration generation** — turning the uploaded photo + story details
  into actual illustrated pages. This isn't connected yet; see the earlier
  discussion on AI pipeline options.
- **Printing & shipping** — sending the finished PDF to a print-on-demand
  partner (Gelato, Peecho, or a local printer) once a book is ready.
- **Customer notifications** — emailing or WhatsApping the customer when
  their order status changes. Easiest first step: a Zapier/Make automation
  watching the `orders` table for new `paid` rows.


---

## Updating an existing database
If you already ran an older `1-database-schema.sql` in Supabase, also run
`4-migration-add-columns.sql` once (SQL Editor -> paste -> Run). It adds the columns
added since then (book size, gift bag, consent, etc.) and the reviews table.
If you re-deploy `2-create-razorpay-order.ts`, paste the new version over the old one
in the Supabase editor and click Deploy: prices are now calculated on the server.

---

## Photo check (new)

The order form now checks the child's photo **in the visitor's browser** before they can continue: file type (JPG/PNG/WebP), size (≤10 MB), resolution (≥500 px), exactly one face, face size, lighting and blur. Nothing is uploaded until the order is placed.

1. **Upload the new `lib/` folder** (with `lib/models/`) to Netlify together with `order.html`. Without it the check quietly turns off and your team reviews photos by hand.
2. The check only works on `http(s)` (your Netlify/real domain), not when double-clicking `order.html`.
3. Re-run `4-migration-add-columns.sql` in Supabase (adds `photo_notes`; tells you if a customer used "Use this photo anyway" or the photo had warnings).
4. Supabase → Storage → `story-photos` → set file size limit **10 MB** and allowed types `image/jpeg, image/png, image/webp` (browser checks can be bypassed, this is the real server-side limit).
5. Re-paste your Supabase URL + Publishable key into the fresh `order.html` and `index.html`.

### Photo upload rule (required)
Run `5-storage-policy.sql` once in Supabase's SQL Editor. Without it, uploads fail with "new row violates row-level security policy". Photos are saved privately; open them from Supabase → Storage → story-photos (the order row's `photo_url` holds the file path).


---

## Order alerts, reviews and cleanup (new)

Run these in order. Each is optional, but together they run the shop for you.

### A. Telegram alert for every paid order
1. In Telegram, message **@BotFather**, send `/newbot`, follow the steps. It gives you a **bot token**.
2. Open your new bot in Telegram and press **Start**, then send it any message ("hi").
3. In a browser, open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` (put your token in). Find `"chat":{"id":123456789` - that number is your **chat id**.
4. Supabase -> Edge Functions -> Secrets: add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
5. Redeploy `verify-payment` with the latest `3-verify-payment.ts`.
Never put the token in the website files or share it. If it leaks, message @BotFather `/revoke`.

### B. Show approved reviews on the homepage
1. Run `6-reviews-policy.sql` in the SQL Editor.
2. When a review arrives, open Table Editor -> reviews and change its `status` from `pending` to `approved`.
3. Upload the latest `index.html`.

### C. Cleanup job (unpaid orders + photos of delivered orders)
1. Run the latest `4-migration-add-columns.sql` (adds `delivered_at` and an automatic stamp).
2. Add the secret `CRON_SECRET` (any long random text you invent).
3. Deploy `7-cleanup-orders.ts` as a function named `cleanup-orders`.
4. Schedule it daily: Supabase -> Integrations -> Cron -> Create job -> type "Supabase Edge Function" -> function `cleanup-orders`, method POST, add header `x-cron-secret` with the same value as `CRON_SECRET`, schedule `0 3 * * *`.
5. Use it: when a book is delivered, set that order's `status` to `delivered`. Seven days later its photo is deleted automatically. Unpaid orders older than 24 hours are removed automatically.

---

## Portion 1 extras (photo tips, bulk enquiries, link preview, WhatsApp, analytics)

1. **Bulk & gifting enquiries:** run `8-enquiries.sql` once in the SQL Editor. Enquiries then appear in Table Editor -> `enquiries`.
2. **WhatsApp chat button:** open `index.html` and `order.html`, find `const WHATSAPP_NUMBER = '';` and put your number with country code, digits only, e.g. `'919876543210'`. Leave it empty and no button shows.
3. **Analytics (optional):** create a free Google Analytics 4 property, copy its Measurement ID (looks like `G-XXXXXXXXXX`) into `const GA_MEASUREMENT_ID = '';` in both pages. Leave empty to keep analytics off.
4. **Link preview:** `images/og-image.jpg` is what WhatsApp/Instagram show when someone shares your link. After uploading, test it by sending your link to yourself on WhatsApp (it can take a few minutes, and WhatsApp may cache an old preview).

---

## Portion 2: order form upgrades (email, gift, coupons, stricter checks)

**Do these IN THIS ORDER, or orders will fail while the three parts are out of step:**
1. Supabase -> SQL Editor: run `9-coupons-and-order-fields.sql` (new order columns + coupons).
2. Supabase -> Edge Functions: paste the latest `2-create-razorpay-order.ts` into `create-razorpay-order` and `3-verify-payment.ts` into `verify-payment`, Deploy both.
3. Netlify: upload the latest website folder (`order.html` is new).

**Making coupon codes** (Supabase -> SQL Editor):
```
insert into coupons (code, percent_off, max_discount, expires_at) values ('WELCOME10', 10, 150, now() + interval '90 days');
insert into coupons (code, amount_off, min_order, max_uses) values ('DIWALI100', 100, 799, 50);
update coupons set active = false where code = 'WELCOME10';   -- switch a code off
```
Customers can never see or list your codes. Use hard-to-guess codes for big discounts. A customer always pays at least Rs. 100. A code's use is counted when the payment is confirmed.

**What changed for customers:** they now give their name, email and a valid 10-digit mobile number; the pincode must look real; they can mark the book as a gift (recipient name + message); and can apply a coupon on the review step. The server re-checks every price and coupon, so editing the page cannot lower the price.

**For gifts:** the gift message arrives in your Telegram alert. Remember to print and include a small card with it.

---

## Portions 3, 4 and 5: order emails, tracking page, admin page, sibling bundle

**Do these IN THIS ORDER** (the three parts must go live together, otherwise sibling orders or emails can fail in between):
1. Supabase -> SQL Editor: run `10-tracking-admin-siblings.sql`.
2. Supabase -> Edge Functions: paste the latest `2-create-razorpay-order.ts` into `create-razorpay-order` and `3-verify-payment.ts` into `verify-payment` and Deploy both. Then **create one new function** named `admin-update-order` and paste `11-admin-update-order.ts` into it.
3. Netlify: upload the latest website folder. It now has two new pages: `track.html` and `admin.html`.

### A. Emails to customers (Resend, free for 100 emails a day)
Without this, everything still works; customers just don't get emails (you still get Telegram alerts).
1. Make a free account at resend.com -> Domains -> Add domain `mytuckedintales.com`. Resend shows 3 or 4 DNS records. Open GoDaddy -> your domain -> DNS -> add each record exactly as shown (type, name, value). Click Verify in Resend (can take 10 minutes to a few hours).
2. Resend -> API Keys -> Create (sending access). Copy it.
3. Supabase -> Edge Functions -> Secrets -> add:
   - `RESEND_API_KEY` = the key
   - `EMAIL_FROM` = `TuckedIn Tales <orders@mytuckedintales.com>`
   - `REPLY_TO` = `tuckedintales.12@gmail.com` (customers' replies come to your Gmail)
   - `SITE_URL` = `https://mytuckedintales.com`
4. Test: place a test order. The buyer gets "Your order is confirmed" with a Track button.
Emails are sent: when payment succeeds, and when you move an order to Illustrating, Printing, Shipped or Delivered from the admin page.

### B. Tracking page (`track.html`)
Customers open "Track Order" on the site (or the button in their email) and enter their order number + the phone number they gave. They only see the stage, the child's first name and story, and the courier details. They never see address, email or photo. Unpaid orders are not shown.

### C. Your private admin page (`admin.html`)
Open `yourdomain.com/admin.html`. It isn't linked anywhere and is hidden from Google, but the real protection is the login.
1. Supabase -> Authentication -> Users -> **Add user -> Create new user**: your email + a strong password, tick **Auto Confirm User**.
2. Supabase -> Authentication -> Sign In / Providers (or Settings): **turn OFF "Allow new users to sign up"**, so nobody else can create accounts.
3. Supabase -> SQL Editor, run this with YOUR email in lowercase:
   `insert into admins (email) values ('you@gmail.com');`
4. Open `/admin.html` and sign in. Only emails in the `admins` table get any data, even if someone knew the page address.

What you can do there:
- **Orders:** every paid order with child details, custom story request, photo notes, gift message, delivery address and the photos (opens private, time-limited links). Use "Move to next stage", or set the status yourself, add courier + tracking number + link, and tick "send update" to email the customer. Search by name, phone, email or order number.
- **Enquiries:** bulk enquiries; mark them replied/closed.
- **Reviews:** Approve (appears on the homepage) or Reject.
Status order: paid -> illustrating -> printing -> shipped -> delivered. When you set `delivered`, the 7-day photo deletion clock starts (cleanup job).

### D. Sibling bundle
On the order form (step 2) customers can add a second child: name, age, gender, story world and their own photo (with the same photo checks). The **second book is 10% off** at the same size (Rs. 629 on the 8x6, 719 on 9x6, 1,169 on 12x9). Coupons apply to the whole bundle.
- To change the 10%: change `SIBLING_DISCOUNT_PERCENT` (search for that word) in BOTH `order.html` and `2-create-razorpay-order.ts`, then upload the site and redeploy the function. The two numbers must match.
- A bundle is stored as two rows with the same order number. The total is on the first row. The Telegram alert and admin page show them together. Custom story and gift bag apply to the first book only.

### E. Things to know
- `track_order` needs the order number AND the phone, so order numbers alone can't be used to peek at someone's order.
- Every part was tested before shipping, but test one real order end to end (pay -> email -> admin -> tracking) in Razorpay test mode before going live.

### F. Story language and the single gift option (latest change)
- There is now ONE gift option (step 3: "This is a gift"). The gift bag (+Rs. 30) is a tick-box inside it, so it only appears when the book is a gift. The server ignores a gift bag on a non-gift order.
- Customers choose a **story language** per book (step 2). Languages offered: English, Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Kannada. **Only keep languages you can really produce.** To remove or add one, edit the `LANGUAGES` list in `order.html` and the same `LANGUAGES` list in `2-create-razorpay-order.ts`, then upload and redeploy.
- The language shows in your Telegram alert, the customer's email and the admin page. Run the latest `10-tracking-admin-siblings.sql` (it adds the `story_language` column; safe to re-run).
- Note: your illustration/text pipeline must actually write the story in that language. Check that your AI text tool handles each language well before you offer it.
