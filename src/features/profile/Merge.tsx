// Comparing two records side by side and merging them into one profile; the list of possible duplicates.

import { useMemo, useState } from 'react';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { markNotDuplicate, mergePeople, openProfile } from '../../data/actions';
import { treeApi, type TreeApi } from '../../lib/family';
import { dateLabel } from '../../lib/dates';
import { findDuplicatePeople, mergeProblem, norm, type DuplicatePair, type FieldChoice } from '../../lib/merge';
import { Avatar, Icon, ModalFrame } from '../../components/ui';

const likelihood = (score: number) => (score >= 85 ? 'Very likely the same person' : score >= 70 ? 'Likely the same person' : 'Possibly the same person');
const sexLabel = { M: 'Male', F: 'Female', X: 'Another gender', U: 'Not recorded' } as const;

function Summary({ T, pid }: { T: TreeApi; pid: string }) {
  const p = T.person[pid];
  const birth = T.ff(pid, 'Birth');
  const death = T.ff(pid, 'Death');
  const row = (label: string, value: string) => (
    <div className="pf-row">
      <dt>{label}</dt>
      <dd>{value || <span className="muted">—</span>}</dd>
    </div>
  );
  return (
    <dl className="pf-about" style={{ margin: 0 }}>
      {row('Born', birth ? [dateLabel(birth), T.placeName(birth.placeId)].filter(Boolean).join(' · ') : '')}
      {!p.living && row('Died', death ? [dateLabel(death), T.placeName(death.placeId)].filter(Boolean).join(' · ') : '')}
      {row(
        'Parents',
        T.parents(pid)
          .map((x) => T.nm(x))
          .join(' and '),
      )}
      {row(
        'Partners',
        T.spouses(pid)
          .map((x) => T.nm(x))
          .join(', '),
      )}
      {row('Children', String(T.children(pid).length || ''))}
      {row('Facts', String(T.factsOf(pid).length))}
      {row('Photos', String(T.mediaOf(pid).length))}
    </dl>
  );
}

export function MergeModal({ keep: keep0, other: other0, close }: { keep: string; other: string; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const [ids, setIds] = useState<[string, string]>([keep0, other0]);
  const [keep, other] = ids;
  const [choice, setChoice] = useState<FieldChoice>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  // No second person yet: choose who to merge with.
  if (!other || !T.person[other]) {
    const list = data.people
      .filter((p) => p.id !== keep && (!q.trim() || norm(p.given + ' ' + p.surname).includes(norm(q))))
      .sort((a, b) => T.sortName(a.id).localeCompare(T.sortName(b.id)))
      .slice(0, 40);
    return (
      <ModalFrame label="Merge with another person" onClose={close} wide>
        <h2 className="h2">Merge {T.nm(keep)} with…</h2>
        <p className="muted" style={{ margin: 0 }}>
          Choose the other record of the same person. You’ll compare them before anything changes.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" autoFocus />
        <div className="list" style={{ maxHeight: 380, overflow: 'auto' }}>
          {list.map((p) => (
            <button key={p.id} className="li" onClick={() => setIds([keep, p.id])}>
              <Avatar pid={p.id} size="xs" />
              <span>
                <span className="li-t">{T.nm(p.id)}</span>
                <span className="li-s">{T.years(p.id) || 'No dates'}</span>
              </span>
            </button>
          ))}
          {!list.length && <span className="muted small">Nobody matches that name.</span>}
        </div>
        <div className="mfoot">
          <button className="btn" onClick={close}>
            Cancel
          </button>
        </div>
      </ModalFrame>
    );
  }

  const k = T.person[keep];
  const o = T.person[other];
  const problem = mergeProblem(data, keep, other);
  const fields: { key: keyof FieldChoice; label: string; a: string; b: string }[] = (
    [
      { key: 'given', label: 'Given names', a: k.given, b: o.given },
      { key: 'surname', label: 'Surname at birth', a: k.surname, b: o.surname },
      { key: 'sex', label: 'Sex', a: sexLabel[k.sex], b: sexLabel[o.sex] },
      { key: 'living', label: 'Living or deceased', a: k.living ? 'Living' : 'Deceased', b: o.living ? 'Living' : 'Deceased' },
    ] as const
  ).filter((f) => f.a !== f.b);

  return (
    <ModalFrame label="Merge two records into one profile" onClose={close} width={860}>
      <h2 className="h2">Is this the same person?</h2>
      <p className="muted" style={{ margin: 0 }}>
        Merging makes one profile. Every fact, source, photo and family link from both records is kept, and matching facts are combined. A backup is made first.
      </p>
      <div className="merge-cols">
        {[keep, other].map((id, i) => (
          <section key={id} className={'card merge-col' + (i === 0 ? ' keep' : '')} aria-label={i === 0 ? 'Record to keep' : 'Record to merge in'}>
            <span className={'badge ' + (i === 0 ? 'wall' : 'hint')} style={{ alignSelf: 'flex-start' }}>
              {i === 0 ? 'Keep this profile' : 'Merge into it'}
            </span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Avatar pid={id} size="lg" />
              <div style={{ minWidth: 0 }}>
                <div className="h3">{T.nm(id)}</div>
                <div className="muted strong">{T.years(id) || 'No dates'}</div>
                {T.person[id].accountEmail && <span className="chip gold">Has an account</span>}
              </div>
            </div>
            <Summary T={T} pid={id} />
          </section>
        ))}
      </div>
      <button className="btn sm ghost" style={{ alignSelf: 'center' }} onClick={() => setIds([other, keep])}>
        ⇄ Keep the other profile instead
      </button>

      {fields.length > 0 && !problem && (
        <fieldset className="merge-choices">
          <legend className="h3">These details are different. Which should the profile use?</legend>
          {fields.map((f) => {
            const cur = choice[f.key] || (f.key === 'sex' ? (k.sex === 'U' ? 'other' : 'keep') : f.key === 'living' ? 'keep' : f.a ? 'keep' : 'other');
            return (
              <div key={f.key} className="merge-choice" role="radiogroup" aria-label={f.label}>
                <span className="strong">{f.label}</span>
                {(['keep', 'other'] as const).map((side) => (
                  <label key={side} className="ck">
                    <input type="radio" name={'mc-' + f.key} checked={cur === side} onChange={() => setChoice({ ...choice, [f.key]: side })} />
                    {(side === 'keep' ? f.a : f.b) || <span className="muted">(blank)</span>}
                  </label>
                ))}
              </div>
            );
          })}
        </fieldset>
      )}

      {problem && (
        <div className="privacy-note" role="alert" style={{ color: 'var(--bad)' }}>
          <Icon name="lock" />
          <span>{problem}</span>
        </div>
      )}

      <div className="mfoot">
        <button
          className="btn ghost"
          style={{ marginRight: 'auto' }}
          onClick={async () => {
            await markNotDuplicate(keep, other);
            close();
          }}
        >
          They’re different people
        </button>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!!problem || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await mergePeople(keep, other, choice);
            setBusy(false);
            if (ok) {
              close();
              openProfile(keep);
            }
          }}
        >
          {busy ? 'Merging…' : 'Merge into one profile'}
        </button>
      </div>
    </ModalFrame>
  );
}

/** Research → Possible duplicates. */
export function DuplicatesList() {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const pairs = useMemo(() => findDuplicatePeople(data), [data]);
  if (!pairs.length)
    return <div className="empty">No possible duplicates found. When the same person is entered twice, they’ll show here so you can merge them into one profile.</div>;
  return (
    <div className="list" style={{ gap: 10 }}>
      <p className="muted" style={{ margin: 0 }}>
        Each person should have one profile. These records look like the same person entered twice.
      </p>
      {pairs.map((d: DuplicatePair) => (
        <div key={d.a + d.b} className="card dupe-row">
          <div className="dupe-people">
            {[d.a, d.b].map((id) => (
              <button key={id} className="li" onClick={() => openProfile(id)}>
                <Avatar pid={id} size="sm" />
                <span>
                  <span className="li-t">{T.nm(id)}</span>
                  <span className="li-s">{T.years(id) || 'No dates'}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="dupe-why">
            <span className="strong">{likelihood(d.score)}</span>
            <span className="small muted">{d.reasons.join(' · ')}</span>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => markNotDuplicate(d.a, d.b)}>
              Different people
            </button>
            <button className="btn sm primary" onClick={() => setUi({ modal: { kind: 'merge', keep: keepFirst(T, d), other: keepFirst(T, d) === d.a ? d.b : d.a } })}>
              Compare and merge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Suggest keeping the record with more in it (or the account holder). */
function keepFirst(T: TreeApi, d: DuplicatePair) {
  const weight = (id: string) => (T.person[id].accountEmail ? 1000 : 0) + T.factsOf(id).length * 3 + T.mediaOf(id).length + T.parents(id).length + T.children(id).length;
  return weight(d.b) > weight(d.a) ? d.b : d.a;
}

export function useDuplicateCount() {
  const data = useData((s) => s.data);
  return useMemo(() => findDuplicatePeople(data).length, [data]);
}
