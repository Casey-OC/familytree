import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { addRelModal, centreOn, openPerson } from '../../data/actions';
import { treeApi } from '../../lib/family';
import { layDesc, layPed, type Layout } from '../../lib/layout';
import { Avatar, Icon, Seg } from '../../components/ui';

const MIN_K = 0.2;
const MAX_K = 1.6;

export function TreeView() {
  const data = useData((s) => s.data);
  const compact = useData((s) => s.prefs.compact);
  const view = useUi((s) => s.treeView);
  const focus = useUi((s) => s.focus);
  const tz = useUi((s) => s.tz);
  const smooth = useUi((s) => s.smooth);
  const collapsed = useUi((s) => s.collapsed);
  const ctx = useUi((s) => s.ctx);
  const panel = useUi((s) => s.panel);
  const centreRequest = useUi((s) => s.centreRequest);
  const fitRequest = useUi((s) => s.fitRequest);
  const T = treeApi(data);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const drag = useRef<{ mx: number; my: number; x: number; y: number; moved: boolean; id: number } | null>(null);
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const focusId = focus && T.person[focus] ? focus : T.rootId;
  const dims = compact ? { w: 200, h: 76 } : { w: 228, h: 96 };
  const lay: Layout = useMemo(() => {
    if (view === 'pedigree') return layPed(T, focusId, 4, dims);
    if (view === 'descendants') return layDesc(T, focusId, 6, dims, { collapsed });
    return layDesc(T, T.rootId, 6, dims, { collapsed });
  }, [data, view, focusId, collapsed, compact]);

  // Track the canvas size.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const centreTo = (pid: string, k = tz.k) => {
    const n = lay.nodes.find((x) => x.pid === pid) || lay.nodes[0];
    if (!n) return;
    setUi({ tz: { x: size.w / 2 - (n.x + lay.CW / 2) * k, y: size.h * 0.32 - (n.y + lay.CH / 2) * k, k }, smooth: true });
  };
  const fit = () => {
    const k = Math.max(MIN_K, Math.min(1, (size.w - 40) / lay.w, (size.h - 20) / lay.h));
    setUi({ tz: { x: (size.w - lay.w * k) / 2, y: Math.max(10, (size.h - lay.h * k) / 2), k }, smooth: true });
  };

  // Requests from elsewhere ("Show in tree", menu "Fit").
  const handled = useRef(0);
  useEffect(() => {
    if (!centreRequest || centreRequest.n === handled.current || size.w < 50 || !lay.nodes.length) return;
    handled.current = centreRequest.n;
    centreTo(centreRequest.pid || focusId);
  }, [centreRequest?.n, lay, size.w]);
  useEffect(() => {
    if (fitRequest) fit();
  }, [fitRequest]);
  // First visit: fit small trees, otherwise centre the root.
  const did = useRef(false);
  useEffect(() => {
    if (did.current || size.w < 50 || !lay.nodes.length) return;
    did.current = true;
    if (!centreRequest) {
      if (lay.w * 0.55 < size.w && lay.h * 0.55 < size.h) fit();
      else centreTo(view === 'family' ? T.rootId : focusId, 0.55);
    }
  }, [size.w, lay]);

  const zoomBy = (f: number, cx = size.w / 2, cy = size.h / 2) => {
    const k = Math.min(MAX_K, Math.max(MIN_K, tz.k * f));
    setUi({ tz: { x: cx - ((cx - tz.x) * k) / tz.k, y: cy - ((cy - tz.y) * k) / tz.k, k }, smooth: true });
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const k = Math.min(MAX_K, Math.max(MIN_K, tz.k * (e.deltaY > 0 ? 0.9 : 1.1)));
      setUi({ tz: { x: mx - ((mx - tz.x) * k) / tz.k, y: my - ((my - tz.y) * k) / tz.k, k }, smooth: false });
    } else setUi({ tz: { ...tz, x: tz.x - e.deltaX }, smooth: false });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: tz.k };
      drag.current = null;
      return;
    }
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button,.ctxmenu,select')) {
      drag.current = null;
      return;
    }
    drag.current = { mx: e.clientX, my: e.clientY, x: tz.x, y: tz.y, moved: false, id: e.pointerId };
    if (ctx) setUi({ ctx: null });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = canvasRef.current!.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - r.left;
      const cy = (a.y + b.y) / 2 - r.top;
      const k = Math.min(MAX_K, Math.max(MIN_K, (pinch.current.k * d) / pinch.current.d));
      setUi({ tz: { x: cx - ((cx - tz.x) * k) / tz.k, y: cy - ((cy - tz.y) * k) / tz.k, k }, smooth: false });
      return;
    }
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.mx;
    const dy = e.clientY - g.my;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      if (!g.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      g.moved = true;
    }
    if (g.moved) setUi({ tz: { x: g.x + dx, y: g.y + dy, k: tz.k }, smooth: false });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = drag.current;
    setTimeout(() => {
      if (drag.current === g) drag.current = null;
    }, 0);
  };

  const openCtx = (pid: string, e: React.MouseEvent, fromBtn: boolean) => {
    const r = canvasRef.current!.getBoundingClientRect();
    let x: number;
    let y: number;
    if (fromBtn) {
      const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = b.left - r.left;
      y = b.bottom - r.top + 4;
    } else {
      x = e.clientX - r.left;
      y = e.clientY - r.top;
    }
    setUi({ ctx: { pid, x: Math.max(4, Math.min(x, size.w - 240)), y: Math.max(4, Math.min(y, size.h - 330)) } });
  };

  // Only draw cards that are on screen (keeps big imported trees fast).
  const vis = {
    x0: -tz.x / tz.k - lay.CW,
    y0: -tz.y / tz.k - lay.CH,
    x1: (size.w - tz.x) / tz.k + 20,
    y1: (size.h - tz.y) / tz.k + 20,
  };
  const shown = lay.nodes.filter((n) => n.x >= vis.x0 && n.x <= vis.x1 && n.y >= vis.y0 && n.y <= vis.y1);

  const people = T.peopleSorted();

  if (!data.people.length)
    return (
      <div className="view">
        <div className="empty-hero">
          <div className="empty">
            <span className="strong" style={{ color: 'var(--text)', fontSize: 18 }}>
              No one in this tree yet
            </span>
            <button className="btn primary" onClick={() => addRelModal('', 'none')}>
              Add the first person
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="view tree-view">
      <div className="toolbar">
        <Seg
          label="Tree view"
          value={view}
          options={[
            ['family', 'Family'],
            ['pedigree', 'Pedigree'],
            ['descendants', 'Descendants'],
          ]}
          onChange={(k) => {
            setUi({ treeView: k, ctx: null });
            setTimeout(() => centreOn(k === 'family' ? T.rootId : focusId), 0);
          }}
        />
        {view !== 'family' && (
          <label className="tb-field">
            Start from
            <select
              value={focusId}
              onChange={(e) => {
                setUi({ focus: e.target.value });
                setTimeout(() => centreOn(e.target.value), 0);
              }}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.surname}, {p.given}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="spacer" />
        <div className="legend" aria-label="Legend">
          <span className="badge unv">? Unverified</span>
          <span className="badge hint">Hint</span>
          <span className="badge liv">Living</span>
        </div>
        <div className="zoom">
          <button className="btn sm ghost" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
            <Icon name="minus" sm />
          </button>
          <span className="pct" aria-live="polite">
            {Math.round(tz.k * 100)}%
          </span>
          <button className="btn sm ghost" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
            <Icon name="plus" sm />
          </button>
          <button className="btn sm" onClick={fit}>
            Fit
          </button>
          <button className="btn sm" onClick={() => centreTo(panel?.kind === 'person' ? panel.id : view === 'family' ? T.rootId : focusId)}>
            Centre
          </button>
        </div>
      </div>
      <div
        ref={canvasRef}
        className="tree-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <div
          className={'tree-layer' + (smooth ? ' smooth' : '')}
          style={{ transform: `translate(${Math.round(tz.x)}px, ${Math.round(tz.y)}px) scale(${tz.k})`, width: lay.w, height: lay.h }}
        >
          <svg className="tree-lines" width={lay.w} height={lay.h} aria-hidden="true">
            {lay.lines.map((l, i) => (
              <path key={i} className={l.cls} d={l.d} />
            ))}
          </svg>
          {shown.map((n, i) => {
            if (n.empty)
              return (
                <button key={'e' + i} className="tcard ghost" style={{ left: n.x, top: n.y }} onClick={() => addRelModal(n.child!, 'parent')}>
                  <Icon name="plus" />
                  Add {n.role}
                </button>
              );
            const id = n.pid!;
            const p = T.person[id];
            const unv = T.unvCount(id);
            const hc = T.hintCount(id);
            return (
              <div
                key={id + '-' + i}
                className={'tcard' + (panel?.id === id ? ' sel' : '') + (p.living ? ' living' : '')}
                style={{ left: n.x, top: n.y }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCtx(id, e, false);
                }}
              >
                <button
                  className="tc-main"
                  onClick={() => {
                    if (drag.current?.moved) return;
                    openPerson(id);
                  }}
                  aria-label={`Open ${T.nm(id)}`}
                >
                  <Avatar pid={id} />
                  <span className="tc-text">
                    <span className="tc-name">{T.nm(id)}</span>
                    <span className="tc-years">{T.years(id)}</span>
                    <span className="tc-badges">
                      {unv > 0 && <span className="badge unv">? {unv} unverified</span>}
                      {hc > 0 && <span className="badge hint">{hc} hint</span>}
                      {p.living && <span className="badge liv">Living</span>}
                    </span>
                  </span>
                </button>
                <span className="sexmark" title={p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : p.sex === 'X' ? 'Other' : 'Sex unknown'}>
                  {p.sex === 'M' ? 'M' : p.sex === 'F' ? 'F' : p.sex === 'X' ? 'X' : '?'}
                </span>
                <button
                  className="tc-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCtx(id, e, true);
                  }}
                  aria-label={`More actions for ${T.nm(id)}`}
                >
                  <Icon name="more" sm />
                </button>
                {n.primary && (n.nk || 0) > 0 && view !== 'pedigree' && (
                  <button
                    className="tc-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUi((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } }));
                    }}
                    aria-label={n.open ? 'Collapse branch' : 'Expand branch'}
                    aria-expanded={n.open}
                  >
                    {n.open ? '–' : '+' + n.nk}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {ctx && T.person[ctx.pid] && (
          <div className="ctxmenu" role="menu" style={{ left: ctx.x, top: ctx.y }}>
            <div className="dd-label">{T.nm(ctx.pid)}</div>
            <button className="dd-item row" role="menuitem" onClick={() => openPerson(ctx.pid)}>
              Open profile
            </button>
            {(['parent', 'spouse', 'child', 'sibling'] as const).map((r) => (
              <button key={r} className="dd-item row" role="menuitem" onClick={() => addRelModal(ctx.pid, r)}>
                <Icon name="plus" sm />
                Add {r}
              </button>
            ))}
            <div className="dd-sep" />
            <button
              className="dd-item row"
              role="menuitem"
              onClick={() => {
                setUi({ ctx: null });
                centreTo(ctx.pid);
              }}
            >
              Centre here
            </button>
            <button
              className="dd-item row"
              role="menuitem"
              onClick={() => {
                setUi({ treeView: 'pedigree', focus: ctx.pid, ctx: null });
                setTimeout(() => centreOn(ctx.pid), 0);
              }}
            >
              Show ancestors (pedigree)
            </button>
            <button
              className="dd-item row"
              role="menuitem"
              onClick={() => {
                setUi({ treeView: 'descendants', focus: ctx.pid, ctx: null });
                setTimeout(() => centreOn(ctx.pid), 0);
              }}
            >
              Show descendants
            </button>
          </div>
        )}
        <div className="minihelp">Drag to pan · scroll to zoom · right-click a card or use “…” to add relatives</div>
      </div>
    </div>
  );
}
