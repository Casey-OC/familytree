import type { Media } from '../../lib/types';
import { mediaUrl } from '../../data/platform';
import { mmss } from '../../components/ui';

export function kindLabel(m: Media) {
  return m.kind === 'photo' ? 'Photo' : m.kind === 'document' ? 'Document' : 'Audio ' + mmss(m.duration);
}

/** The picture shown on a media tile: a real thumbnail, or the sample illustration. */
export function MediaThumb({ m, tag = true }: { m: Media; tag?: boolean }) {
  const kind = tag ? <span className="kindtag">{kindLabel(m)}</span> : null;
  if (m.kind === 'audio')
    return (
      <div className="audiowrap" style={{ position: 'relative' }}>
        <div className="scene audio" aria-hidden="true" />
        {kind}
      </div>
    );
  if (m.file || m.thumb) {
    const url = m.kind === 'photo' ? mediaUrl(m.thumb || m.file) : '';
    if (url)
      return (
        <div style={{ position: 'relative' }}>
          <img className="thumbimg" src={url} alt="" loading="lazy" draggable={false} />
          {kind}
        </div>
      );
    return (
      <div style={{ position: 'relative' }}>
        <div className="scene doc" aria-hidden="true" />
        {kind}
      </div>
    );
  }
  if (m.scene)
    return (
      <div className={'scene ' + m.scene} aria-hidden="true">
        {kind}
      </div>
    );
  return (
    <div style={{ position: 'relative' }}>
      <div className="thumbmissing">File not included — {m.originalName || 'linked from an import'}</div>
      {kind}
    </div>
  );
}
