// The demo Family Wall shown with the sample tree: the prototype's example posts and members,
// kept in memory, so every wall screen can be tried without going online.

import type { Invite, NewPost, Sharing, Wall, WallBackend, WallComment, WallMember, WallPost } from './types';
import { NO_SHARING } from './types';

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

export function demoBackend(ownerName: string, people: Record<string, string>): WallBackend {
  const nm = (pid: string) => people[pid] || pid;
  const all: Sharing = { status: true, photos: true, birthday: true, location: true, contact: false };
  const M = (
    id: string,
    pid: string,
    email: string,
    status: WallMember['status'],
    sharing: Sharing,
    invited: number,
    online = false,
    birthday = '',
    location = '',
  ): WallMember => ({
    id,
    personId: pid,
    name: nm(pid),
    email,
    status,
    isMe: false,
    perms: { post: true, photos: true, suggest: id === 'mb1' || id === 'mb3' },
    sharing,
    birthday: sharing.birthday ? birthday : '',
    location: sharing.location ? location : '',
    invitedAt: ago(invited),
    joinedAt: status === 'accepted' ? ago(invited - 2) : '',
    online,
    userId: status === 'accepted' ? 'u-' + id : undefined,
  });
  const members: WallMember[] = [
    M('mb1', 'p22', 'peter.pascoe@example.com', 'accepted', all, 6000, true, '2 Nov', 'Cairns'),
    M('mb2', 'p24', 'susan.kerr@example.com', 'accepted', { ...all, location: false }, 6000, false, '19 Oct'),
    M('mb3', 'p26', 'helen.cho@example.com', 'accepted', { ...all, contact: true }, 5950, true, '28 Oct', 'Edge Hill'),
    M('mb4', 'p28', 'lyn.bates@example.com', 'accepted', { ...NO_SHARING, status: true, photos: true }, 2500),
    M('mb5', 'p29', 'robyn.morgan@example.com', 'pending', NO_SHARING, 330),
    M('mb6', 'p23', 'karen.pascoe@example.com', 'pending', NO_SHARING, 160),
  ];
  const by = (id: string | null) => (id ? members.find((m) => m.id === id)! : null);
  const C = (author: string | null, body: string): WallComment => ({
    id: uid(),
    clientId: uid(),
    authorId: author || 'owner',
    authorName: by(author)?.name || ownerName,
    body,
    createdAt: ago(1),
  });
  const P = (author: string | null, type: WallPost['type'], body: string, hours: number, o: Partial<WallPost> = {}): WallPost => ({
    id: uid(),
    clientId: uid(),
    authorId: author || 'owner',
    authorMemberId: author,
    authorName: by(author)?.name || ownerName,
    type,
    body,
    photoPath: null,
    photoUrl: '',
    photoAlt: '',
    life: null,
    lifeStatus: null,
    tags: [],
    createdAt: ago(hours),
    removed: false,
    likes: 0,
    likedByMe: false,
    comments: [],
    ...o,
  });
  const T = (...ids: string[]) => ids.map((id) => ({ id, name: nm(id) }));
  const posts: WallPost[] = [
    P('mb3', 'life', 'We’ve finally moved into the little house in Edge Hill — five minutes from where Mum grew up!', 2, {
      likes: 6,
      life: { type: 'New home', date: 'Oct 2026', place: 'Cairns, Queensland' },
      lifeStatus: 'pending',
      comments: [C('mb1', 'Congratulations! Aunty Margaret would be thrilled.'), C('mb4', 'Send photos of the garden!')],
    }),
    P('mb1', 'photo', 'Found this one of Dad on the Esplanade, 1955. Look at those trousers.', 5, {
      likes: 9,
      photoScene: 's3',
      photoAlt: 'Family photo on the Cairns Esplanade, 1955',
      tags: T('p12', 'p13'),
    }),
    P('mb2', 'recipe', 'Found Grandma Joan’s scone recipe in her old tin — the card is falling apart so I typed it up.', 9, {
      likes: 8,
      recipe: {
        title: 'Joan’s pumpkin scones',
        whose: 'Joan Ellis',
        category: 'Baking',
        servings: '12 scones',
        time: '40 minutes',
        ingredients: '1 tbsp butter\n½ cup sugar\n1 egg\n1 cup cold mashed pumpkin\n2½ cups self-raising flour\nPinch of salt\nA little milk',
        method:
          'Heat the oven to 220°C and grease a tray.\nCream the butter and sugar, then beat in the egg.\nStir in the pumpkin.\nFold in the flour and salt, adding milk if it’s too stiff.\nPat out 2 cm thick and cut into rounds.\nBake for 15 to 20 minutes until golden.',
        story: 'Joan made these every Sunday. She said the trick is a hot oven and a light touch.',
        date: '1950s',
      },
      tags: T('p13'),
      comments: [C('mb3', 'I can still smell these! Saving to my cookbook.')],
    }),
    P('mb4', 'text', 'Does anyone know who has Nana Phyllis’s recipe book? I’d love to scan it for the tree.', 26, {
      likes: 3,
      comments: [C('mb2', 'I think Graham’s kids took it — I’ll ask.')],
      tags: T('p17'),
    }),
    P(null, 'text', 'Big news: I’ve found Thomas’s full service record, including his last letter home. It’s under Sources now.', 30, { likes: 11, tags: T('p9') }),
    P('mb2', 'life', 'Our granddaughter Ella graduated in nursing at QUT today. So proud!', 72, {
      likes: 14,
      life: { type: 'Graduation', date: 'Oct 2026', place: 'Brisbane, Queensland' },
    }),
    P('mb3', 'photo', 'Mum and Dad on their wedding day, 1947. I scanned the whole album this weekend.', 96, {
      likes: 12,
      photoScene: 's2',
      photoAlt: 'Wedding portrait, Cairns, 1947',
      tags: T('p14', 'p15'),
    }),
    P('mb1', 'text', 'Heading down to Toowoomba for the Carnival of Flowers — anyone else going?', 170, { likes: 4, comments: [C('mb2', 'We’ll be there Saturday!')] }),
    P('mb4', 'photo', 'Bates family Christmas, Glebe, 1962. Graham is the one with the cricket bat.', 180, {
      likes: 8,
      photoScene: 's3',
      photoAlt: 'Family Christmas photo, Glebe, 1962',
      tags: T('p27', 'p16'),
    }),
    P('mb2', 'text', 'Thinking of Grandad Jack today — he would have been 111.', 340, { likes: 7, tags: T('p12') }),
    P(null, 'text', 'Welcome to the wall, Lynette! The Sydney branch is finally here.', 350, { likes: 5, tags: T('p28') }),
    P('mb1', 'life', 'Welcome to the world, Oliver — our first grandchild!', 1450, {
      likes: 21,
      life: { type: 'New baby', date: 'Aug 2026', place: 'Cairns, Queensland' },
      lifeStatus: 'approved',
    }),
    P('mb1', 'photo', 'The old Pascoe cottage in Toowoomba is still standing. Took this on the weekend.', 1500, {
      likes: 10,
      photoScene: 's5',
      photoAlt: 'Timber cottage in Toowoomba',
      tags: T('p1', 'p2'),
    }),
    P(null, 'text', 'Reminder: you choose what you share. Change it any time under My wall settings.', 2900, { likes: 6 }),
  ];
  const hidden = new Set<string>();
  const wall: Wall = { treeId: 'demo', localId: 'sample', name: 'Pascoe Family Tree', ownerName, isOwner: true, memberId: null };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  const pause = () => new Promise((r) => setTimeout(r, 60));

  return {
    kind: 'demo',
    me: () => ({ id: 'owner', name: ownerName, email: '' }),
    walls: async () => [wall],
    invites: async () => [],
    openWall: async () => wall,
    feed: async () => (await pause(), posts.filter((p) => !p.removed).map((p) => ({ ...p, comments: [...p.comments] }))),
    hiddenPosts: async () => [...hidden],
    members: async () => members.filter((m) => m.status === 'accepted' || m.status === 'pending').map((m) => ({ ...m })),
    async post(_w, p: NewPost, authorName) {
      const np = P(null, p.type, p.body, 0, {
        clientId: p.clientId,
        authorName,
        photoUrl: p.photo ? URL.createObjectURL(p.photo) : '',
        photoAlt: p.photoAlt || '',
        life: p.life || null,
        lifeStatus: null,
        recipe: p.recipe || null,
        tags: p.tags,
      });
      posts.unshift(np);
      changed();
      return np;
    },
    async comment(_w, postId, clientId, body, authorName) {
      const c: WallComment = { id: uid(), clientId, authorId: 'owner', authorName, body, createdAt: new Date().toISOString() };
      posts.find((p) => p.id === postId)?.comments.push(c);
      return c;
    },
    async setLike(_w, postId, on) {
      const p = posts.find((x) => x.id === postId);
      if (p && p.likedByMe !== on) {
        p.likedByMe = on;
        p.likes += on ? 1 : -1;
      }
    },
    async setHidden(_w, postId, h) {
      if (h) hidden.add(postId);
      else hidden.delete(postId);
    },
    async removePost(_w, postId) {
      const p = posts.find((x) => x.id === postId);
      if (p) p.removed = true;
    },
    async setLifeStatus(_w, postId, status) {
      const p = posts.find((x) => x.id === postId);
      if (p) p.lifeStatus = status;
    },
    async invite(_w, i) {
      const m = M(uid(), i.personId, i.email.trim().toLowerCase(), 'pending', NO_SHARING, 0);
      m.name = i.personName;
      m.perms = i.perms;
      members.push(m);
      return m;
    },
    async updateMember(_w, id, patch) {
      const m = members.find((x) => x.id === id);
      if (!m) return;
      if (patch.perms) m.perms = patch.perms;
      if (patch.status) m.status = patch.status;
    },
    async cancelInvite(_w, id) {
      const i = members.findIndex((x) => x.id === id);
      if (i >= 0) members.splice(i, 1);
    },
    async accept(inv: Invite, s, birthday, location) {
      // In the demo, "accepting" previews what the relative sees and makes them a member.
      const m = members.find((x) => x.id === inv.memberId);
      if (!m) return;
      Object.assign(m, { userId: 'u-' + m.id, status: 'accepted', sharing: s, birthday: s.birthday ? birthday : '', location: s.location ? location : '', joinedAt: new Date().toISOString() });
    },
    setSharing: async () => undefined,
    leave: async () => undefined,
    rejoin: async () => undefined,
    touch: async () => undefined,
    subscribe(_w, f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
}
