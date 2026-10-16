-- Family Tree — private messages (run once, after 0001: SQL Editor → New query → paste → Run)
--
-- Privacy rules:
--   * Only the people in a conversation can read it — not even the tree owner.
--   * You can only start a conversation with people who share a Family Wall with you.
--   * You can only send as yourself, and only delete your own messages.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',             -- group name ('' for one-to-one)
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default '',
  last_read_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,                      -- so a message sent offline is never delivered twice
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users on delete cascade,
  sender_name text not null default '',
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists messages_conversation on public.messages (conversation_id, created_at);

-- ---------- helpers ----------

create or replace function public.is_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = c and user_id = auth.uid())
$$;

create or replace function public.is_active_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = c and user_id = auth.uid() and left_at is null)
$$;

-- People who share at least one Family Wall with me (the owner and accepted members), with the name they go by there.
create or replace function public.my_contacts()
returns table (user_id uuid, name text, person_id text, tree_name text)
language sql stable security definer set search_path = public as $$
  with my_trees as (
    select id from trees where owner_id = auth.uid()
    union
    select tree_id from wall_members where user_id = auth.uid() and status = 'accepted'
  ), people as (
    select t.owner_id as user_id, t.owner_name as name, '' as person_id, t.name as tree_name
    from trees t join my_trees m on m.id = t.id
    union all
    select w.user_id, w.person_name, w.person_id, t.name
    from wall_members w join trees t on t.id = w.tree_id join my_trees m on m.id = w.tree_id
    where w.status = 'accepted' and w.user_id is not null
  )
  select distinct on (user_id) user_id, name, person_id, tree_name
  from people where user_id <> auth.uid()
  order by user_id, name
$$;

create or replace function public.shares_wall_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.my_contacts() c where c.user_id = other)
$$;

-- ---------- row-level security ----------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to authenticated using (public.is_participant(id));

drop policy if exists conv_members_read on public.conversation_members;
create policy conv_members_read on public.conversation_members for select to authenticated using (public.is_participant(conversation_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (public.is_participant(conversation_id));
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and not deleted and public.is_active_participant(conversation_id));
drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- Keep conversations in order of their latest message.
create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  update conversation_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages for each row execute function public.touch_conversation();

-- ---------- functions the app calls ----------

-- Start a conversation (or reopen the existing one-to-one with that person).
create or replace function public.start_conversation(others uuid[], group_title text default '', my_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c uuid;
  o uuid;
  everyone uuid[];
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  others := array(select distinct x from unnest(others) x where x is not null and x <> auth.uid());
  if coalesce(array_length(others, 1), 0) = 0 then raise exception 'Choose who to message.'; end if;
  foreach o in array others loop
    if not public.shares_wall_with(o) then raise exception 'You can only message people who share a Family Wall with you.'; end if;
  end loop;
  if array_length(others, 1) = 1 and coalesce(group_title, '') = '' then
    select m1.conversation_id into c
    from conversation_members m1
    join conversation_members m2 on m2.conversation_id = m1.conversation_id and m2.user_id = others[1]
    join conversations cv on cv.id = m1.conversation_id and cv.title = ''
    where m1.user_id = auth.uid()
      and (select count(*) from conversation_members x where x.conversation_id = m1.conversation_id) = 2
    limit 1;
    if c is not null then
      update conversation_members set left_at = null where conversation_id = c and user_id = auth.uid();
      return c;
    end if;
  end if;
  insert into conversations (title, created_by) values (coalesce(group_title, ''), auth.uid()) returning id into c;
  insert into conversation_members (conversation_id, user_id, name) values (c, auth.uid(), coalesce(my_name, ''));
  insert into conversation_members (conversation_id, user_id, name)
    select c, k.user_id, k.name from public.my_contacts() k where k.user_id = any (others);
  return c;
end $$;

create or replace function public.mark_read(c uuid) returns void
language sql security definer set search_path = public as $$
  update conversation_members set last_read_at = now() where conversation_id = c and user_id = auth.uid()
$$;

create or replace function public.leave_conversation(c uuid) returns void
language sql security definer set search_path = public as $$
  update conversation_members set left_at = now() where conversation_id = c and user_id = auth.uid()
$$;

-- My conversations with the latest message and how many I haven't read.
create or replace function public.my_conversations()
returns table (id uuid, title text, members jsonb, last_body text, last_sender text, last_at timestamptz, unread integer, left_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.title,
    (select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', m.name, 'left', m.left_at is not null) order by m.name)
       from conversation_members m where m.conversation_id = c.id),
    lm.body, lm.sender_name, c.last_message_at,
    (select count(*)::int from messages x where x.conversation_id = c.id and not x.deleted and x.sender_id <> auth.uid() and x.created_at > me.last_read_at),
    me.left_at
  from conversations c
  join conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (select body, sender_name from messages where conversation_id = c.id and not deleted order by created_at desc limit 1) lm on true
  order by c.last_message_at desc
$$;

-- The wall directory now includes each accepted member's account id, so the app can start a message with them.
drop function if exists public.wall_directory(uuid);
create or replace function public.wall_directory(t uuid)
returns table (member_id uuid, person_id text, person_name text, status text, is_me boolean,
               can_post boolean, can_photos boolean, can_suggest boolean,
               share_status boolean, share_photos boolean, share_birthday boolean, share_location boolean, share_contact boolean,
               email text, birthday text, location text, invited_at timestamptz, joined_at timestamptz, online boolean, user_id uuid)
language sql stable security definer set search_path = public as $$
  select m.id, m.person_id, m.person_name, m.status, m.user_id = auth.uid(),
         m.can_post, m.can_photos, m.can_suggest,
         m.share_status, m.share_photos, m.share_birthday, m.share_location, m.share_contact,
         case when public.is_tree_owner(t) or m.share_contact or m.user_id = auth.uid() then m.email else '' end,
         case when m.share_birthday then m.birthday else '' end,
         case when m.share_location then m.location else '' end,
         m.invited_at, m.joined_at,
         coalesce(m.last_seen > now() - interval '5 minutes', false),
         case when m.status = 'accepted' then m.user_id end
  from wall_members m
  where m.tree_id = t and public.can_read_wall(t)
    and (m.status = 'accepted' or public.is_tree_owner(t))
$$;

revoke all on function public.my_contacts, public.start_conversation, public.mark_read, public.leave_conversation,
  public.my_conversations, public.wall_directory from public, anon;
grant execute on function public.my_contacts, public.start_conversation, public.mark_read, public.leave_conversation,
  public.my_conversations, public.wall_directory to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.conversation_members; exception when others then null; end;
end $$;
