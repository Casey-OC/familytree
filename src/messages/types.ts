// Private messages between people who share a Family Wall.

export interface Contact {
  userId: string;
  name: string;
  personId: string; // their id in the owner's tree ('' for a tree owner)
  treeName: string;
}

export interface ConversationMember {
  userId: string;
  name: string;
  left: boolean;
}

export interface Conversation {
  id: string;
  title: string; // group name, '' for one-to-one
  members: ConversationMember[];
  lastBody: string;
  lastSender: string;
  lastAt: string;
  unread: number;
  left: boolean; // you left this conversation
}

export interface Message {
  id: string;
  clientId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  queued?: boolean; // written offline, not sent yet
}

export interface MessagesBackend {
  readonly kind: 'supabase' | 'demo';
  myId(): string;
  contacts(): Promise<Contact[]>;
  conversations(): Promise<Conversation[]>;
  messages(conversationId: string): Promise<Message[]>;
  start(userIds: string[], title: string, myName: string): Promise<string>;
  send(conversationId: string, clientId: string, body: string, myName: string): Promise<Message>;
  remove(messageId: string): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  leave(conversationId: string): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

/** "Helen Cho" for one-to-one, or the group name / everyone's first names for a group. */
export function conversationName(c: Conversation, myId: string): string {
  if (c.title) return c.title;
  const others = c.members.filter((m) => m.userId !== myId);
  if (others.length === 1) return others[0].name || 'Family member';
  return others.map((m) => (m.name || '?').split(' ')[0]).join(', ') || 'Just you';
}
