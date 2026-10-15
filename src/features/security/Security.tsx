// Tree-file encryption, using your account password as the key.

import { useEffect, useState } from 'react';
import { useData } from '../../data/store';
import { setUi, toast, useUi } from '../../data/ui';
import * as platform from '../../data/platform';
import { unwrapKey } from '../../lib/accounts';
import { Icon, ModalFrame, Switch } from '../../components/ui';

/** The Security card in Settings → Backup & security. */
export function SecurityCard() {
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
          <span className="li-t">Encrypt this tree file</span>
          <span className="li-s">
            {!desktop
              ? 'Available in the desktop app'
              : enc
                ? 'On — this tree and its backups can only be opened with your account password'
                : 'Uses your account password, so the file is unreadable if this computer or a backup is lost'}
          </span>
        </span>
        <Switch on={!!enc} onToggle={() => setUi({ modal: { kind: 'encrypt', on: !enc } })} label="Encrypt this tree file" disabled={!desktop || enc === null} />
      </div>
      <p className="muted small" style={{ margin: '8px 0 0' }}>
        You log in with your account password each time the app opens (unless you chose to stay signed in). Change it under Settings → Account.
      </p>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={async () => toast('Your trees are saved in: ' + (await platform.revealDataFolder()))}>
        Show where my trees are saved
      </button>
    </section>
  );
}

const Warning = () => (
  <div className="privacy-note" style={{ background: 'var(--amb-soft)', color: 'var(--amb)' }}>
    <Icon name="lock" />
    <span>
      <b>Keep your password somewhere safe.</b> Encrypted trees can’t be opened without it, and there’s no way to reset it.
    </span>
  </div>
);

export function EncryptModal({ on, close }: { on: boolean; close: () => void }) {
  const treeId = useData((s) => s.treeId);
  const name = useData((s) => s.data.settings.tree_name || 'this tree');
  const account = useData((s) => s.account);
  const hasKey = useData((s) => s.hasKey);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (!hasKey) {
        // Signed in automatically: confirm the password once so it can be used as the key.
        const key = account ? await unwrapKey(account.keyByPassword, pw) : null;
        if (!key) {
          toast('That password isn’t right');
          return;
        }
        await platform.setSessionKey(key);
        useData.setState({ hasKey: true });
      }
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
          ? 'The tree file and its backups will be encrypted with your account password. Copies saved to a folder or USB drive are encrypted too.'
          : 'The tree file and its backups will be saved without encryption. Anyone with access to this computer’s files could read them.'}
      </p>
      {!hasKey && (
        <label className="fl">
          Your password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
      )}
      {on && <Warning />}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" onClick={go} disabled={busy || (!hasKey && !pw)}>
          {busy ? 'Working…' : on ? 'Encrypt' : 'Stop encrypting'}
        </button>
      </div>
    </ModalFrame>
  );
}
