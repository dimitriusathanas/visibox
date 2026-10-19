-- The shared family fridge: households, their members, items and the event log.
-- Every row belongs to a household; members can read and change their own
-- household's rows and nothing else (row-level security).

create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  join_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Items are stored whole (data = the Item type in src/shared/types.ts); the
-- columns beside it are copies used for queries such as "expiring today".
create table public.items (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  data jsonb not null,
  location text not null check (location in ('fridge', 'freezer', 'pantry')),
  eat_by date,
  toss_by date,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create index items_household on public.items (household_id);
create index items_household_eat_by on public.items (household_id, eat_by);

create table public.item_events (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null,
  type text not null,
  data jsonb not null,
  at timestamptz not null default now()
);

create index item_events_household_at on public.item_events (household_id, at desc);

-- Membership check used by every policy. Security definer so the policy on
-- household_members can call it without recursing into itself.
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.items enable row level security;
alter table public.item_events enable row level security;

create policy "members read their household" on public.households
  for select using (public.is_member(id));
create policy "owners rename their household" on public.households
  for update using (
    exists (select 1 from public.household_members m
            where m.household_id = id and m.user_id = auth.uid() and m.role = 'owner')
  );

create policy "members see each other" on public.household_members
  for select using (public.is_member(household_id));
create policy "members update their own name" on public.household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members can leave" on public.household_members
  for delete using (user_id = auth.uid());

create policy "members read items" on public.items
  for select using (public.is_member(household_id));
create policy "members add items" on public.items
  for insert with check (public.is_member(household_id));
create policy "members change items" on public.items
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members remove items" on public.items
  for delete using (public.is_member(household_id));

create policy "members read events" on public.item_events
  for select using (public.is_member(household_id));
create policy "members log events" on public.item_events
  for insert with check (public.is_member(household_id));
create policy "members fix events" on public.item_events
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members undo events" on public.item_events
  for delete using (public.is_member(household_id));

-- Creating and joining go through functions so the membership row and the
-- household are written together, and join codes can't be listed.
create or replace function public.create_household(p_name text, p_display_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.households (name, created_by) values (p_name, auth.uid()) returning * into h;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (h.id, auth.uid(), coalesce(p_display_name, ''), 'owner');
  return h;
end;
$$;

create or replace function public.join_household(p_code text, p_display_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into h from public.households where join_code = upper(trim(p_code));
  if h.id is null then
    raise exception 'invalid code';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (h.id, auth.uid(), coalesce(p_display_name, ''))
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- Live sync: family members' phones subscribe to changes in these tables.
alter table public.items replica identity full;
alter table public.item_events replica identity full;
alter publication supabase_realtime add table public.items, public.item_events;
