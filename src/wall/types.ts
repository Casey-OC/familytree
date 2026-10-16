// The Family Wall's data, the same whether it comes from Supabase or the demo wall.

export interface Sharing {
  status: boolean; // their posts appear in the feed
  photos: boolean; // photos they add can be shown on the tree
  birthday: boolean; // day and month appear in Upcoming birthdays
  location: boolean; // town appears on their profile and the map
  contact: boolean; // members can see their email
}
export const NO_SHARING: Sharing = { status: false, photos: false, birthday: false, location: false, contact: false };

export interface Permissions {
  post: boolean;
  photos: boolean;
  suggest: boolean;
}

export type MemberStatus = 'pending' | 'accepted' | 'left' | 'removed';

export interface WallMember {
  id: string;
  personId: string; // the relative's id in the owner's tree
  name: string;
  email: string; // '' unless you're the owner, it's you, or they share contact details
  status: MemberStatus;
  isMe: boolean;
  perms: Permissions;
  sharing: Sharing;
  birthday: string; // "14 Mar" when shared
  location: string; // town when shared
  invitedAt: string;
  joinedAt: string;
  online: boolean;
  userId?: string; // their account, for private messages (accepted members only)
}

export interface LifeEvent {
  type: string; // "New home", "Wedding", "New baby", "Graduation", …
  date: string;
  place: string;
}

export type PostType = 'text' | 'photo' | 'life';
export type LifeStatus = 'pending' | 'approved' | 'declined' | null;

export interface WallComment {
  id: string;
  clientId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  queued?: boolean; // written offline, not sent yet
}

export interface WallPost {
  id: string;
  clientId: string;
  authorId: string; // account id
  authorMemberId: string | null; // null = the tree owner
  authorName: string;
  type: PostType;
  body: string;
  photoPath: string | null;
  photoUrl: string; // ready to show (signed URL or local blob), '' if not loaded
  photoAlt: string;
  photoScene?: string; // demo wall illustration
  life: LifeEvent | null;
  lifeStatus: LifeStatus;
  tags: { id: string; name: string }[];
  createdAt: string;
  removed: boolean;
  likes: number;
  likedByMe: boolean;
  comments: WallComment[];
  queued?: boolean; // written offline, not sent yet
}

export interface Wall {
  treeId: string; // the wall's id online
  localId: string; // the tree's id in the desktop app ('' for walls you've joined)
  name: string;
  ownerName: string;
  isOwner: boolean;
  memberId: string | null; // your membership, when it's someone else's wall
}

export interface Invite {
  memberId: string;
  treeId: string;
  treeName: string;
  ownerName: string;
  personName: string;
  invitedAt: string;
}

export interface NewPost {
  clientId: string;
  type: PostType;
  body: string;
  photo?: Blob | null;
  photoAlt?: string;
  life?: LifeEvent | null;
  suggestForTree?: boolean;
  tags: { id: string; name: string }[];
}

export interface NewInvite {
  personId: string;
  personName: string;
  email: string;
  perms: Permissions;
}

/** Everything the wall screens need. One version talks to Supabase; the demo keeps it all in memory. */
export interface WallBackend {
  readonly kind: 'supabase' | 'demo';
  me(): { id: string; name: string; email: string } | null;
  walls(): Promise<Wall[]>;
  invites(): Promise<Invite[]>;
  /** Make the owner's tree's wall (once). */
  openWall(localId: string, name: string, ownerName: string): Promise<Wall>;
  feed(w: Wall): Promise<WallPost[]>;
  hiddenPosts(w: Wall): Promise<string[]>;
  members(w: Wall): Promise<WallMember[]>;
  post(w: Wall, p: NewPost, authorName: string): Promise<WallPost>;
  comment(w: Wall, postId: string, clientId: string, body: string, authorName: string): Promise<WallComment>;
  setLike(w: Wall, postId: string, on: boolean): Promise<void>;
  setHidden(w: Wall, postId: string, hidden: boolean): Promise<void>;
  removePost(w: Wall, postId: string): Promise<void>;
  setLifeStatus(w: Wall, postId: string, status: 'approved' | 'declined'): Promise<void>;
  invite(w: Wall, i: NewInvite): Promise<WallMember>;
  updateMember(w: Wall, memberId: string, patch: { perms?: Permissions; status?: 'removed' | 'pending' }): Promise<void>;
  cancelInvite(w: Wall, memberId: string): Promise<void>;
  accept(inv: Invite, sharing: Sharing, birthday: string, location: string): Promise<void>;
  setSharing(w: Wall, sharing: Sharing, birthday: string, location: string): Promise<void>;
  leave(w: Wall): Promise<void>;
  rejoin(w: Wall): Promise<void>;
  touch(w: Wall): Promise<void>;
  /** Live updates; returns a function that stops them. */
  subscribe(w: Wall, onChange: () => void): () => void;
}

export const LIFE_TYPES = ['New baby', 'Wedding', 'Engagement', 'New home', 'Graduation', 'New job', 'Retirement', 'Anniversary', 'Other'] as const;

/** The tree fact a life event becomes when the owner approves it. */
export const LIFE_TO_FACT: Record<string, string> = {
  'New home': 'Residence',
  Wedding: 'Marriage',
  Engagement: 'Family event',
  Graduation: 'Education',
  'New job': 'Occupation',
  Retirement: 'Occupation',
  'New baby': 'Family event',
  Anniversary: 'Family event',
  Other: 'Other',
};
