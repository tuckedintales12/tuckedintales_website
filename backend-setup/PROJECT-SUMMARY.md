# TuckedIn Tales — Project Summary
Last updated: late September 2026. Paste this into a new chat to continue.

## 1. What it is
Personalized children's storybooks (India). A parent uploads a photo of their child, picks a story world, and receives a printed 18-page book where the child is the hero.

## 2. Brand & addresses
- Name: TuckedIn Tales. Tagline: "Where Little Dreams Become Big Stories".
- Style: bright, playful, kid-friendly. Navy #172c59, sky blue, mint, cream, pink, gold. Baloo 2 (headings) + Quicksand (body). Chunky "sticker" buttons.
- Logo files (user-supplied): images/logo-hero.png (full badge), images/logo-mark.png (small circular mark).
- Live site: tuckedintales.netlify.app (Netlify, set to public).
- Domain: mytuckedintales.com, bought at GoDaddy. To connect: in GoDaddy DNS edit the A record "@" (currently "Parked") to the Netlify IP, and the CNAME "www" to tuckedintales.netlify.app — but ALWAYS use the exact values Netlify's Domain management page shows. Leave the NS, SOA, _domainconnect and _dmarc records alone. STATUS: unknown whether done/verified.
- Email in the site is a placeholder: tuckedintales.12@gmail.com. Plan: free Zoho Mail on the new domain (hello@mytuckedintales.com), then update footer + policy pages.

## 3. Product & pricing (CURRENT)
- Softcover only, 18 illustrated pages. Hardcover and Keepsake Box are removed for now (can be restored later).
- Sizes: 8"x6" = Rs 699, 9"x6" = Rs 799, 12"x9" = Rs 1,299 (the size carries the full price).
- Add-ons: custom story (customer types a description) +Rs 299; gift bag +Rs 30.
- 8 story worlds: Master Chef, Jungle Ranger, Space Explorer, Dino Discoverer, Deep Sea Diver, Little Maestro, My Friend Ganesha, A Day with Little Krishna. Each has a character illustration (images/char-*.png).

## 4. Files (deploy ALL together; keep the images/ folder next to the HTML)
- index.html — homepage (renamed from tuckedintales.html; Netlify needs index.html)
- order.html — 5-step order flow
- privacy-policy.html, shipping-policy.html, refund-policy.html, terms.html
- images/ — logos, char-*.png (8), sample-*.jpg (4), click-sound.mp3 (PLACEHOLDER 2-second tone — replace with the real 5-second file, same filename)
- 1-database-schema.sql, 4-migration-add-columns.sql, 2-create-razorpay-order.ts, 3-verify-payment.ts, SETUP-GUIDE.md
- tuckedintales-logo-system.html / tuckedintales-logo-mark.svg are OBSOLETE (old logo) — safe to ignore/delete.

## 5. Order flow (order.html)
1 Photo upload (preview) -> 2 Child name, age stepper (1-15), gender (Boy/Girl), story world, optional custom story, optional gift bag -> 3 Size + delivery address/city/pincode/phone -> 4 Review with itemised total + REQUIRED parent-consent checkbox (AI photo processing, deletion after fulfilment) -> pay via Razorpay -> 5 Confirmation. Homepage pricing buttons pre-select a size via ?size=8x6 / 9x6 / 12x9.

## 6. Homepage features
Hero with logo, animated stats (only "Story Worlds" and "Average Rating" remain; "Storybooks Delivered" and "Happy Families" were removed on purpose), connected how-it-works steps, 8 story cards (click = play sound, one at a time; double-click = two-page preview modal; hover effect), sample gallery, softcover size pricing, reviews + customer review form, FAQ accordion, trust/CTA, footer with policy links. Tested clean at 360/375/390/412px widths.

## 7. Backend
- Supabase (project exists; Project URL = https://<project-ref>.supabase.co from Project Settings > General or the dashboard address bar). Supabase now calls the old "anon key" the "Publishable key" (sb_publishable_...). Put THAT in SUPABASE_ANON_KEY. NEVER put the Secret key (sb_secret_...) in any website file.
- order.html and index.html each have a CONFIG block (SUPABASE_URL / SUPABASE_ANON_KEY). Until real values are pasted, order.html shows an orange "Backend not connected" banner. STATUS: unknown whether pasted.
- Database: run 1-database-schema.sql on a fresh project. If an OLDER schema was already run, run 4-migration-add-columns.sql once (adds child_gender, book_size, book_size_price, custom_description, gift_bag, consent_ai_processing and the reviews table). Private storage bucket must be named story-photos.
- Edge functions: create-razorpay-order (now calculates the price on the server from book_size + add-ons, ignoring any amount from the browser) and verify-payment. Secrets needed: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET. If the old version was already deployed, re-deploy the new file. If prices ever change, update BOTH the page and the SIZE_PRICES table in the function.
- Razorpay: test mode first (test card 4111 1111 1111 1111), then KYC + live keys.
- Reviews: submissions go into a 'reviews' table as pending; you copy approved ones into the page by hand.

## 8. Illustration pipeline (NOT BUILT YET — the biggest remaining piece)
Plan = template + face swap: create ONE master illustrated template per page per theme (18 pages x 8 themes = 144 images; start with ONE theme, e.g. Master Chef), then swap in each customer's child's face with Segmind Faceswap v5 (browser Playground to test, API later; pay-as-you-go). Template faces must be clear and mostly front-on. Spot-check every swapped page before printing. Compute cost per book (18 swaps + print + shipping) against the Rs 699 price before launch.
Privacy design: Segmind's model page said results are kept ~1 hour; Akool keeps uploads up to 365 days unless you request deletion — re-verify any provider's current policy before relying on it. Consumer ChatGPT trains on uploads by default (Data Controls toggle / Temporary Chat / API-Team-Enterprise avoid that). Strip EXIF/GPS from photos. Keep the storage bucket private.

## 9. Privacy promises the business MUST actually keep
The consent checkbox and the Privacy Policy now state that the photo is deleted from TuckedIn Tales' systems once the order is fulfilled and is processed by a third-party AI service only to make the illustrations. Build a real habit/process for deleting photos after each order, or change the wording. India's DPDP Act 2023 requires verifiable parental consent for children's data — consider legal advice.

## 10. Selling on Amazon (in progress)
Printed books (HSN 4901/4903) are Nil-rated (0% GST), so the "A_GEN_EXEMPT (0%)" tax code fits the plain book. Exempt-goods sellers may register with PAN (no GSTIN) and must use Fulfilled-by-Merchant (not FBA). The gift bag (and the removed Keepsake Box) may NOT be exempt — confirm with a CA before listing bundles. Amazon charges referral fees and keeps the customer relationship — price accordingly. This is not tax advice.

## 11. Google Business Profile
Listing exists but is categorised "Kindergarten School" — change to something like Gift Shop / personalized products. Description (750-char limit, no URLs/phones/prices) was drafted. Add the logo and sample images in the owner view (business.google.com).

## 12. MUST FIX BEFORE A PUBLIC LAUNCH (honesty/legal)
1. The three testimonials (Priya S., Rohit M., Anjali K.) and the "4.9/5 Average Rating" are PLACEHOLDERS I wrote — not real customers. Fake reviews/ratings can breach Indian consumer-protection rules and destroy trust. Replace with genuine reviews or remove them.
2. "Real sample pages from real TuckedIn Tales storybooks" and the sample gallery are AI-generated mock-ups of family members — soften the wording to "sample pages" until real books have shipped. Keep written permission from the parents of any child shown.
3. Only promise "7-10 day delivery", "pan-India" and "free redo" once the printing/fulfilment process is proven.
4. Replace the placeholder email, and the 2-second placeholder click sound.

## 13. Status
DONE: homepage, order flow, 4 policy pages, mobile QA, consent checkbox, server-side pricing code, DB migration, Netlify site live, domain bought.
NEEDS YOU: finish DNS connection; paste Supabase config; run SQL (schema or migration); create storage bucket; add Razorpay test keys + deploy the 2 functions; upload the real click sound; set up Zoho email; fix Google Business category.
NOT STARTED: illustration pipeline (144 templates + Segmind), printing/fulfilment partner, one full real test order, launch.

## 14. Practical notes
- The assistant's sandbox can reset: always re-download the latest files from the chat and re-upload the whole folder to Netlify (drag-and-drop replaces the site).
- Local testing: open index.html with the images/ folder beside it.

## Photo validation
Browser-side checks via self-hosted face-api (`lib/`, MIT licence). Hard blocks: wrong type, HEIC, >10 MB, <500 px, damaged file, no face, several faces (customer can override no/multi-face with "Use this photo anyway"; flagged in `photo_notes`). Warnings only: small face, dark, overexposed, blurry.


## Portions 3-5 (emails, tracking, admin, siblings)
- **track.html**: customer order tracking (order number + phone) via `track_order` SQL function. Linked from nav, footer, thank-you screen and emails.
- **admin.html**: private admin (Supabase Auth + `admins` table + RLS). Orders (photos via signed URLs, status/tracking, emails), Enquiries, Reviews. Writes to orders go only through the `admin-update-order` Edge Function.
- **Emails** via Resend (optional secrets): confirmation + stage updates. Privacy policy has an "Emails we send you" section.
- **Sibling bundle**: second child on step 2, second book 10% off (server-calculated), two order rows sharing one Razorpay order id (`is_sibling`).
- Files added: `10-tracking-admin-siblings.sql`, `11-admin-update-order.ts`, `track.html`, `admin.html`. Updated: `order.html`, `index.html`, `2-create-razorpay-order.ts`, `3-verify-payment.ts`, `privacy-policy.html`.
- Not built (needs your assets): demo video, new story worlds / Hindi books, real flip-through preview, hardcover/keepsake box, referral offer.
