-- Run this ONLY if you already ran an older version of 1-database-schema.sql
-- in Supabase (SQL Editor -> New query -> paste -> Run). It is safe to run twice.
-- If you have not created the tables yet, skip this file and just run 1-database-schema.sql.

alter table orders add column if not exists child_gender text;
alter table orders add column if not exists photo_notes text;
alter table orders add column if not exists book_size text;
alter table orders add column if not exists book_size_price int default 0;
alter table orders add column if not exists custom_description text;
alter table orders add column if not exists gift_bag boolean default false;
alter table orders add column if not exists consent_ai_processing boolean default false;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  rating int,
  comment text,
  status text default 'pending'
);
alter table reviews enable row level security;
drop policy if exists "Anyone can submit a review" on reviews;
create policy "Anyone can submit a review" on reviews for insert with check (true);

-- Used by the cleanup job: when an order was marked 'delivered'
alter table orders add column if not exists delivered_at timestamptz;

-- Automatically stamp delivered_at when you change an order's status to 'delivered'
create or replace function set_delivered_at() returns trigger as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_delivered_at on orders;
create trigger trg_set_delivered_at
  before update on orders
  for each row execute function set_delivered_at();
