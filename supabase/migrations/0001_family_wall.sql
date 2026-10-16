-- Family Tree — Family Wall (run once in Supabase: SQL Editor → New query → paste → Run)
--
-- Privacy rules (row-level security):
--   * Only the tree owner and accepted members can read a tree's wall.
--   * Only the owner can invite, remove members, remove posts and approve life events.
--   * Members change their own sharing choices only through the functions below,
--     so they can never change their own permissions.
--   * Living members' details (birthday, town, email) are only shown when they switch sharing on.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,                     -- the tree's id in the desktop app
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  owner_name text not null default '',
  name text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, local_id)
);

create table if not exists public.wall_members (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees on delete cascade,
  person_id text not null default '',         -- the relative's id in the owner's tree
  person_name text not null default '',
  email text not null,
  user_id uuid references auth.users on delete set null,
  can_view boolean not null default true,
  can_post boolean not null default true,
  can_photos boolean not null default true,
  can_suggest boolean not null default false,
  share_status boolean not null default false,  -- every opt-in starts off
  share_photos boolean not null default false,
  share_birthday boolean not null default false,
  share_location boolean not null default false,
  share_contact boolean not null default false,
  birthday text not null default '',          -- "14 Mar", only shown when share_birthday
  location text not null default '',          -- town, only shown when share_location
  status text not null default 'pending' check (status in ('pending', 'accepted', 'left', 'removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  last_seen timestamptz,
  unique (tree_id, email)
);
create index if not exists wall_members_user on public.wall_members (user_id);
create index if not exists wall_members_email on public.wall_members (lower(email));

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,                      -- set by the app so a post queued offline is never sent twice
  tree_id uuid not null references public.trees on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  author_member_id uuid references public.wall_members on delete set null, -- null = the tree owner
  author_name text not null default '',
  type text not null default 'text' check (type in ('text', 'photo', 'life')),
  body text not null default '',
  photo_path text,
  photo_alt text not null default '',
  life jsonb,                                 -- { "type": "New home", "date": "Oct 2026", "place": "Cairns" }
  life_status text check (life_status in ('pending', 'approved', 'declined')),
  tags jsonb not null default '[]',           -- [{ "id": "<person id>", "name": "Jack Pascoe" }]
  created_at timestamptz not null default now(),
  removed boolean not null default false
);
create index if not exists posts_tree on public.posts (tree_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  post_id uuid not null references public.posts on delete cascade,
  tree_id uuid not null references public.trees on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  removed boolean not null default false
);
create index if not exists comments_post on public.comments (post_id, created_at);

create table if not exists public.reactions (
  post_id uuid not null references public.posts on delete cascade,
  tree_id uuid not null references public.trees on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.hidden_posts (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (post_id, user_id)
);

-- ---------- helpers (run with the definer's rights so policies can't loop) ----------

create or replace function public.my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

create or replace function public.is_tree_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trees where id = t and owner_id = auth.uid())
$$;

create or replace function public.is_wall_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wall_members where tree_id = t and user_id = auth.uid() and status = 'accepted' and can_view)
$$;

create or replace function public.can_read_wall(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_tree_owner(t) or public.is_wall_member(t)
$$;

create or replace function public.can_post(t uuid, with_photo boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_tree_owner(t) or exists (
    select 1 from wall_members
    where tree_id = t and user_id = auth.uid() and status = 'accepted' and can_post and (not with_photo or can_photos)
  )
$$;

create or replace function public.my_member_id(t uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from wall_members where tree_id = t and user_id = auth.uid() and status = 'accepted'
$$;

-- ---------- row-level security ----------

alter table public.trees enable row level security;
alter table public.wall_members enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.hidden_posts enable row level security;

drop policy if exists trees_read on public.trees;
create policy trees_read on public.trees for select to authenticated
  using (owner_id = auth.uid() or public.is_wall_member(id)
         or exists (select 1 from public.wall_members m where m.tree_id = trees.id and lower(m.email) = public.my_email() and m.status = 'pending'));
drop policy if exists trees_insert on public.trees;
create policy trees_insert on public.trees for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists trees_update on public.trees;
create policy trees_update on public.trees for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists trees_delete on public.trees;
create policy trees_delete on public.trees for delete to authenticated using (owner_id = auth.uid());

-- Members' rows: the owner sees and manages all of them; a member sees only their own row
-- (everyone else comes through wall_directory(), which hides what they haven't chosen to share).
drop policy if exists members_read on public.wall_members;
create policy members_read on public.wall_members for select to authenticated
  using (public.is_tree_owner(tree_id) or user_id = auth.uid() or (status = 'pending' and lower(email) = public.my_email()));
drop policy if exists members_insert on public.wall_members;
create policy members_insert on public.wall_members for insert to authenticated
  with check (public.is_tree_owner(tree_id) and status = 'pending' and user_id is null
              and not (share_status or share_photos or share_birthday or share_location or share_contact));
drop policy if exists members_update on public.wall_members;
create policy members_update on public.wall_members for update to authenticated
  using (public.is_tree_owner(tree_id)) with check (public.is_tree_owner(tree_id));
drop policy if exists members_delete on public.wall_members;
create policy members_delete on public.wall_members for delete to authenticated using (public.is_tree_owner(tree_id));

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using (public.can_read_wall(tree_id) and (not removed or public.is_tree_owner(tree_id)));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = auth.uid() and not removed
    and public.can_post(tree_id, photo_path is not null)
    and (author_member_id is null and public.is_tree_owner(tree_id) or author_member_id = public.my_member_id(tree_id))
    and (life_status is null or life_status = 'pending')
    and (photo_path is null or split_part(photo_path, '/', 1) = tree_id::text)
  );
drop policy if exists posts_owner_update on public.posts;
create policy posts_owner_update on public.posts for update to authenticated
  using (public.is_tree_owner(tree_id)) with check (public.is_tree_owner(tree_id));
drop policy if exists posts_author_delete on public.posts;
create policy posts_author_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_tree_owner(tree_id));

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
  using (public.can_read_wall(tree_id) and not removed);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and not removed and public.can_post(tree_id, false)
              and exists (select 1 from public.posts p where p.id = post_id and p.tree_id = comments.tree_id and not p.removed));
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_tree_owner(tree_id))
  with check (author_id = auth.uid() or public.is_tree_owner(tree_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_tree_owner(tree_id));

drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated using (public.can_read_wall(tree_id));
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_wall(tree_id)
              and exists (select 1 from public.posts p where p.id = post_id and p.tree_id = reactions.tree_id));
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists hidden_own on public.hidden_posts;
create policy hidden_own on public.hidden_posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- functions the app calls ----------

-- Invitations waiting for the signed-in person (matched on their confirmed email).
create or replace function public.my_invites()
returns table (member_id uuid, tree_id uuid, tree_name text, owner_name text, person_name text, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, t.id, t.name, t.owner_name, m.person_name, m.invited_at
  from wall_members m join trees t on t.id = m.tree_id
  where m.status = 'pending' and lower(m.email) = public.my_email()
$$;

-- Accept an invitation with the sharing choices made on the welcome screen.
create or replace function public.accept_invite(
  member uuid, s_status boolean, s_photos boolean, s_birthday boolean, s_location boolean, s_contact boolean,
  my_birthday text default '', my_location text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  update wall_members set
    user_id = auth.uid(), status = 'accepted', joined_at = now(),
    share_status = s_status, share_photos = s_photos, share_birthday = s_birthday,
    share_location = s_location, share_contact = s_contact,
    birthday = case when s_birthday then coalesce(my_birthday, '') else '' end,
    location = case when s_location then coalesce(my_location, '') else '' end
  where id = member and status = 'pending' and lower(email) = public.my_email();
  if not found then raise exception 'That invitation is not for this account, or it has already been used.'; end if;
end $$;

-- Change what I share (from My wall settings).
create or replace function public.set_my_sharing(
  member uuid, s_status boolean, s_photos boolean, s_birthday boolean, s_location boolean, s_contact boolean,
  my_birthday text default '', my_location text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  update wall_members set
    share_status = s_status, share_photos = s_photos, share_birthday = s_birthday,
    share_location = s_location, share_contact = s_contact,
    birthday = case when s_birthday then coalesce(my_birthday, '') else '' end,
    location = case when s_location then coalesce(my_location, '') else '' end
  where id = member and user_id = auth.uid();
  if not found then raise exception 'Not your membership.'; end if;
end $$;

-- Leave the wall: my posts are removed and my details become private again.
create or replace function public.leave_wall(member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update wall_members set status = 'left', share_status = false, share_photos = false, share_birthday = false,
    share_location = false, share_contact = false, birthday = '', location = ''
  where id = member and user_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'Not an active membership.'; end if;
  update posts set removed = true where author_member_id = member;
  update comments set removed = true where author_id = auth.uid() and tree_id = (select tree_id from wall_members where id = member);
end $$;

create or replace function public.rejoin_wall(member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update wall_members set status = 'accepted' where id = member and user_id = auth.uid() and status = 'left';
  if not found then raise exception 'Not a membership you left.'; end if;
end $$;

-- Who's on the wall, showing only what each person has chosen to share.
create or replace function public.wall_directory(t uuid)
returns table (member_id uuid, person_id text, person_name text, status text, is_me boolean,
               can_post boolean, can_photos boolean, can_suggest boolean,
               share_status boolean, share_photos boolean, share_birthday boolean, share_location boolean, share_contact boolean,
               email text, birthday text, location text, invited_at timestamptz, joined_at timestamptz, online boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.person_id, m.person_name, m.status, m.user_id = auth.uid(),
         m.can_post, m.can_photos, m.can_suggest,
         m.share_status, m.share_photos, m.share_birthday, m.share_location, m.share_contact,
         case when public.is_tree_owner(t) or m.share_contact or m.user_id = auth.uid() then m.email else '' end,
         case when m.share_birthday then m.birthday else '' end,
         case when m.share_location then m.location else '' end,
         m.invited_at, m.joined_at,
         coalesce(m.last_seen > now() - interval '5 minutes', false)
  from wall_members m
  where m.tree_id = t and public.can_read_wall(t)
    and (m.status = 'accepted' or public.is_tree_owner(t))
$$;

-- "I'm here" — used for Members online.
create or replace function public.touch_wall(t uuid) returns void
language sql security definer set search_path = public as $$
  update wall_members set last_seen = now() where tree_id = t and user_id = auth.uid() and status = 'accepted'
$$;

-- Walls the signed-in person belongs to (their own trees and walls they've joined).
create or replace function public.my_walls()
returns table (tree_id uuid, local_id text, name text, owner_name text, is_owner boolean, member_id uuid)
language sql stable security definer set search_path = public as $$
  select t.id, t.local_id, t.name, t.owner_name, true, null::uuid from trees t where t.owner_id = auth.uid()
  union all
  select t.id, t.local_id, t.name, t.owner_name, false, m.id
  from wall_members m join trees t on t.id = m.tree_id
  where m.user_id = auth.uid() and m.status in ('accepted', 'left')
$$;

revoke all on function public.accept_invite, public.set_my_sharing, public.leave_wall, public.rejoin_wall,
  public.wall_directory, public.touch_wall, public.my_walls, public.my_invites from public, anon;
grant execute on function public.accept_invite, public.set_my_sharing, public.leave_wall, public.rejoin_wall,
  public.wall_directory, public.touch_wall, public.my_walls, public.my_invites to authenticated;

-- ---------- photos (private storage bucket, one folder per tree) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall', 'wall', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists wall_photos_read on storage.objects;
create policy wall_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'wall' and public.can_read_wall(((storage.foldername(name))[1])::uuid));
drop policy if exists wall_photos_insert on storage.objects;
create policy wall_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wall' and public.can_post(((storage.foldername(name))[1])::uuid, true));
drop policy if exists wall_photos_delete on storage.objects;
create policy wall_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wall' and (owner = auth.uid() or public.is_tree_owner(((storage.foldername(name))[1])::uuid)));

-- ---------- live updates ----------

do $$
begin
  begin alter publication supabase_realtime add table public.posts; exception when others then null; end;
  begin alter publication supabase_realtime add table public.comments; exception when others then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when others then null; end;
end $$;
