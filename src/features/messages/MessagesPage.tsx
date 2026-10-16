// Private messages between family members who share a Family Wall.

import { useEffect, useRef, useState } from 'react';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { openProfile } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { titlePhrase } from '../../lib/kinship';
import { deleteMessage, leaveConversation, messagePeople, openConversation, sendMessage, startMessages, unreadTotal, useMessages } from '../../messages/store';
import { conversationName, type Contact, type Conversation } from '../../messages/types';
import { startWall } from '../../wall/store';
import { Icon, ModalFrame } from '../../components/ui';
import { ConnectWall } from '../wall/Connect';
import { timeAgo } from '../wall/WallPage';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export function MessagesPage() {
  const s = useMessages();
  const treeId = useData((d) => d.treeId);
  const account = useData((d) => d.account);
  useEffect(() => {
    // The demo needs the demo wall's members, so make sure the wall has started first.
    startWall().then(() => startMessages());
  }, [treeId, account?.id]);
  const isSample = useData((d) => d.data.settings.is_sample === '1');

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Messages</h1>
            <p className="lede">Private conversations with family on your Family Walls. Only the people in a conversation can read it.</p>
          </div>
          <div className="spacer" />
          {s.mode === 'ready' && (
            <button className="btn primary" onClick={() => setUi({ modal: { kind: 'newMessage' } })}>
              <Icon name="plus" sm />
              New message
            </button>
          )}
        </div>
        {isSample && s.mode === 'ready' && (
          <div className="privacy-note" role="note">
            <Icon name="message" />
            <span>These are demo messages for the sample tree. Nothing here is sent anywhere.</span>
          </div>
        )}
        {s.mode === 'loading' && <div className="empty">Opening messages…</div>}
        {s.mode === 'off' && (
          <div className="card" style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">Messages aren’t switched on in this version yet</h2>
            <p style={{ margin: 0 }}>Private messages use the same online service as the Family Wall, and switch on with it.</p>
            <button
              className="btn primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                const { openSample } = await import('../FirstRun');
                await openSample();
                setUi({ section: 'messages' });
              }}
            >
              Try messages with the sample tree
            </button>
          </div>
        )}
        {s.mode === 'connect' && <ConnectWall />}
        {s.mode === 'error' && (
          <div className="card" role="alert">
            {s.error}{' '}
            <button className="btn sm" onClick={() => startMessages(true)}>
              Try again
            </button>
          </div>
        )}
        {s.mode === 'ready' && <Inbox />}
      </div>
    </div>
  );
}

function Inbox() {
  const s = useMessages();
  const myId = s.backend?.myId() || '';
  const open = s.conversations.find((c) => c.id === s.openId);
  const visible = s.conversations.filter((c) => !c.left || c.id === s.openId);
  return (
    <div className={'msgwrap' + (open ? ' has-open' : '')}>
      <nav className="card msglist" aria-label="Conversations">
        {!s.online && <div className="offbar small">Offline — showing what’s saved on this computer</div>}
        {visible.map((c) => (
          <ConvRow key={c.id} c={c} myId={myId} on={c.id === s.openId} />
        ))}
        {!visible.length && (
          <div className="empty" style={{ padding: 16 }}>
            {s.contacts.length ? 'No conversations yet. Start one with “New message”.' : 'Once relatives join your Family Wall, you can message them here.'}
          </div>
        )}
      </nav>
      {open ? <Thread c={open} myId={myId} /> : <div className="card empty msgthread">Choose a conversation, or start a new one.</div>}
    </div>
  );
}

function ConvRow({ c, myId, on }: { c: Conversation; myId: string; on: boolean }) {
  const name = conversationName(c, myId);
  const group = c.members.length > 2 || !!c.title;
  return (
    <button className={'msgrow' + (on ? ' on' : '') + (c.unread ? ' unread' : '')} onClick={() => openConversation(c.id)} aria-current={on ? 'true' : undefined}>
      <span className={'av sm' + (group ? ' group' : '')} aria-hidden="true">
        {group ? <Icon name="people" sm /> : initials(name)}
      </span>
      <span className="msgrow-b">
        <span className="msgrow-top">
          <span className="li-t">{name}</span>
          <span className="small muted">{c.lastBody ? timeAgo(c.lastAt) : ''}</span>
        </span>
        <span className="li-s msgrow-prev">{c.lastBody ? `${c.lastSender && group ? c.lastSender.split(' ')[0] + ': ' : ''}${c.lastBody}` : 'No messages yet'}</span>
      </span>
      {c.unread > 0 && (
        <span className="nb" aria-label={`${c.unread} unread`}>
          {c.unread}
        </span>
      )}
    </button>
  );
}

function Thread({ c, myId }: { c: Conversation; myId: string }) {
  const s = useMessages();
  const data = useData((d) => d.data);
  const T = treeApi(data);
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const others = c.members.filter((m) => m.userId !== myId);
  const group = c.members.length > 2 || !!c.title;
  const contact = (uid: string) => s.contacts.find((k) => k.userId === uid);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [s.messages.length, c.id]);
  const send = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  };
  const one = !group ? contact(others[0]?.userId || '') : undefined;
  const inTree = one?.personId && T.person[one.personId];
  return (
    <section className="card msgthread" aria-label={`Conversation with ${conversationName(c, myId)}`}>
      <header className="msghead">
        <button className="btn sm ghost msgback" onClick={() => useMessages.setState({ openId: '' })}>
          ‹ All conversations
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="h3">{conversationName(c, myId)}</h2>
          <div className="small muted">
            {group ? others.map((m) => m.name + (m.left ? ' (left)' : '')).join(', ') : inTree ? titlePhrase(T, one!.personId) || one!.treeName : one?.treeName || ''}
          </div>
        </div>
        <div className="spacer" />
        {inTree && (
          <button className="btn sm" onClick={() => openProfile(one!.personId)}>
            Profile
          </button>
        )}
        {group && !c.left && (
          <button
            className="btn sm ghost"
            onClick={() =>
              setUi({
                modal: {
                  kind: 'confirm',
                  title: 'Leave this conversation?',
                  body: 'You won’t get new messages from it. Others can still see what you wrote.',
                  action: 'Leave',
                  onConfirm: () => leaveConversation(c.id),
                },
              })
            }
          >
            Leave
          </button>
        )}
      </header>
      <div className="msgs" role="log" aria-live="polite">
        {s.messages.map((m, i) => {
          const mine = m.senderId === myId;
          const showName = group && !mine && (i === 0 || s.messages[i - 1].senderId !== m.senderId);
          return (
            <div key={m.clientId || m.id} className={'bubble-row' + (mine ? ' mine' : '')}>
              <div className={'bubble' + (m.deleted ? ' deleted' : '') + (m.queued ? ' queued' : '')}>
                {showName && <div className="bubble-name">{m.senderName}</div>}
                {m.deleted ? <em>Message deleted</em> : <span className="bubble-text">{m.body}</span>}
                <div className="bubble-meta">
                  {m.queued ? 'Waiting to send' : timeAgo(m.createdAt)}
                  {mine && !m.deleted && !m.queued && (
                    <button className="link small" onClick={() => deleteMessage(m.id)} aria-label="Delete this message">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!s.messages.length && <div className="empty">Say hello 👋</div>}
        <div ref={end} />
      </div>
      {c.left ? (
        <div className="privacy-note">You left this conversation.</div>
      ) : (
        <div className="msgcompose">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message… (Enter sends, Shift+Enter for a new line)"
            aria-label="Write a message"
            rows={2}
          />
          <button className="btn primary" onClick={send} disabled={!draft.trim()}>
            Send
          </button>
        </div>
      )}
    </section>
  );
}

export function NewMessageModal({ userIds, close }: { userIds?: string[]; close: () => void }) {
  const contacts = useMessages((s) => s.contacts);
  const data = useData((d) => d.data);
  const T = treeApi(data);
  const [picked, setPicked] = useState<string[]>(userIds || []);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const label = (k: Contact) => (k.personId && T.person[k.personId] ? titlePhrase(T, k.personId) : '') || k.treeName;
  return (
    <ModalFrame label="New message" onClose={close}>
      <h2 className="h2">New message</h2>
      {contacts.length ? (
        <>
          <div className="fl">
            <span>To</span>
            <div className="list" style={{ maxHeight: 300, overflow: 'auto' }}>
              {contacts.map((k) => (
                <label key={k.userId} className="li" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(k.userId)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, k.userId] : picked.filter((x) => x !== k.userId))}
                  />
                  <span>
                    <span className="li-t">{k.name}</span>
                    <span className="li-s">{label(k)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {picked.length > 1 && (
            <label className="fl">
              Group name <span className="muted">(optional)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reunion planning" />
            </label>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            You can message anyone who shares a Family Wall with you. Only the people in the conversation can read it.
          </p>
        </>
      ) : (
        <p style={{ margin: 0 }}>Once relatives have joined a Family Wall with you, you can message them here.</p>
      )}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        {contacts.length > 0 && (
          <button
            className="btn primary"
            disabled={!picked.length || busy}
            onClick={async () => {
              setBusy(true);
              const id = await messagePeople(picked, picked.length > 1 ? title : '');
              setBusy(false);
              if (id) {
                close();
                setUi({ section: 'messages' });
              }
            }}
          >
            {busy ? 'Opening…' : 'Start conversation'}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}

/** For the sidebar badge. */
export const useUnreadMessages = () => useMessages(unreadTotal);
