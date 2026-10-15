import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../data/store';
import { toast } from '../../data/ui';
import { addRelModal, openPerson } from '../../data/actions';
import { treeApi, type TreeApi } from '../../lib/family';
import { descendantChart, fanChart, pedigreeChart, type ColourMode } from '../../lib/charts';
import { Seg, Switch } from '../../components/ui';
import { FamilyBook, bookPages, type BookOptions } from './FamilyBook';

type ChartKind = 'pedigree' | 'fan' | 'descendant' | 'book';

export function Charts() {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const defaultRoot = data.settings.home_person && T.person[data.settings.home_person] ? data.settings.home_person : data.people.find((p) => p.living)?.id || T.rootId;
  const [chart, setChart] = useState<ChartKind>('fan');
  const [rootSel, setRoot] = useState(defaultRoot);
  const [gens, setGens] = useState(5);
  const [colour, setColour] = useState<ColourMode>('branch');
  const [photos, setPhotos] = useState(true);
  const [fanFull, setFanFull] = useState(false);
  const [printing, setPrinting] = useState<null | 'chart' | 'book'>(null);
  const [book, setBook] = useState<BookOptions>(() => ({
    people: Object.fromEntries(data.people.filter((p) => !p.living).slice(0, 12).map((p) => [p.id, true])),
    sec: { title: true, groups: true, fan: true, timeline: true, photos: true, sources: true, index: true },
  }));
  const root = T.person[rootSel] ? rootSel : defaultRoot;

  const print = (what: 'chart' | 'book') => {
    setPrinting(what);
    // Give the print layout a moment to render, then open the system print dialog (choose "Save as PDF").
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 500);
    }, 300);
  };

  if (!data.people.length)
    return (
      <div className="view">
        <div className="page">
          <h1 className="h1">Charts and Reports</h1>
          <div className="empty">Add people to your tree to draw charts.</div>
        </div>
      </div>
    );

  const legend =
    colour === 'branch'
      ? T.branches().slice(0, 8).map((b) => [b.label, b.colour] as const)
      : ([
          ['Paternal side', '#2F6FA8'],
          ['Maternal side', '#C47A12'],
        ] as const);
  const pages = bookPages(T, book, root);

  return (
    <div className="view">
      <div className="chartwrap">
        <div className="chartside">
          <h1 className="h2">Charts and Reports</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(
              [
                ['pedigree', 'Pedigree'],
                ['fan', 'Fan chart'],
                ['descendant', 'Descendants'],
                ['book', 'Family history book'],
              ] as [ChartKind, string][]
            ).map(([k, l]) => (
              <button key={k} className={'nav' + (chart === k ? ' on' : '')} onClick={() => setChart(k)} aria-pressed={chart === k}>
                {l}
              </button>
            ))}
          </div>
          <div className="dd-sep" />
          {chart !== 'book' ? (
            <>
              <label className="fl">
                Root person
                <select value={root} onChange={(e) => setRoot(e.target.value)}>
                  {T.peopleSorted().map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.surname}, {p.given}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fl">
                Generations
                <select value={gens} onChange={(e) => setGens(+e.target.value)}>
                  {[3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} generations
                    </option>
                  ))}
                </select>
              </label>
              <div className="fl">
                Colour
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(
                    [
                      ['branch', 'By family branch'],
                      ['line', 'By line (paternal / maternal)'],
                    ] as [ColourMode, string][]
                  ).map(([k, l]) => (
                    <button key={k} className={'chip' + (colour === k ? ' on' : '')} onClick={() => setColour(k)} style={{ minHeight: 36, justifyContent: 'flex-start' }} aria-pressed={colour === k}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {chart === 'fan' && (
                <div className="fl">
                  Fan style
                  <Seg label="Fan style" value={fanFull ? 'full' : 'semi'} onChange={(k) => setFanFull(k === 'full')} options={[['semi', 'Semi-circle'], ['full', 'Full circle']]} />
                </div>
              )}
              {chart !== 'descendant' && (
                <div className="toggle">
                  <span style={{ flex: 1 }} className="strong">
                    Show photos
                  </span>
                  <Switch on={photos} onToggle={() => setPhotos(!photos)} label="Show photos" />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="fl">Key</span>
                {legend.map(([l, c]) => (
                  <span key={l} className="small">
                    <span className="bdot" style={{ background: c }} />
                    {l}
                  </span>
                ))}
              </div>
              <button className="btn" onClick={() => print('chart')}>
                Print or save chart
              </button>
            </>
          ) : (
            <>
              <div className="fl">Sections</div>
              <div className="checklist">
                {(
                  [
                    ['title', 'Title page'],
                    ['groups', 'Family group sheets'],
                    ['fan', 'Fan chart'],
                    ['timeline', 'Timeline'],
                    ['photos', 'Photo pages'],
                    ['sources', 'Sources and citations'],
                    ['index', 'Index of names'],
                  ] as [keyof BookOptions['sec'], string][]
                ).map(([k, l]) => (
                  <label key={k} className="ck">
                    <input type="checkbox" checked={book.sec[k]} onChange={() => setBook({ ...book, sec: { ...book.sec, [k]: !book.sec[k] } })} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="fl">People (family group sheets)</div>
              <div className="checklist">
                {T.peopleSorted()
                  .filter((p) => !p.living)
                  .map((p) => (
                    <label key={p.id} className="ck">
                      <input type="checkbox" checked={!!book.people[p.id]} onChange={() => setBook({ ...book, people: { ...book.people, [p.id]: !book.people[p.id] } })} />
                      {T.nm(p.id)}
                    </label>
                  ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Living people are left out of the book.
              </p>
              <button className="btn primary" onClick={() => print('book')}>
                Export PDF · {pages.length} pages
              </button>
            </>
          )}
        </div>
        <div className="chartarea">
          {chart === 'fan' && (
            <div className="chartpaper">
              <FanSvg T={T} root={root} gens={gens} colour={colour} full={fanFull} photos={photos} interactive />
            </div>
          )}
          {chart === 'pedigree' && (
            <div className="chartpaper">
              <PedigreeSvg T={T} root={root} gens={gens} colour={colour} photos={photos} interactive />
            </div>
          )}
          {chart === 'descendant' && (
            <div className="chartpaper">
              <DescSvg T={T} root={root} gens={gens} colour={colour} interactive />
            </div>
          )}
          {chart === 'book' && <FamilyBook T={T} opts={book} root={root} preview />}
        </div>
      </div>
      {printing &&
        createPortal(
          <div className="printroot">
            {printing === 'book' ? (
              <FamilyBook T={T} opts={book} root={root} />
            ) : (
              <div className="printpage landscape">
                <h1 className="ph1">
                  {chart === 'fan' ? 'Fan chart' : chart === 'pedigree' ? 'Pedigree chart' : 'Descendants'} — {T.nm(root)}
                </h1>
                {chart === 'fan' && <FanSvg T={T} root={root} gens={gens} colour={colour} full={fanFull} photos={photos} />}
                {chart === 'pedigree' && <PedigreeSvg T={T} root={root} gens={gens} colour={colour} photos={photos} />}
                {chart === 'descendant' && <DescSvg T={T} root={root} gens={gens} colour={colour} />}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

type SvgProps = { T: TreeApi; root: string; gens: number; colour: ColourMode; interactive?: boolean };

export function FanSvg({ T, root, gens, colour, full, photos, interactive, hideLiving }: SvgProps & { full: boolean; photos: boolean; hideLiving?: boolean }) {
  const hidden = (id?: string) => !!(hideLiving && id && T.person[id]?.living);
  const fan = useMemo(() => fanChart(T, root, gens, colour, full), [T, root, gens, colour, full]);
  const p = T.person[root];
  const ry = full ? -34 : -fan.r0 + 12;
  return (
    <svg viewBox={fan.vb} role={interactive ? 'group' : 'img'} aria-label={`Fan chart of ${T.nm(root)}’s ancestors`}>
      {fan.segs.map((s, i) => (
        <g
          key={i}
          onClick={interactive ? () => (s.pid ? openPerson(s.pid) : s.childOf && addRelModal(s.childOf, 'parent')) : undefined}
          role={interactive ? 'button' : undefined}
          aria-label={s.pid ? T.nm(s.pid) : 'Add parent'}
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={interactive ? (e) => e.key === 'Enter' && (s.pid ? openPerson(s.pid) : s.childOf && addRelModal(s.childOf, 'parent')) : undefined}
        >
          <path className={s.empty ? 'fan-empty' : 'fanseg'} d={s.d} fill={s.fill} />
          <g transform={s.tf}>
            <text className={s.empty ? 'ftx e' : 'ftx n'} y={s.y1} style={{ fontSize: s.fs }}>
              {hidden(s.pid) ? 'Living' : s.l1}
            </text>
            {s.l2 && !hidden(s.pid) && (
              <text className="ftx" y={s.y2} style={{ fontSize: s.fs - 2 }}>
                {s.l2}
              </text>
            )}
          </g>
        </g>
      ))}
      <g onClick={interactive ? () => openPerson(root) : undefined} role={interactive ? 'button' : undefined} aria-label={T.nm(root)} style={{ cursor: interactive ? 'pointer' : undefined }}>
        {full ? <circle cx={0} cy={0} r={fan.r0} fill="#1F4D3A" /> : <path d={fan.rootPath} fill="#1F4D3A" />}
        {photos && p && (p.avatar || p.photoMediaId) && (
          <>
            <circle cx={0} cy={ry} r={18} fill="#B99C72" stroke="#FFFDF8" strokeWidth={2} />
            <circle cx={0} cy={ry} r={7} fill="#6E5438" />
          </>
        )}
        <text className="ftx n" x={0} y={full ? 34 : -14} style={{ fontSize: 14, fill: '#FFFDF8' }}>
          {hidden(root) ? 'Living' : T.short(root)}
        </text>
        <text className="ftx" x={0} y={full ? 52 : 4} style={{ fontSize: 12, fill: '#E2EBE3' }}>
          {hidden(root) ? '' : T.years(root)}
        </text>
      </g>
    </svg>
  );
}

export function PedigreeSvg({ T, root, gens, colour, photos, interactive }: SvgProps & { photos: boolean }) {
  const ped = useMemo(() => pedigreeChart(T, root, gens, colour, photos), [T, root, gens, colour, photos]);
  return (
    <svg viewBox={ped.vb} role={interactive ? 'group' : 'img'} aria-label={`Pedigree chart of ${T.nm(root)}`}>
      {ped.lines.map((d, i) => (
        <path key={i} className="pline" d={d} />
      ))}
      {ped.boxes.map((b, i) => {
        const go = () => (b.pid ? openPerson(b.pid) : b.childOf && addRelModal(b.childOf, 'parent'));
        const tx = b.x + (b.showPhoto ? 54 : 14);
        const ty = b.y + (b.h >= 40 ? b.h / 2 - 3 : b.h / 2 + 5);
        return (
          <g key={i} onClick={interactive ? go : undefined} role={interactive ? 'button' : undefined} aria-label={b.pid ? T.nm(b.pid) : b.name} className={b.pid ? 'pbox' : 'pbox pe'}>
            <rect className="b" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill={b.fill} />
            {b.pid && <rect x={b.x} y={b.y} width={6} height={b.h} rx={3} fill={b.stripe} />}
            {b.showPhoto && b.pid && (
              <>
                <circle cx={b.x + 28} cy={b.y + b.h / 2} r={16} fill={T.person[b.pid].avatar || T.person[b.pid].photoMediaId ? '#A88A62' : '#D9CFBB'} />
                <text className="ptx" x={b.x + 28} y={b.y + b.h / 2} dy={4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700 }}>
                  {T.ini(b.pid)}
                </text>
              </>
            )}
            <text className="ptx" x={tx} y={ty} style={{ fontSize: b.pid ? 14 : 13, fontWeight: b.pid ? 700 : 400, fill: b.pid ? undefined : '#6A6458' }}>
              {b.pid ? b.name : '+ ' + b.name}
            </text>
            {b.years && (
              <text className="ptx" x={tx} y={b.y + b.h / 2 + 15} style={{ fontSize: 12 }}>
                {b.years}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DescSvg({ T, root, gens, colour, interactive }: SvgProps) {
  const desc = useMemo(() => descendantChart(T, root, gens, colour), [T, root, gens, colour]);
  return (
    <svg viewBox={desc.vb} role={interactive ? 'group' : 'img'} aria-label={`Descendants of ${T.nm(root)}`}>
      {desc.lines.map((d, i) => (
        <path key={i} className="pline" d={d} />
      ))}
      {desc.boxes.map((b) => (
        <g key={b.pid + b.x} className="pbox" onClick={interactive ? () => openPerson(b.pid) : undefined} role={interactive ? 'button' : undefined} aria-label={T.nm(b.pid)}>
          <rect className="b" x={b.x} y={b.y} width={150} height={50} rx={8} fill={b.fill} />
          <rect x={b.x} y={b.y} width={150} height={5} rx={2} fill={b.stripe} />
          <text className="ptx" x={b.x + 12} y={b.y + 21} style={{ fontSize: 13, fontWeight: 700 }}>
            {b.name}
          </text>
          <text className="ptx" x={b.x + 12} y={b.y + 38} style={{ fontSize: 11.5 }}>
            {b.years}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function printNotSupported() {
  toast('Printing isn’t available here');
}
