-- Run this in Supabase Dashboard → SQL Editor → New query → Run

create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  child_name text,
  child_age int,
  child_gender text,
  photo_notes text,
  story_theme text,
  edition text,
  book_size text,
  book_size_price int default 0,

  customize_addon boolean default false,
  custom_description text,
  gift_bag boolean default false,
  consent_ai_processing boolean default false,

  address text,
  city text,
  pincode text,
  phone text,
  photo_url text,

  amount int,                 -- final amount in rupees
  razorpay_order_id text,
  razorpay_payment_id text,
  status text default 'pending',  -- pending | paid | delivered | verification_failed
  delivered_at timestamptz         -- set when you mark the order 'delivered'
);

-- Row Level Security: lock the table down, then open only what's needed.
alter table orders enable row level security;

-- The edge functions use the service role key, which bypasses RLS entirely,
-- so no public policies are required for normal operation.
-- This keeps the table fully private from the browser — exactly what you want
-- for order data that includes children's photos and addresses.


-- ============================================================
-- Reviews table — lets customers submit reviews directly from
-- the homepage. Submissions are inserted with the browser's public
-- (anon) key, so this table needs its own insert policy — unlike
-- orders, which only the edge functions ever touch.
-- ============================================================
create table reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  rating int,
  comment text,
  status text default 'pending'   -- pending | approved | rejected
);

alter table reviews enable row level security;

-- Anyone can submit a review (this is what lets the homepage form work).
create policy "Anyone can submit a review" on reviews
  for insert with check (true);

-- No select policy is created, so reviews are NOT publicly readable via
-- the API — only visible to you in the Supabase dashboard (Table Editor).
-- This is intentional: it stops random visitors from pulling every
-- submitted review (including pending/rejected ones) straight from the
-- database. To display approved reviews on the site, either:
--   (a) manually copy approved ones into the static HTML (simplest), or
--   (b) add a second policy scoped to status = 'approved' and fetch
--       those from the page once you're ready to automate it.
