-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Lets the homepage READ only reviews you have approved.
-- Pending and rejected reviews stay private.

drop policy if exists "Anyone can read approved reviews" on reviews;
create policy "Anyone can read approved reviews" on reviews
  for select
  to anon
  using (status = 'approved');

-- To publish a review: Table Editor -> reviews -> change that row's status
-- from 'pending' to 'approved'. It shows on the homepage right away.
