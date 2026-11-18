-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Adds: order tracking, the admin login system, and sibling-bundle support.
-- Safe to run twice.

-- ============ 1. New order columns ============
alter table orders add column if not exists is_sibling boolean default false;   -- true on the 2nd book of a sibling bundle
alter table orders add column if not exists courier text;
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists tracking_url text;
alter table orders add column if not exists status_updated_at timestamptz default now();
alter table orders add column if not exists story_language text default 'English';
-- status flow: pending -> paid -> illustrating -> printing -> shipped -> delivered   (also: cancelled, verification_failed)

-- ============ 2. Admins ============
create table if not exists admins (
  email text primary key check (email = lower(email))
);
alter table admins enable row level security;     -- no policies: nobody can read it from the website

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- Admins can read everything they need; visitors still can't read anything.
drop policy if exists "Admins can read orders" on orders;
create policy "Admins can read orders" on orders for select to authenticated using (is_admin());

drop policy if exists "Admins can read enquiries" on enquiries;
create policy "Admins can read enquiries" on enquiries for select to authenticated using (is_admin());
drop policy if exists "Admins can update enquiries" on enquiries;
create policy "Admins can update enquiries" on enquiries for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Admins can read all reviews" on reviews;
create policy "Admins can read all reviews" on reviews for select to authenticated using (is_admin());
drop policy if exists "Admins can update reviews" on reviews;
create policy "Admins can update reviews" on reviews for update to authenticated using (is_admin()) with check (is_admin());

-- Admins can open customers' photos (private bucket) from the admin page
drop policy if exists "Admins can view order photos" on storage.objects;
create policy "Admins can view order photos" on storage.objects
  for select to authenticated using (bucket_id = 'story-photos' and is_admin());

-- ============ 3. Order tracking for customers ============
-- A customer must know BOTH the order number and the phone number on the order.
-- Returns only status info: never address, email, photo or phone.
create or replace function track_order(p_ref text, p_phone text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders%rowtype;
  digits text;
  kids json;
begin
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(trim(coalesce(p_ref, ''))) < 8 or char_length(digits) < 4 then
    return json_build_object('found', false);
  end if;

  select * into o from orders
   where razorpay_order_id = trim(p_ref)
     and coalesce(is_sibling, false) = false
     and status not in ('pending', 'verification_failed')
     and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 4) = right(digits, 4)
   limit 1;
  if not found then
    return json_build_object('found', false);
  end if;

  select json_agg(json_build_object('child', split_part(child_name, ' ', 1), 'story', story_theme) order by is_sibling nulls first)
    into kids from orders where razorpay_order_id = o.razorpay_order_id;

  return json_build_object(
    'found', true,
    'status', o.status,
    'ordered_on', o.created_at,
    'updated_on', o.status_updated_at,
    'book_size', o.book_size,
    'books', kids,
    'courier', o.courier,
    'tracking_number', o.tracking_number,
    'tracking_url', o.tracking_url
  );
end;
$$;
grant execute on function track_order(text, text) to anon, authenticated;

-- ============ 4. Make yourself an admin ============
-- First create your login: Authentication -> Users -> Add user -> Create new user
--   (enter your email + a strong password, tick "Auto Confirm User").
-- Then run this with YOUR email (lowercase):
--   insert into admins (email) values ('your-email@gmail.com');
