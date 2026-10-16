// Inviting a relative, the invitation email, and the welcome + "choose what you share" steps.

import { useState } from 'react';
import { useData } from '../../data/store';
import { setUi, toast } from '../../data/ui';
import { openUrl } from '../../data/platform';
import { treeApi } from '../../lib/family';
import { acceptInvite, currentWall, inviteRelative, useWall } from '../../wall/store';
import { NO_SHARING, type Invite, type Permissions, type Sharing } from '../../wall/types';
import { ModalFrame, Switch } from '../../components/ui';
import { SHARE_ITEMS, myBirthday, myTown } from './WallPage';

const RELEASES = 'https://github.com/Casey-OC/familytree/releases';

export function WallInviteModal({ pid, close }: { pid?: string; close: () => void }) {
  const data = useData((s) => s.data);
  const members = useWall((s) => s.members);
  const T = treeApi(data);
  const w = currentWall();
  const self = data.settings.self_person;
  const invited = new Set(members.filter((m) => m.status === 'pending' || m.status === 'accepted').map((m) => m.personId));
  const people = T.peopleSorted().filter((p) => p.living && p.id !== self && !invited.has(p.id));
  const [who, setWho] = useState(pid && people.some((p) => p.id === pid) ? pid : people[0]?.id || '');
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState<Permissions>({ post: true, photos: true, suggest: false });
  const [busy, setBusy] = useState(false);
  if (!w) return null;
  return (
    <ModalFrame label="Invite to the Family Wall" onClose={close}>
      <h2 className="h2">Invite to the Family Wall</h2>
      <p className="muted" style={{ margin: 0 }}>
        Nothing about them is shared until they accept and choose what to share.
      </p>
      {people.length ? (
        <>
          <label className="fl">
            Relative
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.surname}, {p.given}
                </option>
              ))}
            </select>
            <span className="fieldnote">Only living relatives in your tree can be invited. Add them to the tree first if they’re not listed.</span>
          </label>
          <label className="fl">
            Their email address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
          </label>
          <div className="fl">
            <span>They can</span>
            {(
              [
                ['post', 'Post updates and comment'],
                ['photos', 'Add photos'],
                ['suggest', 'Suggest life events for the tree'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="ck">
                <input type="checkbox" checked={perms[k]} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} />
                {l}
              </label>
            ))}
          </div>
        </>
      ) : (
        <p style={{ margin: 0 }}>Everyone living in your tree has already been invited. Add more relatives to the tree to invite them.</p>
      )}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        {people.length > 0 && (
          <button
            className="btn primary"
            disabled={busy || !who || !email.trim()}
            onClick={async () => {
              setBusy(true);
              const m = await inviteRelative({ personId: who, personName: T.nm(who), email, perms });
              setBusy(false);
              if (m) setUi({ modal: { kind: 'wallInviteSent', name: T.nm(who), email: email.trim(), wallName: w.name } });
            }}
          >
            {busy ? 'Inviting…' : 'Invite'}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}

/** After inviting: send them an email from your own email program, with everything they need. */
export function WallInviteSentModal({ name, email, wallName, close }: { name: string; email: string; wallName: string; close: () => void }) {
  const owner = useData((s) => s.account?.name || 'I');
  const first = name.split(' ')[0];
  const subject = `Join our Family Wall — ${wallName}`;
  const body = [
    `Hi ${first},`,
    '',
    `I’ve invited you to our private Family Wall — a place for family news and photos, alongside the family tree.`,
    '',
    `1. Download the Family Tree app: ${RELEASES}`,
    `2. Sign up with this email address: ${email}`,
    `3. Open "Family Wall" and connect — your invitation will be waiting.`,
    '',
    `Nothing about you is shared until you choose what to share.`,
    '',
    owner,
  ].join('\n');
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <ModalFrame label="Invitation ready" onClose={close}>
      <h2 className="h2">{first} is invited</h2>
      <p style={{ margin: 0 }}>Now send {first} an email with the download link and how to join. You can send it from your own email, or copy the message.</p>
      <pre className="invite-text">{body}</pre>
      <div className="mfoot">
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(body);
              toast('Invitation message copied');
            } catch {
              toast('Couldn’t copy — select the text and copy it');
            }
          }}
        >
          Copy the message
        </button>
        <button
          className="btn primary"
          onClick={() => {
            openUrl(mailto);
            close();
          }}
        >
          Open in my email
        </button>
      </div>
    </ModalFrame>
  );
}

/** What an invited relative sees: welcome, then choose what to share (everything starts off). */
export function WallAcceptModal({ invite, preview, close }: { invite: Invite; preview?: boolean; close: () => void }) {
  const [step, setStep] = useState(0);
  const [sh, setSh] = useState<Sharing>({ ...NO_SHARING });
  const [bday, setBday] = useState(preview ? '' : myBirthday());
  const [town, setTown] = useState(preview ? '' : myTown());
  const [busy, setBusy] = useState(false);
  const first = invite.personName.split(' ')[0] || 'there';
  return (
    <ModalFrame label="Invitation to the Family Wall" onClose={close}>
      <div className="steps" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {preview && (
        <span className="chip gold" style={{ alignSelf: 'flex-start' }}>
          What {first} sees
        </span>
      )}
      {step === 0 && (
        <>
          <h2 className="h2">Welcome, {first}</h2>
          <p style={{ margin: 0 }}>
            {invite.ownerName || 'A relative'} has invited you to the private Family Wall for <span className="strong">{invite.treeName}</span> — a place to share news and photos
            with family.
          </p>
          <div className="privacy-note">Only invited family members can see the wall. Nothing about you is shared until you choose to share it on the next screen.</div>
          <div className="mfoot">
            <button className="btn" onClick={close}>
              Not now
            </button>
            <button className="btn primary" onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <h2 className="h2">Choose what you share</h2>
          <p className="muted" style={{ margin: 0 }}>
            Everything starts off. You can change this any time in My wall settings.
          </p>
          <div>
            {SHARE_ITEMS.map(([k, l, sub]) => (
              <div key={k} className="toggle">
                <span style={{ flex: 1 }}>
                  <span className="li-t">{l}</span>
                  <span className="li-s">{sub}</span>
                  {k === 'birthday' && sh.birthday && (
                    <input
                      value={bday}
                      onChange={(e) => setBday(e.target.value)}
                      placeholder="e.g. 14 Mar"
                      aria-label="Your birthday (day and month)"
                      style={{ maxWidth: 160, marginTop: 6 }}
                    />
                  )}
                  {k === 'location' && sh.location && (
                    <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Your town" aria-label="Your town" style={{ maxWidth: 260, marginTop: 6 }} />
                  )}
                </span>
                <Switch on={sh[k]} onToggle={() => setSh({ ...sh, [k]: !sh[k] })} label={l} />
              </div>
            ))}
          </div>
          <div className="mfoot">
            <button className="btn ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <div className="spacer" />
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await acceptInvite(invite, sh, bday, town);
                setBusy(false);
                if (ok) setStep(2);
              }}
            >
              {busy ? 'Joining…' : 'Join the Family Wall'}
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2 className="h2">{preview ? `${first} is on the wall` : 'You’re on the wall'}</h2>
          <p style={{ margin: 0 }}>
            {preview ? `${first} now shows as a Wall member in the Members list.` : 'Say hello to the family — your first post is a good place to start.'}
          </p>
          <div className="mfoot">
            <button
              className="btn primary"
              onClick={() => {
                close();
                setUi({ section: 'wall', wtab: 'feed' });
              }}
            >
              Go to the wall
            </button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
