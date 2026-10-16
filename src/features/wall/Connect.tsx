// Connecting your account to the online Family Wall (same email and password as the app).

import { useState } from 'react';
import { updateAccount, useData } from '../../data/store';
import { toast } from '../../data/ui';
import { changeOnlinePassword, confirmCode, connect, resendCode } from '../../wall/supabase';
import { wallConnected } from '../../wall/store';
import { Icon } from '../../components/ui';

export function ConnectWall() {
  const account = useData((s) => s.account);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [old, setOld] = useState('');
  const [askOld, setAskOld] = useState(false);
  const [step, setStep] = useState<'pw' | 'code'>('pw');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!account) return null;

  const done = async () => {
    updateAccount({ wallConnected: true });
    toast('Connected to the Family Wall');
    await wallConnected();
  };

  return (
    <form
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
          if (step === 'pw' && askOld && old) {
            // After a password reset: sign in with the previous password once, then switch it to the new one.
            const r0 = await connect(account.id, account.email, old);
            if (!r0.ok) return setErr('needsCode' in r0 ? 'Check your email first.' : r0.error);
            await changeOnlinePassword(account.id, pw);
            return await done();
          }
          const r = step === 'pw' ? await connect(account.id, account.email, pw) : await confirmCode(account.id, account.email, code, pw);
          if (r.ok) await done();
          else if ('needsCode' in r) setStep('code');
          else {
            setErr(r.error);
            if (/doesn’t match/.test(r.error)) setAskOld(true);
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="h2">Connect to the Family Wall</h2>
      {step === 'pw' ? (
        <>
          <p style={{ margin: 0 }}>
            The wall is online so your relatives can see it from their own computers. You use the same email and password as this app:{' '}
            <span className="strong">{account.email}</span>.
          </p>
          <label className="fl">
            Your app password
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          {askOld && (
            <label className="fl">
              Did you reset your password with your recovery code? Enter your previous password
              <input type="password" value={old} onChange={(e) => setOld(e.target.value)} autoComplete="off" />
              <span className="fieldnote">We’ll use it once to update your Family Wall password to your new one.</span>
            </label>
          )}
        </>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            We’ve sent an email to <span className="strong">{account.email}</span> to check it’s really you. Type the code from the email here — or click the link in it, then press
            Continue.
          </p>
          <label className="fl">
            Code from the email
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="e.g. 123456"
              autoFocus
              style={{ maxWidth: 220, letterSpacing: '0.15em' }}
            />
          </label>
          <button
            type="button"
            className="link"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              try {
                await resendCode(account.id, account.email);
                toast('Sent another email');
              } catch (e) {
                setErr(String((e as Error).message));
              }
            }}
          >
            Send the email again
          </button>
        </>
      )}
      <div role="alert" className="small" style={{ color: 'var(--bad)', fontWeight: 700, minHeight: 20 }}>
        {err}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy || (step === 'pw' ? !pw : false)}>
          {busy ? 'Connecting…' : step === 'pw' ? 'Connect' : 'Continue'}
        </button>
        {step === 'code' && (
          <button type="button" className="btn ghost" onClick={() => setStep('pw')}>
            Back
          </button>
        )}
      </div>
      <div className="privacy-note">
        <Icon name="lock" />
        <span>Your family tree stays on this computer. Only what you post on the wall — and what you choose to share — goes online, and only invited family can see it.</span>
      </div>
    </form>
  );
}
