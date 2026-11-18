-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Lets website visitors UPLOAD a photo into the private "story-photos" bucket.
-- There is deliberately NO select/read policy, so nobody can list or download
-- photos from the website. Only you (via the Supabase dashboard) can view them.

drop policy if exists "Visitors can upload order photos" on storage.objects;
create policy "Visitors can upload order photos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'story-photos');
