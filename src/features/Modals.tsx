import { DateInput } from '../components/DateInput';
import { useState } from 'react';
import { setPrefs, useData } from '../data/store';
import { setUi, toast, useUi, type Modal } from '../data/ui';
import { addMediaFromPicked, addTask, deletePerson, linkExistingPerson, sexProblem, openMedia, openSource, savePerson, saveSource, setRootPerson, setSetting, updatePerson } from '../data/actions';
import { MEDIA_FILTERS, pickFile, type PickedFile } from '../data/platform';
import { treeApi } from '../lib/family';
import { SOURCE_TYPES } from '../lib/types';
import { Avatar, ModalFrame, PlaceInput, Seg } from '../components/ui';
import { matchesForNew } from '../lib/merge';
import { normaliseDate, yearOf } from '../lib/dates';
import { THEMES } from '../lib/themes';
import { GeocodeAllModal } from './map/Geocode';
import { EncryptModal } from './security/Security';
import { ChangePasswordModal } from './account/Account';
import { AdjustPhotoModal, ChoosePhotoModal } from './profile/PhotoModals';
import { MergeModal } from './profile/Merge';
import { StoryModal } from './profile/Stories';
import { NewMessageModal } from './messages/MessagesPage';
import { WallAcceptModal, WallInviteModal, WallInviteSentModal } from './wall/WallModals';

export function Modals() {
  const modal = useUi((s) => s.modal);
  if (!modal) return null;
  const close = () => setUi({ modal: null });
  switch (modal.kind) {
    case 'theme':
      return <ThemeModal close={close} />;
    case 'add':
      return <AddPersonModal m={modal} close={close} />;
    case 'editPerson':
      return <EditPersonModal m={modal} close={close} />;
    case 'upload':
      return <UploadModal m={modal} close={close} />;
    case 'source':
      return <SourceModal m={modal} close={close} />;
    case 'task':
      return <TaskModal m={modal} close={close} />;
    case 'confirm':
      return <ConfirmModal m={modal} close={close} />;
    case 'renameTree':
      return <RenameModal m={modal} close={close} />;
    case 'shortcuts':
      return <ShortcutsModal close={close} />;
    case 'changePassword':
      return <ChangePasswordModal close={close} />;
    case 'encrypt':
      return <EncryptModal on={modal.on} close={close} />;
    case 'geocodeAll':
      return <GeocodeAllModal close={close} />;
    case 'adjustPhoto':
      return <AdjustPhotoModal pid={modal.pid} close={close} />;
    case 'newMessage':
      return <NewMessageModal userIds={modal.userIds} close={close} />;
    case 'wallInvite':
      return <WallInviteModal pid={modal.pid} close={close} />;
    case 'wallInviteSent':
      return <WallInviteSentModal name={modal.name} email={modal.email} wallName={modal.wallName} close={close} />;
    case 'wallAccept':
      return <WallAcceptModal invite={modal.invite} preview={modal.preview} close={close} />;
    case 'story':
      return <StoryModal pid={modal.pid} id={modal.id} close={close} />;
    case 'merge':
      return <MergeModal keep={modal.keep} other={modal.other} close={close} />;
    case 'choosePhoto':
      return <ChoosePhotoModal pid={modal.pid} purpose={modal.purpose} close={close} />;
    case 'comingSoon':
      return (
        <ModalFrame label={modal.title} onClose={close}>
          <h2 className="h2">{modal.title}</h2>
          <p style={{ margin: 0 }}>{modal.body}</p>
          <div className="mfoot">
            <button className="btn primary" onClick={close}>
              OK
            </button>
          </div>
        </ModalFrame>
      );
  }
}

type M<K extends Modal['kind']> = Extract<Modal, { kind: K }>;
const patchModal = (patch: Record<string, unknown>) => setUi((s) => ({ modal: s.modal ? ({ ...s.modal, ...patch } as Modal) : null }));

export function ThemeGrid() {
  const theme = useData((s) => s.prefs.theme);
  return (
    <div className="thgrid">
      {THEMES.map((t) => (
        <button
          key={t.id}
          className={'thcard' + (theme === t.id ? ' on' : '')}
          aria-pressed={theme === t.id}
          onClick={() => {
            setPrefs({ theme: t.id });
            toast(t.name + ' theme applied');
          }}
        >
          <span className={'thprev th-' + t.id} aria-hidden="true">
            <span className="tband" />
            <span className="tb" />
            <span className="tn" />
            <span className="tn2" />
            <span className="tc" />
            <span className="tdot" />
            <span className="tbtn" />
          </span>
          <span className="li-t">{t.name}</span>
          <span className="li-s">{t.desc}</span>
        </button>
      ))}
    </div>
  );
}

function ThemeModal({ close }: { close: () => void }) {
  const dark = useData((s) => s.prefs.dark);
  return (
    <ModalFrame label="Colour theme" onClose={close} width={1000}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 className="h2" style={{ flex: 1 }}>
          Choose a colour theme
        </h2>
        <button className="btn sm" onClick={() => setPrefs({ dark: !dark })}>
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
      <ThemeGrid />
      <div className="mfoot">
        <span className="muted small" style={{ flex: 1 }}>
          Your choice is saved on this computer and remembered next time.
        </span>
        <button className="btn primary" onClick={close}>
          Done
        </button>
      </div>
    </ModalFrame>
  );
}

function AddPersonModal({ m, close }: { m: M<'add'>; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const sp = m.relTo ? T.spouses(m.relTo) : [];
  const title = m.relTo && m.rel !== 'none' ? `Add ${m.rel} of ${T.short(m.relTo)}` : 'Add a person';
  const matches = matchesForNew(data, m.given, m.surname, yearOf(normaliseDate(m.bdate)) || undefined).filter((id) => id !== m.relTo);
  return (
    <ModalFrame label={title} onClose={close}>
      <h2 className="h2">{title}</h2>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          savePerson(m);
        }}
      >
        <div className="frow">
          <label className="fl">
            Related to
            <select
              value={m.relTo}
              onChange={(e) => {
                const relTo = e.target.value;
                patchModal({ relTo, other: T.spouses(relTo)[0] || '', rel: !relTo ? 'none' : m.rel === 'none' ? 'child' : m.rel });
              }}
            >
              <option value="">Not connected yet</option>
              {T.peopleSorted().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.surname}, {p.given}
                </option>
              ))}
            </select>
          </label>
          {m.relTo && (
            <label className="fl">
              As their
              <select value={m.rel} onChange={(e) => patchModal({ rel: e.target.value })}>
                <option value="child">Child</option>
                <option value="parent">Parent</option>
                <option value="spouse">Spouse or partner</option>
                <option value="sibling">Sibling</option>
              </select>
            </label>
          )}
        </div>
        {m.rel === 'child' && m.relTo && sp.length > 0 && (
          <label className="fl">
            Other parent
            <select value={m.other} onChange={(e) => patchModal({ other: e.target.value })}>
              <option value="">Only {T.short(m.relTo)}</option>
              {sp.map((s) => (
                <option key={s} value={s}>
                  With {T.short(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="frow">
          <label className="fl">
            Given names
            <input value={m.given} onChange={(e) => patchModal({ given: e.target.value })} placeholder="e.g. Rose Ellen" autoFocus />
          </label>
          <label className="fl">
            Surname at birth
            <input value={m.surname} onChange={(e) => patchModal({ surname: e.target.value })} />
          </label>
        </div>
        <div className="frow">
          <div className="fl">
            <span>Sex</span>
            <Seg label="Sex" value={m.sex} onChange={(v) => patchModal({ sex: v })} options={[['M', 'Male'], ['F', 'Female']]} />
          </div>
          <label className="ck" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={m.living} onChange={(e) => patchModal({ living: e.target.checked })} />
            Living (kept private by default)
          </label>
        </div>
        <div className="frow" style={{ gridTemplateColumns: '120px minmax(0, 1fr) minmax(0, 1fr)' }}>
          <label className="fl">
            Birth
            <select value={m.bq} onChange={(e) => patchModal({ bq: e.target.value })}>
              <option value="exact">Exact</option>
              <option value="about">About</option>
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </label>
          <label className="fl">
            Date
            <DateInput value={m.bdate} onChange={(v) => patchModal({ bdate: v })} placeholder="e.g. 1998" label="birth date" />
          </label>
          <label className="fl">
            Place
            <PlaceInput value={m.bplace} onChange={(v) => patchModal({ bplace: v })} />
          </label>
        </div>
        {matches.length > 0 && (
          <div className="dupe-warn" role="status">
            <span className="strong">Already in your tree?</span>
            <span className="small">Each person should have just one profile. If this is one of these people, use them instead of adding a copy.</span>
            {matches.slice(0, 3).map((id) => (
              <div key={id} className="row" style={{ flexWrap: 'nowrap' }}>
                <Avatar pid={id} size="xs" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="li-t">{T.nm(id)}</span> <span className="li-s">{T.years(id) || 'No dates'}</span>
                </span>
                <button type="button" className="btn sm primary" onClick={() => linkExistingPerson(m, id)}>
                  {m.relTo && m.rel !== 'none' ? `Use them as ${m.rel === 'spouse' ? 'partner' : m.rel}` : 'Open their profile'}
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          New facts start as Unverified until you attach a source.
        </p>
        <div className="mfoot">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add to tree
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function EditPersonModal({ m, close }: { m: M<'editPerson'>; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const save = async () => {
    if (!m.given.trim() && !m.surname.trim()) {
      toast('Add a name to continue');
      return;
    }
    if (sexProblem(m.sex)) {
      toast(sexProblem(m.sex));
      return;
    }
    const ok = await updatePerson(m.pid, { given: m.given.trim(), surname: m.surname.trim(), sex: m.sex, living: m.living, privacy: m.living ? 'Private' : 'Shared' });
    if (ok && m.root && T.rootId !== m.pid) await setRootPerson(m.pid);
    if (ok) {
      close();
      toast('Details saved');
    }
  };
  return (
    <ModalFrame label="Edit details" onClose={close}>
      <h2 className="h2">Edit details</h2>
      <div className="frow">
        <label className="fl">
          Given names
          <input value={m.given} onChange={(e) => patchModal({ given: e.target.value })} autoFocus />
        </label>
        <label className="fl">
          Surname at birth
          <input value={m.surname} onChange={(e) => patchModal({ surname: e.target.value })} />
        </label>
      </div>
      <div className="frow">
        <div className="fl">
          <span>Sex</span>
          <Seg label="Sex" value={m.sex} onChange={(v) => patchModal({ sex: v })} options={[['M', 'Male'], ['F', 'Female']]} />
        </div>
        <label className="ck" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={m.living} onChange={(e) => patchModal({ living: e.target.checked })} />
          Living (kept private)
        </label>
      </div>
      <label className="ck">
        <input type="checkbox" checked={m.root} onChange={(e) => patchModal({ root: e.target.checked })} disabled={T.rootId === m.pid} />
        Start the family tree view from this person
      </label>
      <div className="mfoot">
        <button
          className="btn ghost danger"
          style={{ marginRight: 'auto' }}
          onClick={() =>
            setUi({
              modal: {
                kind: 'confirm',
                title: `Delete ${T.nm(m.pid)}?`,
                body: 'Their facts, relationships and face tags are removed. Sources and photos stay in the tree. A backup is kept, so you can restore if needed.',
                action: 'Delete person',
                danger: true,
                onConfirm: () => deletePerson(m.pid),
              },
            })
          }
        >
          Delete person
        </button>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </ModalFrame>
  );
}

function UploadModal({ m, close }: { m: M<'upload'>; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [meta, setMeta] = useState({ title: '', date: '', place: '' });
  const [saving, setSaving] = useState(false);
  const pick = async () => {
    const f = await pickFile({ title: 'Choose a photo, document or recording', filters: MEDIA_FILTERS });
    if (!f) return;
    setPicked(f);
    setMeta((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') }));
  };
  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const media = await addMediaFromPicked(picked, { ...meta, forPid: m.forPid, forSource: m.forSource });
      if (!media) return;
      close();
      openMedia(media.id);
      if (media.kind === 'photo') {
        setUi({ tagMode: true, pendingFace: null });
        toast('Photo added — click a face to tag someone');
      } else {
        toast(media.kind === 'audio' ? 'Recording added' : 'Document added');
        if (m.forSource) openSource(m.forSource);
      }
    } catch (e) {
      toast('Couldn’t add that file: ' + String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalFrame label="Upload media" onClose={close}>
      <h2 className="h2">{m.forSource ? 'Attach a scan to this source' : m.forPid ? `Upload a photo of ${T.first(m.forPid)}` : 'Upload a photo'}</h2>
      {!picked ? (
        <button className="card empty" onClick={pick} style={{ borderStyle: 'dashed', width: '100%' }}>
          <svg className="illo" viewBox="0 0 120 90" aria-hidden="true">
            <rect className="fillsoft" x="22" y="16" width="76" height="56" rx="6" />
            <path d="M60 58V30M48 42l12-12 12 12" />
          </svg>
          <span className="strong" style={{ color: 'var(--text)' }}>
            Choose a file
          </span>
          <span className="small">JPG, PNG, TIFF, PDF or audio · a copy is kept with your tree on this computer</span>
        </button>
      ) : (
        <>
          <div className="row">
            <span className="chip">{picked.name}</span>
            <button className="btn sm ghost" onClick={pick}>
              Choose a different file
            </button>
          </div>
          <label className="fl">
            Title
            <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} autoFocus />
          </label>
          <div className="frow">
            <label className="fl">
              Date
              <DateInput value={meta.date} onChange={(v) => setMeta({ ...meta, date: v })} placeholder="e.g. 1979" label="date" />
            </label>
            <label className="fl">
              Place
              <PlaceInput value={meta.place} onChange={(v) => setMeta({ ...meta, place: v })} />
            </label>
          </div>
        </>
      )}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        {picked && (
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Adding…' : /\.(jpe?g|png|gif|webp|tiff?|bmp|heic)$/i.test(picked.name) ? 'Add and tag faces' : 'Add'}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}

function SourceModal({ m, close }: { m: M<'source'>; close: () => void }) {
  const save = async () => {
    const id = await saveSource(m);
    if (!id) return;
    const isNew = !m.id;
    const editingFact = !!useUi.getState().form;
    close();
    if (isNew && !editingFact) {
      openSource(id);
      setUi({ cf: { page: '', accessed: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), quality: 'Primary', extract: '', fact: '' } });
      toast('Source added — now create a citation from it');
    } else if (isNew) {
      setUi((s) => ({ form: s.form ? { ...s.form, newSrc: id } : s.form }));
      toast('Source added — attach it below');
    } else toast('Source saved');
  };
  const types = SOURCE_TYPES.includes(m.type) ? SOURCE_TYPES : [m.type, ...SOURCE_TYPES];
  return (
    <ModalFrame label={m.id ? 'Edit source' : 'Add a source'} onClose={close}>
      <h2 className="h2">{m.id ? 'Edit source' : 'Add a source'}</h2>
      <label className="fl">
        Title
        <input value={m.title} onChange={(e) => patchModal({ title: e.target.value })} placeholder="e.g. Brisbane Courier — shipping news, 10 Sep 1885" autoFocus />
      </label>
      <div className="frow">
        <label className="fl">
          Type
          <select value={m.type} onChange={(e) => patchModal({ type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="fl">
          Repository
          <input value={m.repo} onChange={(e) => patchModal({ repo: e.target.value })} placeholder="Where it’s held" />
        </label>
      </div>
      <label className="fl">
        Link
        <input value={m.url} onChange={(e) => patchModal({ url: e.target.value })} placeholder="https://" />
      </label>
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          {m.id ? 'Save' : 'Add source'}
        </button>
      </div>
    </ModalFrame>
  );
}

function TaskModal({ m, close }: { m: M<'task'>; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  return (
    <ModalFrame label="New research task" onClose={close}>
      <h2 className="h2">New research task</h2>
      <label className="fl">
        Task
        <input value={m.title} onChange={(e) => patchModal({ title: e.target.value })} placeholder="e.g. Search St Luke’s baptisms 1889–1891" autoFocus />
      </label>
      <div className="frow">
        <label className="fl">
          Person
          <select value={m.pid} onChange={(e) => patchModal({ pid: e.target.value })}>
            <option value="">No one in particular</option>
            {T.peopleSorted().map((p) => (
              <option key={p.id} value={p.id}>
                {p.surname}, {p.given}
              </option>
            ))}
          </select>
        </label>
        <label className="fl">
          Priority
          <select value={m.priority} onChange={(e) => patchModal({ priority: e.target.value })}>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>
      </div>
      <label className="fl">
        Notes
        <textarea value={m.notes} onChange={(e) => patchModal({ notes: e.target.value })} />
      </label>
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            if (await addTask(m)) close();
          }}
        >
          Add task
        </button>
      </div>
    </ModalFrame>
  );
}

function ConfirmModal({ m, close }: { m: M<'confirm'>; close: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <ModalFrame label={m.title} onClose={close}>
      <h2 className="h2">{m.title}</h2>
      <p style={{ margin: 0 }}>{m.body}</p>
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className={'btn ' + (m.danger ? 'primary' : 'primary')}
          style={m.danger ? { background: 'var(--bad)', borderColor: 'var(--bad)', color: '#fff' } : undefined}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              close();
              await m.onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {m.action}
        </button>
      </div>
    </ModalFrame>
  );
}

function RenameModal({ m, close }: { m: M<'renameTree'>; close: () => void }) {
  const save = async () => {
    if (!m.name.trim()) return;
    await setSetting('tree_name', m.name.trim());
    close();
    toast('Tree renamed');
  };
  return (
    <ModalFrame label="Rename this tree" onClose={close}>
      <h2 className="h2">Rename this tree</h2>
      <label className="fl">
        Tree name
        <input value={m.name} onChange={(e) => patchModal({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
      </label>
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </ModalFrame>
  );
}

function ShortcutsModal({ close }: { close: () => void }) {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    ['Search people, places, sources', `${mod} K`],
    ['Add person', `${mod} N`],
    ['Upload a photo or document', `${mod} U`],
    ['Home · Overview · Tree · People · Sources · Media · Research', `${mod} 1 – 7`],
    ['Fit the tree to the window', `${mod} 0`],
    ['Back up now', `${mod} B`],
    ['Import / export GEDCOM', `${mod} I / ${mod} E`],
    ['Light or dark mode', `${mod} Shift D`],
    ['Close the panel, menu or dialog', 'Esc'],
  ];
  return (
    <ModalFrame label="Keyboard shortcuts" onClose={close}>
      <h2 className="h2">Keyboard shortcuts</h2>
      <div className="shortcut-list">
        {rows.map(([a, b]) => (
          <div key={a} style={{ display: 'contents' }}>
            <span>{a}</span>
            <span className="kbd">{b}</span>
          </div>
        ))}
      </div>
      <div className="mfoot">
        <button className="btn primary" onClick={close}>
          Done
        </button>
      </div>
    </ModalFrame>
  );
}
