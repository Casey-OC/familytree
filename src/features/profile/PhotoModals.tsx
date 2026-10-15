// Framing a profile photo, and choosing which photo is the profile or cover photo.

import { useRef, useState } from 'react';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { setCoverPhoto, setPhotoCrop, setProfilePhoto } from '../../data/actions';
import { mediaUrl } from '../../data/platform';
import { treeApi } from '../../lib/family';
import { defaultCrop, normaliseCrop, panCrop } from '../../lib/photoFrame';
import type { PhotoCrop } from '../../lib/types';
import { FramedImg, ModalFrame } from '../../components/ui';
import { MediaThumb } from '../media/MediaThumb';

const BOX = 260;

export function AdjustPhotoModal({ pid, close }: { pid: string; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const p = T.person[pid];
  const m = p?.photoMediaId ? T.media[p.photoMediaId] : undefined;
  const url = m ? mediaUrl(m.file || m.thumb) : '';
  const [aspect, setAspect] = useState(0);
  const [crop, setCrop] = useState<PhotoCrop>(() => (p && m ? defaultCrop(p, m) : { x: 50, y: 50, z: 1 }));
  const drag = useRef<{ x: number; y: number; c: PhotoCrop } | null>(null);

  if (!p || !m || !url) {
    return (
      <ModalFrame label="Adjust profile photo" onClose={close}>
        <h2 className="h2">Adjust profile photo</h2>
        <p style={{ margin: 0 }}>Choose a profile photo first.</p>
        <div className="mfoot">
          <button className="btn primary" onClick={close}>
            OK
          </button>
        </div>
      </ModalFrame>
    );
  }

  const a = aspect || 1;
  const nudge = (dx: number, dy: number) => setCrop((c) => panCrop(a, c, dx, dy));
  const zoom = (z: number) => setCrop((c) => normaliseCrop(a, { ...c, z }));

  return (
    <ModalFrame label="Adjust profile photo" onClose={close} width={520}>
      <h2 className="h2">Adjust profile photo</h2>
      <p className="muted" style={{ margin: 0 }}>
        Drag the photo to move it, and use the slider to zoom. Arrow keys move it too.
      </p>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div
          className="cropper"
          tabIndex={0}
          role="img"
          aria-label={`Profile photo of ${T.nm(pid)}. Use the arrow keys to move it.`}
          style={{ width: BOX, height: BOX }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, c: crop };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setCrop(panCrop(a, d.c, (e.clientX - d.x) / BOX, (e.clientY - d.y) / BOX));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => zoom(crop.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.025;
            const map: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
            if (map[e.key]) {
              e.preventDefault();
              nudge(...map[e.key]);
            } else if (e.key === '+' || e.key === '=') zoom(crop.z + 0.1);
            else if (e.key === '-') zoom(crop.z - 0.1);
          }}
        >
          <FramedImg url={url} crop={crop} />
          <img src={url} alt="" style={{ display: 'none' }} onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <span className="small muted">How it looks</span>
          {[84, 44, 28].map((s) => (
            <span key={s} className="av img" style={{ width: s, height: s }} aria-hidden="true">
              <FramedImg url={mediaUrl(m.thumb || m.file)} crop={crop} />
            </span>
          ))}
        </div>
      </div>
      <label className="fl">
        Zoom
        <input type="range" min={1} max={5} step={0.05} value={crop.z} onChange={(e) => zoom(+e.target.value)} aria-valuetext={`${Math.round(crop.z * 100)}%`} />
      </label>
      <div className="mfoot">
        <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setCrop(normaliseCrop(a, defaultCrop({ ...p, photoCrop: null }, m)))}>
          Reset
        </button>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            await setPhotoCrop(pid, normaliseCrop(a, crop));
            close();
          }}
        >
          Save
        </button>
      </div>
    </ModalFrame>
  );
}

/** Pick a profile or cover photo from the photos already on someone's profile. */
export function ChoosePhotoModal({ pid, purpose, close }: { pid: string; purpose: 'profile' | 'cover'; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const p = T.person[pid];
  const photos = T.profileMedia(pid).filter((m) => m.kind === 'photo' && m.file);
  const current = purpose === 'profile' ? p?.photoMediaId : p?.coverMediaId;
  const title = purpose === 'profile' ? 'Choose a profile photo' : 'Choose a cover photo';
  return (
    <ModalFrame label={title} onClose={close} wide>
      <h2 className="h2">{title}</h2>
      {photos.length ? (
        <div className="mgrid" style={{ maxHeight: 420, overflow: 'auto' }}>
          {photos.map((m) => (
            <button
              key={m.id}
              className={'mtile' + (current === m.id ? ' on' : '')}
              aria-pressed={current === m.id}
              onClick={async () => {
                if (purpose === 'profile') {
                  await setProfilePhoto(pid, m.id);
                  setUi({ modal: { kind: 'adjustPhoto', pid } });
                } else {
                  await setCoverPhoto(pid, m.id);
                  close();
                }
              }}
            >
              <MediaThumb m={m} tag={false} />
              <div className="mt-b">
                <span className="li-t">{m.title}</span>
                {current === m.id && (
                  <span className="badge wall" style={{ alignSelf: 'flex-start' }}>
                    Current
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0 }}>There are no photos of {T.first(pid)} yet. Upload one, then choose it here.</p>
      )}
      <div className="mfoot">
        {current && (
          <button
            className="btn ghost"
            style={{ marginRight: 'auto' }}
            onClick={async () => {
              if (purpose === 'profile') await setProfilePhoto(pid, null);
              else await setCoverPhoto(pid, null);
              close();
            }}
          >
            Remove {purpose} photo
          </button>
        )}
        <button className="btn" onClick={() => setUi({ modal: { kind: 'upload', forPid: pid } })}>
          Upload a photo
        </button>
        <button className="btn primary" onClick={close}>
          Done
        </button>
      </div>
    </ModalFrame>
  );
}
