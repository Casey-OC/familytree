// App password lock and tree-file encryption.

import { useEffect, useState } from 'react';
import { closeTree, openTree, setPrefs, useData } from '../../data/store';
import { setUi, toast, useUi } from '../../data/ui';
import { flushNotes } from '../../data/actions';
import * as platform from '../../data/platform';
import { checkPassword, makeVerifier, passwordProblem } from '../../lib/password';
import { Icon, ModalFrame, Switch } from '../../components/ui';

let triedKey = false;

/** Opens the last tree after start-up or unlocking. */
export async function continueStartup(withKey = false) {
  triedKey = withKey;
  const { prefs } = useData.getState();
  const last = prefs.trees.find((t) => t.id === prefs.lastTree);
  if (last) {
    try {
      await openTree(last.id);
      setUi({ screen: 'app', section: 'home' });
      return;
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (msg.includes(platform.NEEDS_PASSWORD)) {
        // Encrypted with a password we don't have (for example, settings were reset): ask for it.
        if (!triedKey) {
          setUi({ screen: 'locked' });
          return;
        }
        toast('That password doesn’t open your last tree.');
      } else toast('Couldn’t reopen your last tree: ' + msg);
    }
  }
  setUi({ screen: 'first' });
}

export async function lockNow() {
  const { prefs } = useData.getState();
  if (!prefs.lock) {
    toast('Set an app password first (Settings → Backup & security)');
    return;
  }
  await flushNotes();
  setUi({ panel: null, form: null, modal: null, menu: null });
  await closeTree();
  await platform.setSessionKey(null);
  setUi({ screen: 'locked' });
}

export function LockScreen() {
  const lock = useData((s) => s.prefs.lock);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    if (!lock) {
      // No saved password check (settings were reset): try the password on the encrypted tree directly.
      await platform.setSessionKey(pw);
      setPw('');
      return continueStartup(true);
    }
    setBusy(true);
    setErr('');
    try {
      if (!(await checkPassword(pw, lock))) {
        setErr('That password isn’t right. Check Caps Lock and try again.');
        return;
      }
      await platform.setSessionKey(pw);
      setPw('');
      await continueStartup(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="first">
      <form
        className="first-inner"
        style={{ maxWidth: 440 }}
        onSubmit={(e) => {
          e.preventDefault();
          unlock();
        }}
      >
        <span className="fc-ico" style={{ width: 64, height: 64, borderRadius: 18 }}>
          <Icon name="lock" />
        </span>
        <h1 className="h1" style={{ fontSize: 32 }}>
          Family Tree is locked
        </h1>
        <p className="lede">Enter your app password to open your trees.</p>
        <label className="fl" style={{ width: '100%', textAlign: 'left' }}>
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" aria-invalid={!!err} aria-describedby="lock-err" />
        </label>
        <div id="lock-err" role="alert" className="small" style={{ color: 'var(--bad)', minHeight: 20, fontWeight: 700 }}>
          {err}
        </div>
        <button className="btn primary" type="submit" disabled={busy || !pw} style={{ width: '100%' }}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <p className="fine">Forgotten it? Trees that aren’t encrypted are still safe on this computer; encrypted trees can only be opened with this password.</p>
      </form>
    </main>
  );
}

/** The Security card in Settings → Backup & security. */
export function SecurityCard() {
  const lock = useData((s) => s.prefs.lock);
  const treeId = useData((s) => s.treeId);
  const modal = useUi((s) => s.modal);
  const [enc, setEnc] = useState<boolean | null>(null);
  useEffect(() => {
    platform.isTreeEncrypted(treeId).then(setEnc).catch(() => setEnc(false));
  }, [treeId, modal]);
  const desktop = platform.isTauri();
  return (
    <section className="card">
      <h2 className="h2" style={{ marginBottom: 8 }}>
        Security
      </h2>
      <div className="toggle">
        <span style={{ flex: 1 }}>
          <span className="li-t">App password lock</span>
          <span className="li-s">{lock ? 'On — the app asks for your password when it opens' : 'Ask for a password when the app opens'}</span>
        </span>
        <Switch on={!!lock} onToggle={() => setUi({ modal: { kind: lock ? 'removePassword' : 'setPassword' } })} label="App password lock" />
      </div>
      {lock && (
        <div className="row" style={{ padding: '6px 0 10px' }}>
          <button className="btn sm" onClick={() => setUi({ modal: { kind: 'changePassword' } })}>
            Change password
          </button>
          <button className="btn sm" onClick={lockNow}>
            <Icon name="lock" sm />
            Lock now
          </button>
        </div>
      )}
      <div className="toggle">
        <span style={{ flex: 1 }}>
          <span className="li-t">Encrypt this tree file</span>
          <span className="li-s">
            {!desktop
              ? 'Available in the desktop app'
              : !lock
                ? 'Set an app password first — it becomes the key to the file'
                : enc
                  ? 'On — this tree and its backups can only be opened with your password'
                  : 'Protects living people’s details if this computer or a backup is lost'}
          </span>
        </span>
        <Switch on={!!enc} onToggle={() => setUi({ modal: { kind: 'encrypt', on: !enc } })} label="Encrypt this tree file" disabled={!desktop || !lock || enc === null} />
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => toast('Your trees are saved in: ' + (await platform.revealDataFolder()))}>
        Show where my trees are saved
      </button>
    </section>
  );
}

function PwField({ label, value, onChange, auto = 'new-password', focus }: { label: string; value: string; onChange: (v: string) => void; auto?: string; focus?: boolean }) {
  return (
    <label className="fl">
      {label}
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} autoFocus={focus} />
    </label>
  );
}

const Warning = () => (
  <div className="privacy-note" style={{ background: 'var(--amb-soft)', color: 'var(--amb)' }}>
    <Icon name="lock" />
    <span>
      <b>Write your password down somewhere safe.</b> Encrypted trees can’t be opened without it, and there’s no way to reset it — not even by us.
    </span>
  </div>
);

export function SetPasswordModal({ close }: { close: () => void }) {
  const treeId = useData((s) => s.treeId);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [encrypt, setEncrypt] = useState(platform.isTauri());
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(a) || (b && a !== b ? 'The two passwords don’t match.' : '');
  const save = async () => {
    if (problem || a !== b) return;
    setBusy(true);
    try {
      const v = await makeVerifier(a);
      await platform.setSessionKey(a);
      setPrefs({ lock: v });
      if (encrypt && treeId) {
        await platform.backupNow(treeId, 'manual').catch(() => undefined);
        await platform.setTreeEncryption(treeId, true);
      }
      close();
      toast(encrypt ? 'Password set — this tree is now encrypted' : 'Password set — the app will ask for it when it opens');
    } catch (e) {
      toast('Couldn’t finish: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label="Set an app password" onClose={close}>
      <h2 className="h2">Set an app password</h2>
      <p className="muted" style={{ margin: 0 }}>
        The app will ask for this password every time it opens.
      </p>
      <PwField label="New password" value={a} onChange={setA} focus />
      <PwField label="Type it again" value={b} onChange={setB} />
      {a && <div className="small" style={{ color: problem ? 'var(--bad)' : 'var(--ok)', fontWeight: 700 }}>{problem || '✓ Looks good'}</div>}
      {platform.isTauri() && (
        <label className="ck">
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          Also encrypt this tree file and its backups (recommended)
        </label>
      )}
      <Warning />
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy || !!problem || !b}>
          {busy ? 'Working…' : 'Set password'}
        </button>
      </div>
    </ModalFrame>
  );
}

export function ChangePasswordModal({ close }: { close: () => void }) {
  const lock = useData((s) => s.prefs.lock);
  const [old, setOld] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(a) || (b && a !== b ? 'The two passwords don’t match.' : '');
  const save = async () => {
    if (!lock || problem || a !== b) return;
    setBusy(true);
    try {
      if (!(await checkPassword(old, lock))) {
        toast('Your current password isn’t right');
        return;
      }
      const n = await platform.changeKey(old, a);
      setPrefs({ lock: await makeVerifier(a) });
      await platform.setSessionKey(a);
      close();
      toast(n ? `Password changed — ${n} encrypted file${n === 1 ? '' : 's'} updated` : 'Password changed');
    } catch (e) {
      toast('Couldn’t change the password: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label="Change your app password" onClose={close}>
      <h2 className="h2">Change your app password</h2>
      <PwField label="Current password" value={old} onChange={setOld} auto="current-password" focus />
      <PwField label="New password" value={a} onChange={setA} />
      <PwField label="Type the new one again" value={b} onChange={setB} />
      {a && <div className="small" style={{ color: problem ? 'var(--bad)' : 'var(--ok)', fontWeight: 700 }}>{problem || '✓ Looks good'}</div>}
      <p className="muted small" style={{ margin: 0 }}>
        Every encrypted tree and backup is switched to the new password.
      </p>
      <Warning />
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy || !old || !!problem || !b}>
          {busy ? 'Working…' : 'Change password'}
        </button>
      </div>
    </ModalFrame>
  );
}

export function RemovePasswordModal({ close }: { close: () => void }) {
  const lock = useData((s) => s.prefs.lock);
  const trees = useData((s) => s.prefs.trees);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!lock) return close();
    setBusy(true);
    try {
      if (!(await checkPassword(pw, lock))) {
        toast('That password isn’t right');
        return;
      }
      await platform.setSessionKey(pw);
      // Encrypted trees are decrypted first, so nothing is left locked without a password.
      let n = 0;
      for (const t of trees) {
        if (await platform.isTreeEncrypted(t.id).catch(() => false)) {
          await platform.setTreeEncryption(t.id, false);
          n++;
        }
      }
      setPrefs({ lock: null });
      await platform.setSessionKey(null);
      close();
      toast(n ? `Password removed — ${n} tree${n === 1 ? '' : 's'} decrypted` : 'Password removed');
    } catch (e) {
      toast('Couldn’t remove the password: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label="Turn off the app password" onClose={close}>
      <h2 className="h2">Turn off the app password</h2>
      <p style={{ margin: 0 }}>The app will open without asking. Any encrypted trees are decrypted, so they stay readable.</p>
      <PwField label="Current password" value={pw} onChange={setPw} auto="current-password" focus />
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={remove} disabled={busy || !pw}>
          {busy ? 'Working…' : 'Turn off'}
        </button>
      </div>
    </ModalFrame>
  );
}

export function EncryptModal({ on, close }: { on: boolean; close: () => void }) {
  const treeId = useData((s) => s.treeId);
  const name = useData((s) => s.data.settings.tree_name || 'this tree');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await platform.backupNow(treeId, 'manual').catch(() => undefined);
      await platform.setTreeEncryption(treeId, on);
      close();
      toast(on ? `${name} is now encrypted` : `${name} is no longer encrypted`);
    } catch (e) {
      toast('Couldn’t change encryption: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label={on ? 'Encrypt this tree' : 'Stop encrypting this tree'} onClose={close}>
      <h2 className="h2">{on ? `Encrypt “${name}”?` : `Stop encrypting “${name}”?`}</h2>
      <p style={{ margin: 0 }}>
        {on
          ? 'The tree file and its backups will be encrypted with your app password. Copies saved to a folder or USB drive are encrypted too, and open in Family Tree with the same password.'
          : 'The tree file and its backups will be saved without encryption. Anyone with access to this computer’s files could read them.'}
      </p>
      {on && <Warning />}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={go} disabled={busy}>
          {busy ? 'Working…' : on ? 'Encrypt' : 'Stop encrypting'}
        </button>
      </div>
    </ModalFrame>
  );
}
