// Sign up, log in, "About you", signing out, and account settings.

import { useState } from 'react';
import { closeTree, createTree, myTrees, openTree, setPrefs, updateAccount, useData } from '../../data/store';
import { setUi, toast, useUi } from '../../data/ui';
import { flushNotes, openPerson } from '../../data/actions';
import * as platform from '../../data/platform';
import { aboutYouProblem, makeSelfTree, newDataKey, newRecoveryCode, normEmail, normRecoveryCode, unwrapKey, validEmail, wrapKey, type Account, type AboutYou, type ParentInput } from '../../lib/accounts';
import { checkPassword, passwordProblem } from '../../lib/password';
import { DateInput } from '../../components/DateInput';
import { Icon, ModalFrame, Seg, Switch } from '../../components/ui';

// ---------- session ----------

let sessionKey: string | null = null; // the signed-in account's data key (memory only)
let pendingRecovery: string | null = null; // shown once, straight after sign-up
let triedKey = false;

export const currentKey = () => sessionKey;

/** After signing in: open your last tree, or ask "About you" if your tree isn't there yet. */
export async function continueStartup(withKey = false) {
  triedKey = withKey;
  const { prefs, account } = useData.getState();
  if (!account) {
    setUi({ screen: 'auth' });
    return;
  }
  if (pendingRecovery) {
    setUi({ screen: 'recovery' });
    return;
  }
  const mine = myTrees(prefs, account);
  if (!account.personId || !mine.length) {
    setUi({ screen: 'about' });
    return;
  }
  const target = mine.find((t) => t.id === account.lastTree) || mine.find((t) => t.id === account.treeId) || mine[0];
  try {
    await openTree(target.id);
    setUi({ screen: 'app', section: 'home' });
    return;
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg.includes(platform.NEEDS_PASSWORD) && !triedKey) {
      await signOut();
      toast('Please log in with your password.');
      return;
    }
    toast('Couldn’t open your tree: ' + msg);
  }
  setUi({ screen: 'about' });
}

async function signIn(acc: Account, dataKey: string, keep: boolean) {
  sessionKey = dataKey;
  await platform.setSessionKey(dataKey);
  let kept = keep;
  if (keep) {
    kept = await platform.keychainSet(acc.id, dataKey).catch(() => false);
    if (!kept) toast('This computer can’t remember your sign-in, so you’ll log in each time.');
  } else await platform.keychainDelete(acc.id).catch(() => undefined);
  const { prefs } = useData.getState();
  const next = { ...acc, keepSignedIn: kept };
  // Trees made before accounts existed belong to the first person to sign up.
  const claim = prefs.accounts.length <= 1;
  setPrefs({
    accounts: prefs.accounts.some((a) => a.id === acc.id) ? prefs.accounts.map((a) => (a.id === acc.id ? next : a)) : [...prefs.accounts, next],
    session: kept ? acc.id : '',
    trees: claim ? prefs.trees.map((t) => (t.owner ? t : { ...t, owner: acc.id })) : prefs.trees,
    ownerName: acc.name || prefs.ownerName,
  });
  useData.setState({ account: next, hasKey: true });
  await continueStartup(true);
}

/** At start-up: sign straight in if "keep me signed in" was chosen on this computer. */
export async function startSession() {
  const { prefs } = useData.getState();
  const acc = prefs.accounts.find((a) => a.id === prefs.session && a.keepSignedIn);
  if (acc) {
    const key = await platform.keychainGet(acc.id).catch(() => null);
    if (key) return signIn(acc, key, true);
  }
  setUi({ screen: 'auth' });
}

export async function signOut() {
  const { account } = useData.getState();
  await flushNotes();
  setUi({ panel: null, form: null, modal: null, menu: null });
  await closeTree();
  sessionKey = null;
  await platform.setSessionKey(null);
  if (account) {
    await platform.keychainDelete(account.id).catch(() => undefined);
    updateAccount({ keepSignedIn: false });
  }
  useData.setState({ account: null, hasKey: false });
  setPrefs({ session: '' });
  setUi({ screen: 'auth' });
}

/** Creates an account with a fresh data key and recovery code. */
async function createAccount(email: string, password: string, keep: boolean, legacyPassword?: string) {
  const dataKey = newDataKey();
  const recovery = newRecoveryCode();
  const acc: Account = {
    id: platform.newId(),
    email,
    name: '',
    keyByPassword: await wrapKey(dataKey, password),
    keyByRecovery: await wrapKey(dataKey, recovery),
    personId: '',
    treeId: '',
    lastTree: '',
    keepSignedIn: keep,
    createdAt: new Date().toISOString(),
  };
  // Trees encrypted with the old v0.3 app password move to the new account key.
  if (legacyPassword) {
    await platform.changeKey(legacyPassword, dataKey);
    setPrefs({ lock: null });
  }
  pendingRecovery = recovery;
  await signIn(acc, dataKey, keep);
}

// ---------- screens ----------

function PwInput({ label, value, onChange, auto, focus }: { label: string; value: string; onChange: (v: string) => void; auto: string; focus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <label className="fl">
      {label}
      <div className="dateinput">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} autoFocus={focus} />
        <button type="button" className="cal-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </label>
  );
}

type AuthMode = 'login' | 'signup' | 'forgot';

export function AuthScreen() {
  const accounts = useData((s) => s.prefs.accounts);
  const trees = useData((s) => s.prefs.trees);
  const legacyLock = useData((s) => s.prefs.lock);
  const [mode, setMode] = useState<AuthMode>(accounts.length ? 'login' : 'signup');
  const [email, setEmail] = useState(accounts.length === 1 ? accounts[0].email : '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [oldPw, setOldPw] = useState('');
  const [code, setCode] = useState('');
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const firstEver = !accounts.length;
  const needsOld = firstEver && !!legacyLock;

  const switchTo = (m: AuthMode) => {
    setMode(m);
    setErr('');
    setPw('');
    setPw2('');
  };

  const submit = async () => {
    setErr('');
    const e = normEmail(email);
    if (!validEmail(e)) return setErr('Enter a valid email address.');
    setBusy(true);
    try {
      const acc = accounts.find((a) => a.email === e);
      if (mode === 'login') {
        const key = acc ? await unwrapKey(acc.keyByPassword, pw) : null;
        if (!acc || !key) return setErr('That email and password don’t match an account on this computer.');
        setPw('');
        await signIn(acc, key, keep);
      } else if (mode === 'forgot') {
        if (!acc) return setErr('There’s no account with that email on this computer.');
        const key = await unwrapKey(acc.keyByRecovery, normRecoveryCode(code));
        if (!key) return setErr('That recovery code isn’t right. Check each group of four letters and numbers.');
        const prob = passwordProblem(pw) || (pw !== pw2 ? 'The two passwords don’t match.' : '');
        if (prob) return setErr(prob);
        const next = { ...acc, keyByPassword: await wrapKey(key, pw) };
        setPw('');
        setPw2('');
        setCode('');
        toast('Password reset — welcome back');
        await signIn(next, key, keep);
      } else {
        if (acc) return setErr('There’s already an account with that email on this computer — log in instead.');
        const prob = passwordProblem(pw) || (pw !== pw2 ? 'The two passwords don’t match.' : '');
        if (prob) return setErr(prob);
        if (needsOld && !(await checkPassword(oldPw, legacyLock!))) return setErr('Your current app password isn’t right.');
        setPw('');
        setPw2('');
        await createAccount(e, pw, keep, needsOld ? oldPw : undefined);
      }
    } catch (ex) {
      setErr('Something went wrong: ' + String((ex as Error)?.message || ex));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'login' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : 'Every family has a story worth keeping';
  const lede =
    mode === 'login'
      ? 'Log in to open your family tree.'
      : mode === 'forgot'
        ? 'Use the recovery code you saved when you signed up, then choose a new password.'
        : 'Create your account. Your tree starts with you — we’ll ask about you next.';

  return (
    <main className="first" style={{ overflow: 'auto' }}>
      <form
        className="first-inner"
        style={{ maxWidth: 460, gap: 12 }}
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <svg className="illo" viewBox="0 0 160 110" style={{ width: 120, height: 82 }} aria-hidden="true">
          <path className="fillsoft" d="M80 18c-22 0-38 14-38 32 0 16 14 28 32 30v22h12V80c18-2 32-14 32-30 0-18-16-32-38-32z" />
          <path d="M80 102V60M80 74l-14-12M80 66l14-12M80 84l10-8" />
          <circle cx="58" cy="40" r="5" />
          <circle cx="102" cy="40" r="5" />
          <circle cx="80" cy="30" r="5" />
          <path d="M40 104h80" />
        </svg>
        <h1 className="h1" style={{ fontSize: 34 }}>
          {title}
        </h1>
        <p className="lede" style={{ fontSize: 17 }}>
          {lede}
        </p>
        {!firstEver && mode !== 'forgot' && (
          <Seg
            label="Log in or sign up"
            value={mode}
            onChange={switchTo}
            options={[
              ['login', 'Log in'],
              ['signup', 'Sign up'],
            ]}
          />
        )}
        {firstEver && mode === 'signup' && (
          <div className="steps" aria-hidden="true" style={{ width: '100%' }}>
            <span className="on" />
            <span />
            <span />
          </div>
        )}
        <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="fl">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus={!email} />
          </label>
          {mode === 'forgot' && (
            <label className="fl">
              Recovery code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', letterSpacing: '0.05em' }} />
            </label>
          )}
          <PwInput label={mode === 'forgot' ? 'New password' : 'Password'} value={pw} onChange={setPw} auto={mode === 'login' ? 'current-password' : 'new-password'} focus={!!email && mode === 'login'} />
          {mode !== 'login' && <PwInput label="Type the password again" value={pw2} onChange={setPw2} auto="new-password" />}
          {mode === 'signup' && needsOld && (
            <>
              <PwInput label="Your current app password" value={oldPw} onChange={setOldPw} auto="current-password" />
              <span className="fieldnote">You set an app password in an earlier version. Enter it once so your encrypted trees move into your account.</span>
            </>
          )}
          {mode !== 'login' && pw && <span className="small" style={{ fontWeight: 700, color: passwordProblem(pw) ? 'var(--bad)' : 'var(--ok)' }}>{passwordProblem(pw) || '✓ Long enough'}</span>}
          <label className="ck">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Keep me signed in on this computer
          </label>
        </div>
        <div role="alert" className="small" style={{ color: 'var(--bad)', minHeight: 20, fontWeight: 700 }}>
          {err}
        </div>
        <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', minHeight: 46 }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'forgot' ? 'Reset password' : 'Create account'}
        </button>
        {mode === 'login' && (
          <button type="button" className="link" onClick={() => switchTo('forgot')}>
            Forgot your password?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link" onClick={() => switchTo('login')}>
            Back to log in
          </button>
        )}
        {mode === 'signup' && firstEver && trees.length > 0 && <p className="fine">The {trees.length} tree{trees.length === 1 ? '' : 's'} already on this computer will be added to your account.</p>}
        {mode === 'signup' && (
          <p className="fine">Your account and tree are kept on this computer. When the Family Wall arrives, the same email and password become your online account.</p>
        )}
      </form>
    </main>
  );
}

/** Shown once after sign-up: the code that can reset a forgotten password. */
export function RecoveryScreen() {
  const account = useData((s) => s.account);
  const [saved, setSaved] = useState(false);
  const code = pendingRecovery || '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Recovery code copied');
    } catch {
      toast('Couldn’t copy — please write it down');
    }
  };
  const saveFile = async () => {
    const text = `Family Tree recovery code\n\nAccount: ${account?.email}\nRecovery code: ${code}\n\nKeep this somewhere safe. It lets you reset your password if you forget it.\n`;
    const name = await platform.saveTextFile('Family Tree recovery code.txt', text, [{ name: 'Text file', extensions: ['txt'] }]).catch(() => null);
    if (name) toast('Saved ' + name);
  };
  return (
    <main className="first" style={{ overflow: 'auto' }}>
      <div className="first-inner" style={{ maxWidth: 560, gap: 14 }}>
        <div className="steps" aria-hidden="true" style={{ width: '100%' }}>
          <span className="on" />
          <span className="on" />
          <span />
        </div>
        <span className="fc-ico" style={{ width: 64, height: 64, borderRadius: 18 }}>
          <Icon name="lock" />
        </span>
        <h1 className="h1" style={{ fontSize: 32 }}>
          Save your recovery code
        </h1>
        <p className="lede">If you ever forget your password, this code lets you set a new one without losing your tree. It’s only shown now.</p>
        <div className="card" style={{ width: '100%', textAlign: 'center' }}>
          <div aria-label="Your recovery code" className="recovery-code">
            {code}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={copy}>
              Copy
            </button>
            <button className="btn" onClick={saveFile}>
              Save as a file
            </button>
            <button className="btn" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
        <label className="ck">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I’ve written it down or saved it somewhere safe
        </label>
        <button
          className="btn primary"
          disabled={!saved}
          style={{ width: '100%', minHeight: 46 }}
          onClick={() => {
            pendingRecovery = null;
            continueStartup(true);
          }}
        >
          Continue
        </button>
      </div>
      <div className="printroot">
        <div className="printpage">
          <h1 className="bk-h">Family Tree recovery code</h1>
          <p>Account: {account?.email}</p>
          <p style={{ fontFamily: 'monospace', fontSize: '20pt' }}>{code}</p>
          <p>Keep this somewhere safe. It lets you reset your password if you forget it.</p>
        </div>
      </div>
    </main>
  );
}

function RecoveryCodeModal({ close }: { close: () => void }) {
  const account = useData((s) => s.account);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (!account) return;
    setBusy(true);
    try {
      const key = await unwrapKey(account.keyByPassword, pw);
      if (!key) return toast('That password isn’t right');
      const fresh = newRecoveryCode();
      updateAccount({ keyByRecovery: await wrapKey(key, fresh) });
      setCode(fresh);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label="New recovery code" onClose={close}>
      <h2 className="h2">New recovery code</h2>
      {!code ? (
        <>
          <p style={{ margin: 0 }}>Your old code stops working and a new one is shown once. Enter your password to continue.</p>
          <PwInput label="Your password" value={pw} onChange={setPw} auto="current-password" focus />
          <div className="mfoot">
            <button className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" onClick={make} disabled={busy || !pw}>
              Make a new code
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>Write this down or save it somewhere safe:</p>
          <div className="card" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', textAlign: 'center', userSelect: 'all' }}>
            {code}
          </div>
          <div className="mfoot">
            <button className="btn" onClick={() => navigator.clipboard.writeText(code).then(() => toast('Copied'))}>
              Copy
            </button>
            <button className="btn primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}

const emptyParent = (): ParentInput => ({ given: '', surname: '', living: true });

export function AboutYouScreen() {
  const account = useData((s) => s.account);
  const [a, setA] = useState<AboutYou>({ given: '', surname: '', sex: 'U', birthDate: '', birthPlace: '', livesIn: '', father: emptyParent(), mother: emptyParent() });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AboutYou>) => setA({ ...a, ...patch });
  const setParent = (k: 'father' | 'mother', patch: Partial<ParentInput>) => setA({ ...a, [k]: { ...a[k]!, ...patch } });

  const save = async () => {
    const prob = aboutYouProblem(a);
    if (prob) return setErr(prob);
    if (!account) return;
    setBusy(true);
    try {
      const { data, selfId } = makeSelfTree(a, account.email, platform.newId);
      const treeId = await createTree(data);
      // Your own tree is encrypted with your account from the start (desktop app).
      if (platform.isTauri()) await platform.setTreeEncryption(treeId, true).catch((e) => console.warn('Encryption skipped', e));
      const first = a.given.trim().split(/\s+/)[0];
      updateAccount({ personId: selfId, treeId, lastTree: treeId, name: first });
      setPrefs({ ownerName: first });
      setUi({ screen: 'app', section: 'tree', panel: null });
      setTimeout(() => openPerson(selfId), 50);
      toast(`Welcome, ${first}! Your tree has started with you.`);
    } catch (e) {
      setErr('Couldn’t create your tree: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const parentRow = (k: 'father' | 'mother', label: string) => (
    <fieldset className="parentrow">
      <legend>{label}</legend>
      <div className="frow">
        <label className="fl">
          Given names
          <input value={a[k]!.given} onChange={(e) => setParent(k, { given: e.target.value })} />
        </label>
        <label className="fl">
          Surname at birth
          <input value={a[k]!.surname} onChange={(e) => setParent(k, { surname: e.target.value })} />
        </label>
      </div>
      <label className="ck">
        <input type="checkbox" checked={a[k]!.living} onChange={(e) => setParent(k, { living: e.target.checked })} />
        Still living
      </label>
    </fieldset>
  );

  return (
    <main className="first" style={{ overflow: 'auto', alignItems: 'flex-start', padding: '40px 0' }}>
      <form
        className="first-inner"
        style={{ maxWidth: 620, textAlign: 'left', alignItems: 'stretch', gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="steps" aria-hidden="true">
          <span className="on" />
          <span className="on" />
          <span className="on" />
        </div>
        <h1 className="h1" style={{ fontSize: 32 }}>
          About you
        </h1>
        <p className="lede" style={{ margin: 0 }}>
          Your family tree starts with you. These details are about you, so they’re marked as verified straight away.
        </p>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="frow">
            <label className="fl">
              Given names
              <input value={a.given} onChange={(e) => set({ given: e.target.value })} autoFocus autoComplete="given-name" placeholder="e.g. Peter John" />
            </label>
            <label className="fl">
              Surname at birth
              <input value={a.surname} onChange={(e) => set({ surname: e.target.value })} autoComplete="family-name" />
            </label>
          </div>
          <div className="frow">
            <label className="fl">
              Date of birth
              <DateInput value={a.birthDate} onChange={(v) => set({ birthDate: v })} placeholder="e.g. 17 Oct 1946" label="your date of birth" />
            </label>
            <label className="fl">
              Place of birth
              <input value={a.birthPlace} onChange={(e) => set({ birthPlace: e.target.value })} placeholder="Town, state, country" />
            </label>
          </div>
          <label className="fl">
            Where you live now
            <input value={a.livesIn} onChange={(e) => set({ livesIn: e.target.value })} placeholder="Town, state, country" autoComplete="address-level2" />
          </label>
          <label className="fl" style={{ maxWidth: 280 }}>
            Sex
            <select value={a.sex} onChange={(e) => set({ sex: e.target.value as AboutYou['sex'] })}>
              <option value="U">Prefer not to say</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="X">Other</option>
            </select>
          </label>
          <div className="privacy-note">
            <Icon name="lock" />
            <span>You’re a living person, so your details stay private. Nothing is shared unless you choose to share it.</span>
          </div>
        </section>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 className="h3">Your parents (optional)</h2>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              Add them now to start building up your tree, or skip and add them later.
            </p>
          </div>
          {parentRow('father', 'Father')}
          {parentRow('mother', 'Mother')}
        </section>
        <div role="alert" className="small" style={{ color: 'var(--bad)', minHeight: 20, fontWeight: 700 }}>
          {err}
        </div>
        <div className="row">
          <button className="btn primary" type="submit" disabled={busy} style={{ minHeight: 46, padding: '0 24px' }}>
            {busy ? 'Creating your tree…' : 'Start my family tree'}
          </button>
          <button type="button" className="btn ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </form>
    </main>
  );
}

// ---------- settings ----------

export function AccountTab() {
  const account = useData((s) => s.account);
  const [modal, setModal] = useState<'' | 'recovery'>('');
  if (!account) return null;
  const keep = account.keepSignedIn;
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Your account</h2>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{account.email}</dd>
          <dt>Name</dt>
          <dd>{account.name || '—'}</dd>
          <dt>Created</dt>
          <dd>{new Date(account.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          <dt>Kept</dt>
          <dd>On this computer</dd>
        </dl>
        <div className="toggle">
          <span style={{ flex: 1 }}>
            <span className="li-t">Keep me signed in on this computer</span>
            <span className="li-s">Skips the log-in screen. Your key is held in this computer’s secure password store.</span>
          </span>
          <Switch
            on={keep}
            onToggle={async () => {
              const key = currentKey();
              if (!keep && key) {
                const ok = await platform.keychainSet(account.id, key);
                if (!ok) return toast('This computer can’t remember your sign-in.');
                updateAccount({ keepSignedIn: true });
                setPrefs({ session: account.id });
              } else {
                await platform.keychainDelete(account.id);
                updateAccount({ keepSignedIn: false });
                setPrefs({ session: '' });
              }
            }}
            label="Keep me signed in"
          />
        </div>
        <div className="row">
          <button className="btn" onClick={() => setUi({ modal: { kind: 'changePassword' } })}>
            Change password
          </button>
          <button className="btn" onClick={() => setModal('recovery')}>
            New recovery code
          </button>
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">Coming with the Family Wall</h2>
        <p className="muted" style={{ margin: 0 }}>
          When the Family Wall arrives, this account becomes your online account with the same email and password. You’ll be able to invite relatives, use the app on your phone and keep a cloud backup.
        </p>
      </section>
      {modal === 'recovery' && <RecoveryCodeModal close={() => setModal('')} />}
    </div>
  );
}

export function ChangePasswordModal({ close }: { close: () => void }) {
  const account = useData((s) => s.account);
  const [old, setOld] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(a) || (b && a !== b ? 'The two passwords don’t match.' : '');
  const save = async () => {
    if (!account || problem || a !== b) return;
    setBusy(true);
    try {
      const key = await unwrapKey(account.keyByPassword, old);
      if (!key) return toast('Your current password isn’t right');
      updateAccount({ keyByPassword: await wrapKey(key, a) });
      close();
      toast('Password changed');
    } catch (e) {
      toast('Couldn’t change the password: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalFrame label="Change your password" onClose={close}>
      <h2 className="h2">Change your password</h2>
      <PwInput label="Current password" value={old} onChange={setOld} auto="current-password" focus />
      <PwInput label="New password" value={a} onChange={setA} auto="new-password" />
      <PwInput label="Type the new one again" value={b} onChange={setB} auto="new-password" />
      {a && <div className="small" style={{ color: problem ? 'var(--bad)' : 'var(--ok)', fontWeight: 700 }}>{problem || '✓ Looks good'}</div>}
      <p className="muted small" style={{ margin: 0 }}>
        Your trees stay as they are — only the password that unlocks them changes. Your recovery code still works.
      </p>
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

export function useIsSelf(pid: string) {
  const account = useData((s) => s.account);
  const treeId = useData((s) => s.treeId);
  const selfSetting = useData((s) => s.data.settings.self_person);
  return !!account && ((account.treeId === treeId && account.personId === pid) || selfSetting === pid);
}

export { useUi };
