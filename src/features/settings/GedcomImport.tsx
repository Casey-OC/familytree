import { useState } from 'react';
import { createTree, reloadTree, useData } from '../../data/store';
import { setUi, toast } from '../../data/ui';
import { backupNow, pickFile, readPickedBytes } from '../../data/platform';
import { SqlLog } from '../../data/repo';
import { decodeGedcom } from '../../lib/gedcom/parse';
import { buildImport, findDuplicates, mergeAdditions, type ImportPlan } from '../../lib/gedcom/importer';
import { fmtBytes, Seg } from '../../components/ui';

export function GedcomImport({ newTreeOnly = false }: { newTreeOnly?: boolean }) {
  const data = useData((s) => s.data);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [dupes, setDupes] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'merge' | 'new'>(newTreeOnly ? 'new' : 'merge');
  const [done, setDone] = useState('');
  const [working, setWorking] = useState(false);

  const pick = async () => {
    const f = await pickFile({ title: 'Choose a GEDCOM file', filters: [{ name: 'GEDCOM family tree', extensions: ['ged', 'GED'] }] });
    if (!f) return;
    setWorking(true);
    try {
      const bytes = await readPickedBytes(f);
      const { text, encoding } = decodeGedcom(bytes);
      if (!/^\s*(﻿)?0\s+HEAD/.test(text)) {
        toast('That doesn’t look like a GEDCOM file — it should start with “0 HEAD”.');
        return;
      }
      const p = buildImport(text, f.name, bytes.length, encoding);
      setPlan(p);
      setDupes(newTreeOnly ? {} : findDuplicates(p.data, data));
      setDone('');
    } catch (e) {
      toast('Couldn’t read that file: ' + String((e as Error)?.message || e));
    } finally {
      setWorking(false);
    }
  };

  const run = async () => {
    if (!plan) return;
    setWorking(true);
    try {
      if (mode === 'new') {
        const d = plan.data;
        d.settings = { tree_name: plan.treeName, subtitle: `Imported from ${plan.fileName}`, privacy_default: 'Private', backup_schedule: 'daily' };
        await createTree(d);
        setUi({ screen: 'app', section: 'home', panel: null });
        setDone(`A new tree “${plan.treeName}” was created with ${plan.counts.people} people.`);
        toast(`New tree created from ${plan.fileName}`);
      } else {
        const { treeId, db } = useData.getState();
        await backupNow(treeId, 'before-import').catch(() => undefined);
        const { add, added, linked } = mergeAdditions(plan.data, data, dupes);
        const sql = new SqlLog(false);
        sql.all(add);
        for (let i = 0; i < sql.stmts.length; i += 4000) await db!.batch(sql.stmts.slice(i, i + 4000));
        await reloadTree();
        const skipped = plan.problems.filter((x) => x.kind === 'Skipped').length;
        setDone(`${added} new people merged into this tree, ${linked} duplicate${linked === 1 ? '' : 's'} linked to existing people${skipped ? `, ${skipped} record${skipped === 1 ? '' : 's'} skipped` : ''}. A backup was made first.`);
        toast(`Import complete — ${added} people merged, ${linked} duplicates linked`);
      }
      setPlan(null);
    } catch (e) {
      toast('Import failed: ' + String((e as Error)?.message || e));
    } finally {
      setWorking(false);
    }
  };

  const dupeNames = Object.keys(dupes)
    .slice(0, 3)
    .map((id) => {
      const p = plan?.data.people.find((x) => x.id === id);
      return p ? `${p.given} ${p.surname}` : '';
    })
    .filter(Boolean);

  if (done)
    return (
      <>
        <div className="privacy-note">{done}</div>
        {!newTreeOnly && (
          <button className="btn" onClick={() => setDone('')} style={{ alignSelf: 'flex-start' }}>
            Import another file
          </button>
        )}
      </>
    );

  if (!plan)
    return (
      <>
        <p className="muted" style={{ margin: 0 }}>
          Bring in a tree from another program or website (Ancestry, FamilySearch, MyHeritage, Family Tree Maker, Gramps…). You’ll see a summary and any problems before anything changes.
        </p>
        <button className="btn primary" onClick={pick} style={{ alignSelf: 'flex-start' }} disabled={working}>
          {working ? 'Reading…' : 'Choose file…'}
        </button>
      </>
    );

  const warn = plan.problems.length;
  return (
    <>
      <div className="fact-box">
        <div className="strong">{plan.fileName}</div>
        <div className="muted small">
          GEDCOM {plan.version} · exported from {plan.sourceSystem} · {fmtBytes(plan.sizeBytes)} · {plan.encoding}
        </div>
      </div>
      <dl className="kv">
        <dt>People</dt>
        <dd>{plan.counts.people}</dd>
        <dt>Families</dt>
        <dd>{plan.counts.families}</dd>
        <dt>Facts</dt>
        <dd>{plan.counts.facts}</dd>
        <dt>Sources</dt>
        <dd>{plan.counts.sources}</dd>
        <dt>Media links</dt>
        <dd>{plan.counts.media ? `${plan.counts.media} (files not included — you can attach them later)` : 'None'}</dd>
        {!newTreeOnly && (
          <>
            <dt>Possible duplicates</dt>
            <dd>
              {Object.keys(dupes).length
                ? `${Object.keys(dupes).length} — e.g. ${dupeNames.join(', ')}`
                : 'None found'}
            </dd>
          </>
        )}
        <dt>Living people</dt>
        <dd>{plan.data.people.filter((p) => p.living).length} (kept private)</dd>
      </dl>
      {warn > 0 && (
        <div>
          <div className="fl" style={{ marginBottom: 6 }}>
            {warn} problem{warn === 1 ? '' : 's'} found
          </div>
          <div className="list small problems">
            {plan.problems.slice(0, 200).map((p, i) => (
              <div key={i} className="li">
                <span className={'conf ' + (p.kind === 'Warning' ? 'conf-probable' : 'conf-unverified')}>{p.kind}</span>
                Line {p.line.toLocaleString()}: {p.msg}
              </div>
            ))}
          </div>
        </div>
      )}
      {!newTreeOnly && (
        <Seg
          label="Import mode"
          value={mode}
          onChange={setMode}
          options={[
            ['merge', 'Merge into this tree'],
            ['new', 'Create a new tree'],
          ]}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={run} disabled={working}>
          {working ? 'Importing…' : 'Import'}
        </button>
        <button className="btn" onClick={() => setPlan(null)} disabled={working}>
          Cancel
        </button>
      </div>
    </>
  );
}
