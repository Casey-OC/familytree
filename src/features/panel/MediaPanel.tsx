import { useEffect, useRef, useState } from 'react';
import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { deleteMedia, linkMediaPerson, linkMediaSource, openPerson, openSource, removeFace, setProfilePhoto, tagFace, updateMedia } from '../../data/actions';
import { mediaUrl, openMediaExternally } from '../../data/platform';
import { treeApi } from '../../lib/family';
import { Icon, PlaceInput, fmtBytes, mmss } from '../../components/ui';

export function MediaPanel({ mid }: { mid: string }) {
  const data = useData((s) => s.data);
  const tagMode = useUi((s) => s.tagMode);
  const pf = useUi((s) => s.pendingFace);
  const T = treeApi(data);
  const m = T.media[mid];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: m.title, date: m.date, place: T.placeName(m.placeId), desc: m.desc });
  const people = [...new Set([...m.faces.map((x) => x.personId), ...m.people])].filter((id) => T.person[id]);
  const url = m.file ? mediaUrl(m.file) : '';
  const isImage = m.kind === 'photo' && !!url && !/heic$/i.test(m.file);
  const kindLabel = m.kind === 'photo' ? 'Photo' : m.kind === 'document' ? 'Document' : 'Audio clip';
  const sorted = T.peopleSorted();

  const onImgClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tagMode) return;
    if ((e.target as HTMLElement).closest('.face')) return;
    const r = e.currentTarget.getBoundingClientRect();
    setUi({ pendingFace: { x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) } });
  };

  const faceLayer = (
    <>
      {m.faces.map((f, i) => (
        <span key={i} className="face" style={{ left: f.x + '%', top: f.y + '%' }}>
          <span className="fn">
            <button style={{ color: 'inherit', font: 'inherit' }} onClick={() => !tagMode && openPerson(f.personId)}>
              {T.short(f.personId)}
            </button>
          </span>
          <button className="fx" aria-label={`Remove tag ${T.short(f.personId)}`} onClick={() => removeFace(mid, i)}>
            ×
          </button>
        </span>
      ))}
      {pf && <span className="face pending" style={{ left: pf.x + '%', top: pf.y + '%' }} />}
    </>
  );

  return (
    <div className="pbody">
      <div>
        <span className="chip">{kindLabel}</span>
        <h2 className="pname" style={{ marginTop: 8 }}>
          {m.title}
        </h2>
        <div className="muted">{[m.date, T.placeName(m.placeId)].filter(Boolean).join(' · ') || 'No date or place yet'}</div>
      </div>

      {m.kind === 'photo' && isImage && (
        <div className={'mediabox' + (tagMode ? ' tagging' : '')} onClick={onImgClick} role="img" aria-label={m.title}>
          <img src={url} alt={m.title} draggable={false} />
          {faceLayer}
        </div>
      )}
      {m.kind === 'photo' && !isImage && m.scene && (
        <div className={'scene ' + m.scene + (tagMode ? ' tagging' : '')} style={{ borderRadius: 12 }} onClick={onImgClick} role="img" aria-label={m.title}>
          {faceLayer}
        </div>
      )}
      {m.kind === 'photo' && !isImage && !m.scene && <div className="thumbmissing">{m.file ? 'This image type can’t be previewed here — open it to view.' : 'File not included in the import.'}</div>}
      {m.kind === 'document' &&
        (url && (m.mime === 'application/pdf' || /\.pdf$/i.test(m.file)) ? (
          <iframe className="docframe" src={url} title={m.title} />
        ) : (
          <div className="scene doc" style={{ borderRadius: 12 }} role="img" aria-label={m.title} />
        ))}
      {m.kind === 'audio' && (url ? <audio className="native" controls src={url} preload="metadata" /> : <SamplePlayer duration={m.duration} />)}
      {m.file && (
        <div className="row small muted">
          <span className="grow">
            {m.originalName} · {fmtBytes(m.sizeBytes)}
          </span>
          <button className="btn sm ghost" onClick={() => openMediaExternally(m.file)}>
            <Icon name="external" sm />
            Open file
          </button>
        </div>
      )}

      {m.kind === 'photo' && (isImage || m.scene) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn sm gold" onClick={() => setUi({ tagMode: !tagMode, pendingFace: null })}>
            {tagMode ? 'Done tagging' : 'Tag faces'}
          </button>
          <span className="small muted">{tagMode ? (pf ? 'Choose who this is.' : 'Click a face in the photo to tag it.') : ''}</span>
        </div>
      )}
      {pf && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value=""
            autoFocus
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              tagFace(mid, id, pf.x, pf.y);
              setUi({ pendingFace: null });
            }}
            aria-label="Who is this?"
            style={{ flex: 1 }}
          >
            <option value="">Who is this?</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.surname}, {p.given}
              </option>
            ))}
          </select>
          <button className="btn sm" onClick={() => setUi({ pendingFace: null })}>
            Cancel
          </button>
        </div>
      )}

      {editing ? (
        <div className="form">
          <label className="fl">
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <div className="frow">
            <label className="fl">
              Date
              <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="e.g. 1955" />
            </label>
            <label className="fl">
              Place
              <PlaceInput value={draft.place} onChange={(v) => setDraft({ ...draft, place: v })} />
            </label>
          </div>
          <label className="fl">
            Description
            <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
          </label>
          <div className="row">
            <button
              className="btn primary"
              onClick={async () => {
                await updateMedia(mid, draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <p style={{ margin: 0 }} className="grow">
            {m.desc || <span className="muted">No description yet</span>}
          </p>
          <button
            className="btn sm ghost"
            onClick={() => {
              setDraft({ title: m.title, date: m.date, place: T.placeName(m.placeId), desc: m.desc });
              setEditing(true);
            }}
          >
            <Icon name="edit" sm />
            Edit
          </button>
        </div>
      )}

      <div>
        <div className="fl" style={{ marginBottom: 6 }}>
          In this item
        </div>
        <div className="chips">
          {people.map((id) => (
            <span key={id} className="chip person" style={{ paddingRight: 4 }}>
              <button onClick={() => openPerson(id)}>{T.short(id)}</button>
              {m.kind === 'photo' && m.file && T.person[id].photoMediaId !== mid && (
                <button className="linkbtn" style={{ fontSize: 12, padding: '0 6px' }} onClick={() => setProfilePhoto(id, mid)} title="Use as profile photo">
                  ★ profile
                </button>
              )}
              {m.people.includes(id) && (
                <button aria-label={`Unlink ${T.short(id)}`} onClick={() => linkMediaPerson(mid, id, false)} style={{ padding: '0 4px' }}>
                  ×
                </button>
              )}
            </span>
          ))}
          {!people.length && <span className="small muted">No one tagged yet.</span>}
        </div>
        <select value="" onChange={(e) => e.target.value && linkMediaPerson(mid, e.target.value, true)} aria-label="Link a person" style={{ width: '100%', marginTop: 6 }}>
          <option value="">Link a person (without a face tag)…</option>
          {sorted
            .filter((p) => !people.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.surname}, {p.given}
              </option>
            ))}
        </select>
      </div>
      <div>
        <div className="fl" style={{ marginBottom: 6 }}>
          Linked sources
        </div>
        <div className="list">
          {m.sourceIds
            .filter((s) => T.source[s])
            .map((s) => (
              <div key={s} className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="li grow" onClick={() => openSource(s)}>
                  <span className="li-t">{T.source[s].title}</span>
                </button>
                <button className="xbtn" aria-label="Unlink source" onClick={() => linkMediaSource(mid, s, false)}>
                  <Icon name="close" sm />
                </button>
              </div>
            ))}
        </div>
        <select value="" onChange={(e) => e.target.value && linkMediaSource(mid, e.target.value)} aria-label="Link to a source" style={{ width: '100%', marginTop: 6 }}>
          <option value="">Link to a source…</option>
          {data.sources
            .filter((s) => !m.sourceIds.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </select>
      </div>
      <div className="dd-sep" />
      <button
        className="btn ghost danger"
        style={{ alignSelf: 'flex-start' }}
        onClick={() =>
          setUi({
            modal: {
              kind: 'confirm',
              title: 'Remove this item?',
              body: `“${m.title}” will be removed from Media and from everyone tagged in it. Copies already in your backups are kept.`,
              action: 'Remove',
              danger: true,
              onConfirm: () => deleteMedia(mid),
            },
          })
        }
      >
        <Icon name="trash" sm />
        Remove from Media
      </button>
    </div>
  );
}

/** The sample tree's recordings are illustrations, so this player only simulates playback. */
function SamplePlayer({ duration }: { duration: number }) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const t = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (!playing) return;
    t.current = setInterval(() => setPos((p) => (p + 0.5 >= duration ? (setPlaying(false), 0) : p + 0.5)), 500);
    return () => clearInterval(t.current);
  }, [playing, duration]);
  return (
    <div className="player">
      <button className="playbtn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <span className="small strong">{mmss(pos)}</span>
      <div className="prog">
        <span style={{ width: (duration ? Math.round((pos / duration) * 100) : 0) + '%' }} />
      </div>
      <span className="small muted">{mmss(duration)}</span>
    </div>
  );
}
