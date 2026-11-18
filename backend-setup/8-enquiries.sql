-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Stores "Bulk & gifting" enquiries from the homepage.
-- Visitors can only ADD an enquiry; they can never read any.

create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null check (char_length(name) between 1 and 100),
  organisation text check (organisation is null or char_length(organisation) <= 120),
  contact text not null check (char_length(contact) between 5 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 30),
  message text check (message is null or char_length(message) <= 1000),
  status text default 'new'      -- new | replied | closed
);

alter table enquiries enable row level security;

drop policy if exists "Anyone can send an enquiry" on enquiries;
create policy "Anyone can send an enquiry" on enquiries
  for insert to anon with check (true);

-- No select policy on purpose: read enquiries in Table Editor -> enquiries.
