-- 1. Usernames must be unique so you can find friends by username
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

-- 2. Update the sign-up robot: if a username is taken, add 4 random characters
--    (otherwise test@gmail.com and test@yahoo.com would both try to be "test")
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base text := split_part(new.email, '@', 1);
  candidate text := base;
begin
  if exists (select 1 from public.profiles where lower(username) = lower(candidate)) then
    candidate := base || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

-- 3. FRIENDSHIPS: one row per friend request
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

create policy "see own friendships" on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy "send friend requests" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

create policy "accept requests sent to me" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

create policy "remove friendships" on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- 4. LEADERBOARD: last-7-day totals for you and your accepted friends only
create or replace function public.friend_leaderboard()
returns table (
  user_id uuid,
  username text,
  workouts bigint,
  volume numeric,
  sets bigint,
  active_days bigint
)
language sql
stable
security definer set search_path = ''
as $$
  with circle as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted'
      and auth.uid() in (f.requester_id, f.addressee_id)
  )
  select
    c.id,
    p.username,
    count(distinct w.id),
    coalesce(sum(s.reps * s.weight_lbs), 0),
    count(s.id),
    count(distinct (w.performed_at at time zone 'UTC')::date)
  from circle c
  join public.profiles p on p.id = c.id
  left join public.workouts w
    on w.user_id = c.id
   and w.performed_at >= now() - interval '7 days'
   and w.performed_at <= now()
  left join public.sets s on s.workout_id = w.id
  group by c.id, p.username;
$$;

revoke execute on function public.friend_leaderboard() from public, anon;
grant execute on function public.friend_leaderboard() to authenticated;