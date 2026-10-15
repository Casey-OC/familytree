// The family history book: real pages printed to PDF through the system print dialog.

import type { ReactNode } from 'react';
import type { TreeApi } from '../../lib/family';
import { dateLabel, formatDay } from '../../lib/dates';
import { mediaUrl } from '../../data/platform';
import { FanSvg } from './Charts';

export interface BookOptions {
  people: Record<string, boolean>;
  sec: { title: boolean; groups: boolean; fan: boolean; timeline: boolean; photos: boolean; sources: boolean; index: boolean };
}

interface Page {
  k: string;
  t: string;
  img: boolean;
  lines: number;
  body: () => ReactNode;
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export function bookPages(T: TreeApi, o: BookOptions, root: string): Page[] {
  const d = T.data;
  const deceased = (id: string) => T.person[id] && !T.person[id].living;
  const chosen = T.peopleSorted().filter((p) => o.people[p.id] && !p.living);
  const pages: Page[] = [];
  const title = d.settings.tree_name || 'Our Family';
  const sub = d.settings.subtitle || '';
  if (o.sec.title)
    pages.push({
      k: 'Title page',
      t: sub || title,
      img: true,
      lines: 1,
      body: () => (
        <div className="bk-title">
          <div className="bk-band" />
          <h1>{sub || title}</h1>
          {sub && <h2>{title}</h2>}
          <p>Compiled {formatDay(new Date())}</p>
          <p className="bk-muted">{d.people.filter((p) => !p.living).length} people · {d.sources.length} sources</p>
        </div>
      ),
    });
  const contentsAt = pages.length;
  pages.push({ k: 'Contents', t: 'Contents', img: false, lines: 6, body: () => null });
  const groupPageOf: Record<string, number> = {};
  if (o.sec.groups)
    for (const p of chosen) {
      groupPageOf[p.id] = pages.length + 1;
      pages.push({
        k: 'Family group sheet',
        t: T.nm(p.id),
        img: !!(p.avatar || p.photoMediaId),
        lines: 4,
        body: () => {
          const parents = T.parents(p.id);
          const kids = T.children(p.id);
          return (
            <div>
              <h1 className="bk-h">{T.nm(p.id)}</h1>
              <p className="bk-muted">{T.years(p.id)}</p>
              <table className="bk-table">
                <tbody>
                  {T.factsOf(p.id).map((f) => (
                    <tr key={f.id}>
                      <th>{f.type}</th>
                      <td>{dateLabel(f)}</td>
                      <td>{T.placeName(f.placeId)}</td>
                      <td>{f.desc}</td>
                      <td className="bk-conf">{T.conf(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parents.length > 0 && (
                <p>
                  <b>Parents:</b> {parents.map((x) => T.nm(x) + ' (' + T.years(x) + ')').join('; ')}
                </p>
              )}
              {T.spouses(p.id).map((s) => (
                <p key={s}>
                  <b>Spouse:</b> {deceased(s) ? T.nm(s) + ' (' + T.years(s) + ')' : 'Living (private)'}
                </p>
              ))}
              {kids.length > 0 && (
                <>
                  <p>
                    <b>Children</b>
                  </p>
                  <ol>
                    {kids.map((k) => (
                      <li key={k}>{deceased(k) ? `${T.nm(k)} (${T.years(k)})` : 'Living (private)'}</li>
                    ))}
                  </ol>
                </>
              )}
              {p.notes && <p className="bk-note">{p.notes}</p>}
            </div>
          );
        },
      });
    }
  if (o.sec.fan)
    pages.push({
      k: 'Chart',
      t: 'Fan chart — ' + T.short(root),
      img: true,
      lines: 1,
      body: () => (
        <div>
          <h1 className="bk-h">Ancestors of {T.person[root]?.living ? 'the family' : T.nm(root)}</h1>
          <FanSvg T={T} root={root} gens={5} colour="branch" full={false} photos={false} hideLiving />
        </div>
      ),
    });
  if (o.sec.timeline) {
    const seenMarriage = new Set<string>();
    const evs = d.facts
      .filter((f) => deceased(f.personId) && f.sortYear)
      .sort((a, b) => (a.sortYear || 0) - (b.sortYear || 0))
      .filter((f) => {
        if (f.type !== 'Marriage') return true;
        const key = [f.date, f.placeId, ...[f.personId, ...T.spouses(f.personId).filter((s) => T.ff(s, 'Marriage')?.date === f.date)].sort()].join('|');
        if (seenMarriage.has(key)) return false;
        seenMarriage.add(key);
        return true;
      });
    const years = evs.length ? `${evs[0].sortYear}–${evs[evs.length - 1].sortYear}` : '';
    chunk(evs, 34).forEach((part, i) =>
      pages.push({
        k: 'Timeline',
        t: `Family timeline ${years}${i ? ' (cont.)' : ''}`,
        img: false,
        lines: 7,
        body: () => (
          <div>
            <h1 className="bk-h">Family timeline{i ? ' (continued)' : ''}</h1>
            <table className="bk-table">
              <tbody>
                {part.map((f) => (
                  <tr key={f.id}>
                    <th>{dateLabel(f)}</th>
                    <td>
                      {f.type} — {T.nm(f.personId)}
                    </td>
                    <td>{T.placeName(f.placeId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      }),
    );
  }
  if (o.sec.photos) {
    const photos = d.media.filter((m) => m.kind === 'photo' && (m.file || m.scene) && !m.faces.some((f) => T.person[f.personId]?.living));
    chunk(photos, 6).forEach((part, i) =>
      pages.push({
        k: 'Photo pages',
        t: 'Photographs' + (i ? ' (cont.)' : ''),
        img: true,
        lines: 2,
        body: () => (
          <div>
            <h1 className="bk-h">Photographs{i ? ' (continued)' : ''}</h1>
            <div className="bk-photos">
              {part.map((m) => (
                <figure key={m.id}>
                  {m.file ? <img src={mediaUrl(m.thumb || m.file)} alt="" /> : <div className={'scene ' + m.scene} />}
                  <figcaption>
                    {m.title}
                    {m.date ? `, ${m.date}` : ''}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ),
      }),
    );
  }
  if (o.sec.sources) {
    const srcs = d.sources.slice().sort((a, b) => a.title.localeCompare(b.title));
    chunk(srcs, 22).forEach((part, i) =>
      pages.push({
        k: 'Bibliography',
        t: 'Sources and citations' + (i ? ' (cont.)' : ''),
        img: false,
        lines: 8,
        body: () => (
          <div>
            <h1 className="bk-h">Sources and citations{i ? ' (continued)' : ''}</h1>
            <ol className="bk-src" start={i * 22 + 1}>
              {part.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>. {s.type}
                  {s.repo ? `. ${s.repo}` : ''}. {d.cites.filter((c) => c.sourceId === s.id).length} citations.
                </li>
              ))}
            </ol>
          </div>
        ),
      }),
    );
  }
  if (o.sec.index) {
    const names = T.peopleSorted().filter((p) => !p.living);
    chunk(names, 60).forEach((part, i) =>
      pages.push({
        k: 'Index',
        t: 'Index of names' + (i ? ' (cont.)' : ''),
        img: false,
        lines: 8,
        body: () => (
          <div>
            <h1 className="bk-h">Index of names{i ? ' (continued)' : ''}</h1>
            <div className="bk-index">
              {part.map((p) => (
                <div key={p.id}>
                  {p.surname}, {p.given} <span className="bk-muted">{T.years(p.id)}</span>
                  {groupPageOf[p.id] ? <span> · p. {groupPageOf[p.id]}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ),
      }),
    );
  }
  const toc = pages.map((p, i) => ({ k: p.k, t: p.t, n: i + 1 })).filter((x) => x.k !== 'Contents' && x.k !== 'Title page');
  pages[contentsAt].body = () => (
    <div>
      <h1 className="bk-h">Contents</h1>
      <table className="bk-table">
        <tbody>
          {toc.map((x) => (
            <tr key={x.n}>
              <td>{x.t}</td>
              <td className="bk-muted">{x.k}</td>
              <td style={{ textAlign: 'right' }}>{x.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return pages;
}

export function FamilyBook({ T, opts, root, preview }: { T: TreeApi; opts: BookOptions; root: string; preview?: boolean }) {
  const pages = bookPages(T, opts, root);
  if (preview)
    return (
      <div className="bookgrid">
        {pages.map((p, i) => (
          <div key={i}>
            <div className="bpage">
              <span className="small" style={{ color: '#6A6458' }}>
                {p.k}
              </span>
              <span className="bt">{p.t}</span>
              {p.img && <span className="bimg" />}
              {Array.from({ length: p.lines }, (_, j) => (
                <span key={j} className="bl" />
              ))}
            </div>
            <div className="bnum">Page {i + 1}</div>
          </div>
        ))}
      </div>
    );
  return (
    <>
      {pages.map((p, i) => (
        <section key={i} className="printpage">
          {p.body()}
          <footer>
            {T.data.settings.tree_name || 'Family history'} · page {i + 1}
          </footer>
        </section>
      ))}
    </>
  );
}
