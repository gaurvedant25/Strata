-- Gym Log — run this once in the Supabase SQL editor.
--
-- Records are stored whole, as jsonb, rather than as a table per type. The app
-- owns these shapes and changes them often; a relational mirror would need a
-- migration every time a field moved, and buys nothing here because the server
-- never queries inside a record. It only ever answers "what changed since".

create table if not exists public.gym_records (
  user_id    uuid    not null references auth.users on delete cascade,
  kind       text    not null,
  id         text    not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  data       jsonb   not null,
  primary key (user_id, kind, id)
);

-- Every sync is "give me everything newer than X for me", so that is the index.
create index if not exists gym_records_since
  on public.gym_records (user_id, updated_at);

alter table public.gym_records enable row level security;

-- The anon key ships in the app bundle, so this policy is the only thing
-- standing between one account's training log and another's. It has to cover
-- reads and writes, and `with check` is what stops a client writing rows
-- addressed to somebody else's user_id.
drop policy if exists "own rows only" on public.gym_records;
create policy "own rows only" on public.gym_records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
