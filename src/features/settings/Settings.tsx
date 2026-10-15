import { useEffect, useMemo, useState } from 'react';
import { reloadTree, setPrefs, useData } from '../../data/store';
import { setUi, toast, useUi } from '../../data/ui';
import { setSetting } from '../../data/actions';
import * as platform from '../../data/platform';
import { treeApi } from '../../lib/family';
import { exportGedcom } from '../../lib/gedcom/export';
import { relativeTime } from '../../lib/dates';
import { Icon, Seg, Switch, Tabs, fmtBytes } from '../../components/ui';
import { GedcomImport } from './GedcomImport';
import { SCHEDULES } from './backups';
import { ThemeGrid } from '../Modals';
import { SecurityCard } from '../security/Security';
import { AccountTab } from '../account/Account';

export function Settings() {
  const stab = useUi((s) => s.stab);
  return (
    <div className="view">
      <div className="page">
        <h1 className="h1">Settings</h1>
        <Tabs
          value={stab}
          onChange={(k) => setUi({ stab: k })}
          tabs={[
            ['account', 'Account'],
            ['gedcom', 'GEDCOM'],
            ['backup', 'Backup & security'],
            ['privacy', 'Privacy'],
            ['appearance', 'Appearance'],
            ['sync', 'Sync'],
          ]}
        />
        {stab === 'gedcom' && (
          <div className="grid2" style={{ alignItems: 'start' }}>
            <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="h2">Import a GEDCOM file</h2>
              <GedcomImport />
            </section>
            <GedcomExport />
          </div>
        )}
        {stab === 'account' && <AccountTab />}
        {stab === 'backup' && <BackupTab />}
        {stab === 'privacy' && <PrivacyTab />}
        {stab === 'appearance' && <AppearanceTab />}
        {stab === 'sync' && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            <div className="row">
              <h2 className="h2 grow">Online tree</h2>
              <span className="phasechip">Coming in Phase 3</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Keep this tree in step with an online copy so you can use it on your phone and share it with the Family Wall. Changes on either side are merged; when the same thing changed in both places, you choose which to keep.
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              Until then, everything stays on this computer. Use Backup & security to keep copies safe.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function GedcomExport() {
  const data = useData((s) => s.data);
  const owner = useData((s) => s.prefs.ownerName);
  const [o, setO] = useState({ sources: true, media: true, notes: true, excludeLiving: true });
  const T = treeApi(data);
  const out = useMemo(() => exportGedcom(T, { ...o, submitter: owner || undefined, treeName: data.settings.tree_name }), [data, o, owner]);
  const save = async () => {
    const name = (data.settings.tree_name || 'Family tree').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '.ged';
    try {
      const saved = await platform.saveTextFile(name, out.text, [{ name: 'GEDCOM family tree', extensions: ['ged'] }]);
      if (saved) toast(`Saved ${saved} — ${out.people} people${out.excluded ? `, ${out.excluded} living people excluded` : ''}`);
    } catch (e) {
      toast('Couldn’t save: ' + String((e as Error)?.message || e));
    }
  };
  const opts: [keyof typeof o, string][] = [
    ['sources', 'Sources and citations'],
    ['media', 'Media links'],
    ['notes', 'Notes'],
    ['excludeLiving', 'Exclude living people'],
  ];
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="h2">Export a GEDCOM file</h2>
      <div>
        {opts.map(([k, l]) => (
          <label key={k} className="ck">
            <input type="checkbox" checked={o[k]} onChange={() => setO({ ...o, [k]: !o[k] })} />
            {l}
          </label>
        ))}
      </div>
      <div className="muted small">
        {out.people} people · {out.families} families · {out.excluded} living people excluded · {out.lines.toLocaleString()} lines · GEDCOM 5.5.1, UTF-8
      </div>
      <pre className="pre" tabIndex={0} aria-label="Preview of the GEDCOM file">{out.text.split('\n').slice(0, 40).join('\n') + '\n…'}</pre>
      <button className="btn primary" onClick={save} style={{ alignSelf: 'flex-start' }}>
        <Icon name="download" sm />
        Export .ged
      </button>
    </section>
  );
}

function BackupTab() {
  const treeId = useData((s) => s.treeId);
  const data = useData((s) => s.data);
  const [list, setList] = useState<platform.BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = () => platform.listBackups(treeId).then(setList).catch(() => setList([]));
  useEffect(() => {
    refresh();
  }, [treeId]);
  const schedule = data.settings.backup_schedule || 'daily';
  const now = async () => {
    setBusy(true);
    try {
      await platform.backupNow(treeId, 'manual');
      await refresh();
      toast('Backup complete');
    } catch (e) {
      toast('Backup failed: ' + String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  const restore = (b: platform.BackupInfo) =>
    setUi({
      modal: {
        kind: 'confirm',
        title: 'Restore this backup?',
        body: `Your tree will go back to how it was on ${relativeTime(b.created)}. A backup of how it is right now is made first, so you can undo this.`,
        action: 'Restore',
        onConfirm: async () => {
          try {
            await platform.restoreBackup(treeId, b.file);
            await reloadTree();
            setUi({ panel: null, form: null });
            await refresh();
            toast('Backup restored');
          } catch (e) {
            toast('Restore failed: ' + String((e as Error)?.message || e));
          }
        },
      },
    });
  const copyOut = async () => {
    try {
      const where = await platform.exportBackupToFolder(treeId, `${data.settings.tree_name || 'Family tree'} backup ${new Date().toISOString().slice(0, 10)}`);
      if (where) toast('Copy saved to ' + where);
    } catch (e) {
      toast('Couldn’t save the copy: ' + String((e as Error)?.message || e));
    }
  };
  const reasonLabel: Record<string, string> = { manual: 'Backed up by you', auto: 'Automatic', close: 'When the app closed', 'before-import': 'Before a GEDCOM import', 'before-restore': 'Before a restore', 'before-merge': 'Before merging two people' };
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Backups</h2>
        <label className="fl">
          Automatic local backup
          <select value={schedule} onChange={(e) => setSetting('backup_schedule', e.target.value)}>
            {SCHEDULES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="toggle">
          <span style={{ flex: 1 }}>
            <span className="li-t">Cloud backup</span>
            <span className="li-s">An encrypted copy online · arrives with the Family Wall in Phase 3</span>
          </span>
          <Switch on={false} onToggle={() => {}} label="Cloud backup" disabled />
        </div>
        <div className="list">
          {list.slice(0, 12).map((b) => (
            <div key={b.file} className="li">
              <span style={{ flex: 1 }}>
                <span className="li-t">{relativeTime(b.created)}</span>
                <span className="li-s">
                  This computer · {reasonLabel[b.reason] || b.reason} · {fmtBytes(b.sizeBytes)}
                </span>
              </span>
              <button className="btn sm" onClick={() => restore(b)}>
                Restore
              </button>
            </div>
          ))}
          {!list.length && <div className="empty">No backups yet.</div>}
        </div>
        <div className="row">
          <button className="btn primary" onClick={now} disabled={busy}>
            {busy ? 'Backing up…' : 'Back up now'}
          </button>
          {platform.isTauri() && (
            <button className="btn" onClick={copyOut}>
              Save a copy to a folder or USB drive…
            </button>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          The newest 20 backups are kept, including your photos and documents.
        </p>
        <MapCacheRow />
      </section>
      <SecurityCard />
    </div>
  );
}

function PrivacyTab() {
  const data = useData((s) => s.data);
  const rows = [
    ['Deceased people', 'Full details', 'Full details', 'Names and dates'],
    ['Living people, not opted in', 'Full details', 'Name only', 'Hidden'],
    ['Living people, opted in', 'Full details', 'What they chose to share', 'Hidden'],
    ['Research notes and tasks', 'Full', 'Hidden', 'Hidden'],
    ['Family Wall posts', 'All', 'All (except hidden)', 'Hidden'],
  ];
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">Who can see what</h2>
      <label className="fl" style={{ maxWidth: 420 }}>
        Default visibility of living people
        <select value={data.settings.privacy_default || 'Private'} onChange={(e) => setSetting('privacy_default', e.target.value)}>
          <option value="Private">Private — only you</option>
          <option value="Members">Wall members who are opted in</option>
        </select>
      </label>
      <div className="tablewrap" style={{ boxShadow: 'none' }}>
        <table className="table matrix">
          <thead>
            <tr>
              <th />
              <th>You (owner)</th>
              <th>Wall members</th>
              <th>Not invited · exports</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td className="strong">{r[0]}</td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
                <td>{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="privacy-note">
        <Icon name="lock" />
        <span>Right now your tree is only on this computer, so only you can see it. GEDCOM exports leave out living people unless you untick that option. Wall members arrive in Phase 3.</span>
      </div>
    </section>
  );
}

function AppearanceTab() {
  const prefs = useData((s) => s.prefs);
  const [name, setName] = useState(prefs.ownerName);
  return (
    <>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 className="h2">Colour theme</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Every theme works in light and dark mode and keeps text contrast readable.
          </p>
        </div>
        <ThemeGrid />
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
        <div className="fl">
          Light or dark
          <Seg label="Light or dark" value={prefs.dark ? 'dark' : 'light'} onChange={(k) => setPrefs({ dark: k === 'dark' })} options={[['light', 'Light'], ['dark', 'Dark']]} />
        </div>
        <div className="fl">
          Density
          <Seg label="Density" value={prefs.compact ? 'compact' : 'comf'} onChange={(k) => setPrefs({ compact: k === 'compact' })} options={[['comf', 'Comfortable'], ['compact', 'Compact']]} />
        </div>
        <label className="fl">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setPrefs({ ownerName: name.trim() })} placeholder="Used in greetings and as the submitter in GEDCOM exports" />
        </label>
      </section>
    </>
  );
}

function MapCacheRow() {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    platform.mapCacheInfo().then(setSize).catch(() => setSize(null));
  }, []);
  if (!platform.isTauri()) return null;
  return (
    <div className="toggle">
      <span style={{ flex: 1 }}>
        <span className="li-t">Saved map areas</span>
        <span className="li-s">{size === null ? 'Checking…' : fmtBytes(size) + ' kept so maps work offline (up to 400 MB)'}</span>
      </span>
      <button
        className="btn sm"
        onClick={async () => {
          await platform.mapCacheClear();
          setSize(0);
          toast('Saved map areas cleared');
        }}
      >
        Clear
      </button>
    </div>
  );
}
