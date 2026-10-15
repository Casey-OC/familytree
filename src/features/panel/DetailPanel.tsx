import { useData } from '../../data/store';
import { setUi, useUi } from '../../data/ui';
import { closePanel } from '../../data/actions';
import { Icon } from '../../components/ui';
import { PersonPanel } from './PersonPanel';
import { SourcePanel } from './SourcePanel';
import { MediaPanel } from './MediaPanel';
import { PlacePanel } from './PlacePanel';
import { treeApi } from '../../lib/family';

export function DetailPanel() {
  const panel = useUi((s) => s.panel);
  const pinned = useUi((s) => s.pinned);
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const exists =
    panel &&
    ((panel.kind === 'person' && T.person[panel.id]) ||
      (panel.kind === 'source' && T.source[panel.id]) ||
      (panel.kind === 'media' && T.media[panel.id]) ||
      (panel.kind === 'place' && T.place[panel.id]));
  return (
    <aside className={'panel' + (exists ? ' open' : '')} aria-label="Details" aria-hidden={!exists}>
      <div className="ph">
        <button className={pinned ? 'btn sm gold' : 'btn sm ghost'} onClick={() => setUi({ pinned: !pinned })} aria-pressed={pinned}>
          <Icon name="pin" sm />
          {pinned ? 'Unpin panel' : 'Pin panel open'}
        </button>
        <button className="btn sm ghost" onClick={closePanel} aria-label="Close panel (Esc)">
          <Icon name="close" sm />
          Close
        </button>
      </div>
      {exists && panel.kind === 'person' && <PersonPanel key={panel.id} pid={panel.id} />}
      {exists && panel.kind === 'source' && <SourcePanel key={panel.id} sid={panel.id} />}
      {exists && panel.kind === 'media' && <MediaPanel key={panel.id} mid={panel.id} />}
      {exists && panel.kind === 'place' && <PlacePanel key={panel.id} id={panel.id} />}
    </aside>
  );
}
