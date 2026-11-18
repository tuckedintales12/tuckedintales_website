-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Adds: email / gift / recipient fields to orders, and a private coupons system.

-- 1. New order columns
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists email text;
alter table orders add column if not exists is_gift boolean default false;
alter table orders add column if not exists recipient_name text;
alter table orders add column if not exists gift_message text;
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount_amount int default 0;

-- 2. Coupons table (private: no policies, so the website can never read or list codes)
create table if not exists coupons (
  code text primary key,
  percent_off int check (percent_off between 1 and 90),   -- e.g. 10 = 10% off
  amount_off int check (amount_off >= 1),                  -- or a flat rupee amount
  max_discount int,                                        -- cap for percentage codes (rupees)
  min_order int default 0,                                 -- minimum order value (rupees)
  max_uses int,                                            -- null = unlimited
  used_count int default 0,
  expires_at timestamptz,                                  -- null = never expires
  active boolean default true,
  check (percent_off is not null or amount_off is not null)
);
alter table coupons enable row level security;

-- 3. Check a code. Safe for the website to call: it only returns the discount, never the table.
create or replace function check_coupon(p_code text, p_subtotal int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c coupons%rowtype;
  d int;
begin
  select * into c from coupons where upper(code) = upper(trim(p_code));
  if not found or not c.active then
    return json_build_object('valid', false, 'discount', 0, 'message', 'This code isn''t valid.');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return json_build_object('valid', false, 'discount', 0, 'message', 'This code has expired.');
  end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then
    return json_build_object('valid', false, 'discount', 0, 'message', 'This code has been fully used.');
  end if;
  if p_subtotal < coalesce(c.min_order, 0) then
    return json_build_object('valid', false, 'discount', 0,
      'message', 'This code needs an order of at least Rs. ' || c.min_order || '.');
  end if;

  if c.percent_off is not null then
    d := floor(p_subtotal * c.percent_off / 100.0);
  else
    d := c.amount_off;
  end if;
  if c.max_discount is not null then d := least(d, c.max_discount); end if;
  d := greatest(0, least(d, p_subtotal - 100));   -- customer always pays at least Rs. 100

  if d <= 0 then
    return json_build_object('valid', false, 'discount', 0, 'message', 'This code can''t be applied to this order.');
  end if;
  return json_build_object('valid', true, 'discount', d, 'code', c.code,
    'message', 'Code applied! You save Rs. ' || d || '.');
end;
$$;
grant execute on function check_coupon(text, int) to anon, authenticated;

-- 4. Count a use. Only your server (service role) may call this, never the website.
create or replace function use_coupon(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update coupons set used_count = used_count + 1 where upper(code) = upper(trim(p_code));
$$;
revoke execute on function use_coupon(text) from public, anon, authenticated;

-- 5. Make your own codes (examples, remove the leading -- to use):
-- insert into coupons (code, percent_off, max_discount, expires_at) values ('WELCOME10', 10, 150, now() + interval '90 days');
-- insert into coupons (code, amount_off, min_order, max_uses)       values ('DIWALI100', 100, 799, 50);
-- To switch a code off:  update coupons set active = false where code = 'WELCOME10';
