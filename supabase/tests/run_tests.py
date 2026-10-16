"""Tests the Family Wall privacy rules against a local PostgreSQL with a Supabase stand-in.
Usage: python3 run_tests.py <psql connection args...>"""
import subprocess, sys, uuid, os
HERE = os.path.dirname(os.path.abspath(__file__))
CONN = sys.argv[1:]
def psql(sql, user=None, expect_error=False):
    pre = ''
    if user:
        pre = f"set role authenticated; select set_config('request.jwt.claim.sub', '{user}', false);\n"
    r = subprocess.run(['psql', *CONN, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', pre + sql], capture_output=True, text=True)
    if expect_error:
        assert r.returncode != 0, f'expected failure but succeeded: {sql}\n{r.stdout}'
        return r.stderr
    assert r.returncode == 0, f'failed: {sql}\n{r.stderr}'
    return [l for l in r.stdout.strip().split('\n') if l and l != ''][1:] if user else r.stdout.strip().split('\n')
def run_file(path):
    r = subprocess.run(['psql', *CONN, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
ok = 0
def check(name, cond):
    global ok
    assert cond, 'FAILED: ' + name
    ok += 1
    print('  ✓', name)

subprocess.run(['psql', *CONN, '-qc', 'drop database if exists walltest'], capture_output=True)
subprocess.run(['psql', *CONN, '-qc', 'create database walltest'], check=True)
CONN = [c if not c.startswith('dbname=') else c for c in CONN] + ['-d', 'walltest']
run_file(os.path.join(HERE, 'supabase_stub.sql'))
run_file(os.path.join(HERE, '..', 'migrations', '0001_family_wall.sql'))
run_file(os.path.join(HERE, '..', 'migrations', '0001_family_wall.sql'))  # safe to run twice
psql('grant select, insert, update, delete on all tables in schema public to authenticated')
owner, rel, stranger, sneaky = (str(uuid.uuid4()) for _ in range(4))
psql(f"""insert into auth.users values
  ('{owner}', 'casey@example.com', now()), ('{rel}', 'helen@example.com', now()),
  ('{stranger}', 'stranger@example.com', now()), ('{sneaky}', 'helen@EXAMPLE.com', null)""")

print('Trees and invites')
tree = psql("insert into trees (local_id, name, owner_name) values ('t1', 'Pascoe Family Tree', 'Casey') returning id", owner)[0]
psql(f"insert into trees (local_id, name, owner_id) values ('x', 'not mine', '{owner}')", stranger, expect_error=True)
check('nobody can create a tree for someone else', True)
mid = psql(f"insert into wall_members (tree_id, person_id, person_name, email) values ('{tree}', 'p26', 'Helen Cho', 'helen@example.com') returning id", owner)[0]
psql(f"insert into wall_members (tree_id, email) values ('{tree}', 'x@example.com')", stranger, expect_error=True)
check('only the owner can invite', True)
psql(f"insert into wall_members (tree_id, email, share_contact) values ('{tree}', 'y@example.com', true)", owner, expect_error=True)
check('invites can never start with sharing switched on', True)
check('the invited relative sees their invitation', len(psql('select * from my_invites()', rel)) == 1)
check('an unconfirmed account with the same email does not', len(psql('select * from my_invites()', sneaky)) == 0)
check('a stranger sees no invitations', len(psql('select * from my_invites()', stranger)) == 0)
check('a stranger cannot see the tree', len(psql('select id from trees', stranger)) == 0)
check('the invitee can see the tree name before accepting', len(psql('select name from trees', rel)) == 1)
psql(f"select accept_invite('{mid}', false, false, false, false, false)", stranger, expect_error=True)
check("a stranger cannot accept someone else's invitation", True)

print('Before joining')
psql(f"insert into posts (tree_id, author_member_id, body) values ('{tree}', '{mid}', 'hi')", rel, expect_error=True)
check('the invitee cannot post before accepting', True)
p1 = psql(f"insert into posts (tree_id, body, author_name) values ('{tree}', 'Welcome!', 'Casey') returning id", owner)[0]
check('the invitee cannot read posts before accepting', len(psql('select id from posts', rel)) == 0)

print('Accepting')
psql(f"select accept_invite('{mid}', true, false, true, false, false, '14 Mar', 'Cairns')", rel)
check('accepting works', psql(f"select status, share_birthday, birthday, location from wall_members where id = '{mid}'", owner) == ['accepted|t|14 Mar|'])
check('the invitation is used up', len(psql('select * from my_invites()', rel)) == 0)
check('the new member reads the wall', len(psql('select id from posts', rel)) == 1)
check('a stranger still cannot', len(psql('select id from posts', stranger)) == 0)
psql(f"update wall_members set can_suggest = true, can_photos = true where id = '{mid}'", rel)
check('members cannot change their own permissions', psql(f"select can_suggest from wall_members where id = '{mid}'", owner) == ['f'])

print('Posting')
p2 = psql(f"insert into posts (tree_id, author_member_id, author_name, type, body, life, life_status) values ('{tree}', '{mid}', 'Helen', 'life', 'New house!', '{{\"type\":\"New home\"}}', 'pending') returning id", rel)[0]
psql(f"insert into posts (tree_id, author_member_id, body, life_status) values ('{tree}', '{mid}', 'sneaky', 'approved')", rel, expect_error=True)
check('members cannot approve their own life events', True)
psql(f"insert into posts (tree_id, body) values ('{tree}', 'pretending to be the owner')", rel, expect_error=True)
check('members cannot post as the owner', True)
psql(f"update posts set life_status = 'approved' where id = '{p2}'", rel)
check('members cannot approve by editing either', psql(f"select life_status from posts where id = '{p2}'", owner) == ['pending'])
psql(f"update posts set life_status = 'approved' where id = '{p2}'", owner)
check('the owner approves life events', psql(f"select life_status from posts where id = '{p2}'", owner) == ['approved'])
psql(f"update wall_members set can_photos = false where id = '{mid}'", owner)
psql(f"insert into posts (tree_id, author_member_id, type, body, photo_path) values ('{tree}', '{mid}', 'photo', 'pic', '{tree}/a.jpg')", rel, expect_error=True)
check('members without photo permission cannot post photos', True)
psql(f"insert into storage.objects (bucket_id, name) values ('wall', '{tree}/a.jpg')", rel, expect_error=True)
check('...or upload them', True)
psql(f"update wall_members set can_photos = true where id = '{mid}'", owner)
psql(f"insert into storage.objects (bucket_id, name) values ('wall', '{tree}/b.jpg')", rel)
check('members with photo permission can upload', len(psql("select name from storage.objects", rel)) == 1)
check('strangers cannot see wall photos', len(psql("select name from storage.objects", stranger)) == 0)

print('Comments, likes, hiding')
psql(f"insert into comments (post_id, tree_id, body, author_name) values ('{p1}', '{tree}', 'Thanks!', 'Helen')", rel)
psql(f"insert into comments (post_id, tree_id, body) values ('{p1}', '{tree}', 'spam')", stranger, expect_error=True)
check('only members comment', len(psql('select id from comments', owner)) == 1)
psql(f"insert into reactions (post_id, tree_id) values ('{p1}', '{tree}')", rel)
psql(f"insert into reactions (post_id, tree_id) values ('{p1}', '{tree}')", rel, expect_error=True)
check('one like per person', len(psql('select * from reactions', owner)) == 1)
psql(f"insert into hidden_posts (post_id) values ('{p1}')", rel)
check('hidden posts are private to the person who hid them', len(psql('select * from hidden_posts', owner)) == 0 and len(psql('select * from hidden_posts', rel)) == 1)

print('Directory and privacy')
d = psql(f"select person_name, email, birthday, location from wall_directory('{tree}')", rel)
check('members see what others chose to share (and their own email)', d == ['Helen Cho|helen@example.com|14 Mar|'])
mid2 = psql(f"insert into wall_members (tree_id, person_name, email) values ('{tree}', 'Robyn', 'robyn@example.com') returning id", owner)[0]
check('members do not see pending invitations or other emails', len(psql(f"select * from wall_directory('{tree}')", rel)) == 1)
check('the owner sees everyone, with emails', len(psql(f"select email from wall_directory('{tree}') where email <> ''", owner)) == 2)
check('strangers see nobody', len(psql(f"select * from wall_directory('{tree}')", stranger)) == 0)
check('members only see their own membership row directly', len(psql('select id from wall_members', rel)) == 1)

print('Moderation, leaving and rejoining')
psql(f"update posts set removed = true where id = '{p1}'", rel)
check('members cannot remove others’ posts', psql(f"select removed from posts where id = '{p1}'", owner) == ['f'])
psql(f"select set_my_sharing('{mid}', true, true, false, true, true, '', 'Edge Hill')", rel)
check('members change their own sharing', psql(f"select share_birthday, birthday, location from wall_members where id = '{mid}'", owner) == ['f||Edge Hill'])
psql(f"select leave_wall('{mid}')", rel)
check('leaving removes my posts and makes me private', psql(f"select status, share_location, location from wall_members where id = '{mid}'", owner) == ['left|f|'] and psql(f"select removed from posts where id = '{p2}'", owner) == ['t'])
check('after leaving I cannot read the wall', len(psql('select id from posts', rel)) == 0)
psql(f"select rejoin_wall('{mid}')", rel)
check('rejoining works', len(psql('select id from posts', rel)) >= 1)
psql(f"delete from wall_members where id = '{mid}'", rel, expect_error=False)
check('members cannot delete memberships', len(psql(f"select id from wall_members where id = '{mid}'", owner)) == 1)
check('my_walls lists owned and joined walls', len(psql('select * from my_walls()', owner)) == 1 and len(psql('select * from my_walls()', rel)) == 1)
print(f'\nAll {ok} checks passed')
