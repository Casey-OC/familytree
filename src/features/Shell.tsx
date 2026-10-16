import { useEffect, useMemo, useRef } from 'react';
import { MessagesPage, useUnreadMessages } from './messages/MessagesPage';
import { WallPage } from './wall/WallPage';
import { useWall } from '../wall/store';
import { ProfilePage } from './profile/ProfilePage';
import { useData, openTree } from '../data/store';
import { setUi, useUi, type Section } from '../data/ui';
import { addRelModal, closePanel, go, openMedia, openPerson, openPlace, openProfile, openSource } from '../data/actions';
import { treeApi } from '../lib/family';
import { Icon } from '../components/ui';
import { searchTree } from '../lib/search';
import { Home } from './Home';
import { TreeView } from './tree/TreeView';
import { People } from './People';
import { Sources } from './Sources';
import { MediaPage } from './media/MediaPage';
import { Research } from './Research';
import { Settings } from './settings/Settings';
import { Charts } from './charts/Charts';
import { MapView } from './map/MapView';
import { DetailPanel } from './panel/DetailPanel';
import { handleMenu } from './menuCommands';

const NAV: [Section, string, string][] = [
  ['wall', 'Home', 'home'],
  ['home', 'Overview', 'charts'],
  ['tree', 'Tree', 'tree'],
  ['people', 'People', 'people'],
  ['messages', 'Messages', 'message'],
  ['sources', 'Sources', 'sources'],
  ['media', 'Media', 'media'],
  ['map', 'Map', 'map'],
  ['charts', 'Charts and Reports', 'charts'],
  ['research', 'Research', 'research'],
  ['settings', 'Settings', 'settings'],
];

export function Shell() {
  const section = useUi((s) => s.section);
  const panel = useUi((s) => s.panel);
  const pinned = useUi((s) => s.pinned);
  const menu = useUi((s) => s.menu);
  const searchOpen = useUi((s) => s.searchOpen);
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const pendingHints = data.hints.filter((h) => h.status === 'pending').length;
  const unread = useUnreadMessages();
  const treeIdNow = useData((d) => d.treeId);
  const accountNow = useData((d) => d.account?.id);
  useEffect(() => {
    // Quietly start the wall and messages so their badges are up to date.
    import('../wall/store').then((w) => w.startWall().then(() => import('../messages/store').then((m) => m.startMessages())));
  }, [treeIdNow, accountNow]);
  const wallBadge = useWall((w) => (w.walls.find((x) => x.treeId === w.wallId)?.isOwner ? w.posts.filter((p) => p.lifeStatus === 'pending' && !p.removed).length : 0) + w.invites.length);

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); (document.querySelector('#main') as HTMLElement | null)?.focus(); }}>
        Skip to main content
      </a>
      <TopBar />
      <div className="decoband" aria-hidden="true" />
      <div
        className="body"
        onMouseDown={(e) => {
          if ((menu || searchOpen) && !(e.target as HTMLElement).closest('.dropdown')) setUi({ menu: null, searchOpen: false });
        }}
      >
        <nav className="sidebar" aria-label="Sections">
          {NAV.map(([k, l, ic]) => (
            <button key={k} className={'nav' + (section === k ? ' on' : '')} aria-current={section === k ? 'page' : undefined} onClick={() => go(k)}>
              <Icon name={ic} />
              {l}
              {k === 'research' && pendingHints > 0 && <span className="nb">{pendingHints}</span>}
              {k === 'messages' && unread > 0 && <span className="nb" aria-label={`${unread} unread`}>{unread}</span>}
              {k === 'wall' && wallBadge > 0 && <span className="nb" aria-label={`${wallBadge} waiting`}>{wallBadge}</span>}
            </button>
          ))}
          <div className="side-foot">
            <span className="strong" style={{ color: 'var(--text)' }}>
              {data.settings.tree_name || 'Family tree'}
            </span>
            <span>Living relatives stay private unless they opt in.</span>
            <span>Saved on this computer · {T.data.people.length} people</span>
          </div>
        </nav>
        <main className={'main' + (pinned && panel ? ' pinned' : '')} id="main" tabIndex={-1} style={{ outline: 'none' }}>
          {section === 'home' && <Home />}
          {section === 'tree' && <TreeView />}
          {section === 'people' && <People />}
          {section === 'wall' && <WallPage />}
          {section === 'messages' && <MessagesPage />}
          {section === 'sources' && <Sources />}
          {section === 'media' && <MediaPage />}
          {section === 'map' && <MapView />}
          {section === 'charts' && <Charts />}
          {section === 'research' && <Research />}
          {section === 'settings' && <Settings />}
          {section === 'profile' && (
            <div className="view">
              <ProfilePage />
            </div>
          )}
          <DetailPanel />
        </main>
      </div>
      <BottomNav />
    </>
  );
}

function BottomNav() {
  const section = useUi((s) => s.section);
  const menu = useUi((s) => s.menu);
  const main: [Section, string, string][] = [
    ['wall', 'Home', 'home'],
    ['tree', 'Tree', 'tree'],
    ['people', 'People', 'people'],
    ['messages', 'Messages', 'message'],
  ];
  const inMore = !main.some(([k]) => k === section);
  return (
    <nav className="bottomnav" aria-label="Sections">
      {main.map(([k, l, ic]) => (
        <button key={k} className={section === k ? 'on' : ''} onClick={() => go(k)}>
          <Icon name={ic} />
          {l}
        </button>
      ))}
      <div className="rel">
        <button className={inMore ? 'on' : ''} style={{ width: '100%' }} onClick={() => setUi({ menu: menu === 'more' ? null : 'more' })} aria-haspopup="true">
          <Icon name="more" />
          More
        </button>
        {menu === 'more' && (
          <div className="dropdown" style={{ right: 0, bottom: 'calc(100% + 6px)', top: 'auto', width: 240 }}>
            {NAV.filter(([k]) => !main.some(([m]) => m === k)).map(([k, l, ic]) => (
              <button key={k} className={'dd-item row' + (section === k ? ' on' : '')} onClick={() => go(k)}>
                <Icon name={ic} sm />
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function TopBar() {
  const data = useData((s) => s.data);
  const prefs = useData((s) => s.prefs);
  const treeId = useData((s) => s.treeId);
  const account = useData((s) => s.account);
  const menu = useUi((s) => s.menu);
  const online = useUi((s) => s.online);
  const panel = useUi((s) => s.panel);
  const T = treeApi(data);
  const owner = (account?.name || prefs.ownerName).trim();
  const ownerIni = owner ? owner.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';
  const pendingHints = data.hints.filter((h) => h.status === 'pending').length;
  const unv = useMemo(() => data.facts.filter((f) => T.conf(f) === 'Unverified').length, [data]);
  const otherTrees = prefs.trees.filter((t) => t.id !== treeId && (!account || t.owner === account.id)).sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
  const notes: { t: string; s: string; go: () => void }[] = [];
  if (pendingHints) notes.push({ t: `${pendingHints} record hint${pendingHints > 1 ? 's' : ''} to review`, s: 'Research · record hints', go: () => setUi({ section: 'research', rtab: 'hints', menu: null }) });
  if (unv) notes.push({ t: `${unv} unverified fact${unv > 1 ? 's' : ''}`, s: 'Attach evidence or create a research task', go: () => setUi({ section: 'research', rtab: 'unv', menu: null }) });
  const openTasks = data.tasks.filter((t) => t.status !== 'Done').length;
  if (openTasks) notes.push({ t: `${openTasks} open research task${openTasks > 1 ? 's' : ''}`, s: 'Research · tasks', go: () => setUi({ section: 'research', rtab: 'tasks', menu: null }) });

  return (
    <header className="topbar">
      <div className="ts">
        <button className="ts-btn" onClick={() => setUi({ menu: menu === 'tree' ? null : 'tree', searchOpen: false })} aria-haspopup="true" aria-expanded={menu === 'tree'} aria-label="Switch tree">
          <span className="ts-mark" aria-hidden="true">
            <Icon name="tree" />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="ts-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data.settings.tree_name || 'Family tree'}
            </span>
            <span className="ts-sub">{data.people.length} people · this computer</span>
          </span>
          <Icon name="chevron" sm />
        </button>
        {menu === 'tree' && (
          <div className="dropdown" style={{ left: 0, width: 300 }}>
            <div className="dd-label">Your trees</div>
            <button className="dd-item on" onClick={() => setUi({ menu: null })}>
              <span className="sr-t">{data.settings.tree_name || 'Family tree'}</span>
              <span className="sr-s">Open now · {data.people.length} people</span>
            </button>
            {otherTrees.map((t) => (
              <button
                key={t.id}
                className="dd-item"
                onClick={async () => {
                  setUi({ menu: null, panel: null, form: null });
                  await openTree(t.id);
                  setUi({ section: 'wall' });
                }}
              >
                <span className="sr-t">{t.name}</span>
                <span className="sr-s">{t.people} people</span>
              </button>
            ))}
            <div className="dd-sep" />
            <button className="dd-item row" onClick={() => setUi({ menu: null, modal: { kind: 'renameTree', name: data.settings.tree_name || '' } })}>
              <Icon name="edit" sm />
              Rename this tree…
            </button>
            <button className="dd-item row" onClick={() => setUi({ menu: null, panel: null, screen: 'import' })}>
              <Icon name="download" sm />
              Import a GEDCOM file as a new tree…
            </button>
            {!prefs.trees.some((t) => t.sample && (!account || t.owner === account.id) && t.id === treeId) && (
              <button
                className="dd-item row"
                onClick={async () => {
                  setUi({ menu: null, panel: null });
                  (await import('./FirstRun')).openSample();
                }}
              >
                <Icon name="tree" sm />
                Explore the sample tree
              </button>
            )}
          </div>
        )}
      </div>
      <SearchBox />
      <div className="spacer" />
      <button className="btn primary" onClick={() => addRelModal(panel?.kind === 'person' ? panel.id : '', panel?.kind === 'person' ? 'child' : 'none')} aria-label="Add person">
        <Icon name="plus" sm />
        <span className="lbl">Add person</span>
      </button>
      <span className="syncchip" role="status" title={online ? 'Your tree is saved on this computer. The internet is only needed for the Family Wall and online features.' : 'No internet — your tree keeps working and saving on this computer.'}>
        <span className={online ? 'dot' : 'dot off'} aria-hidden="true" />
        <span className="lbl">{online ? 'Online · saved on this computer' : 'Offline · working locally'}</span>
      </span>
      <div className="rel">
        <button className="iconbtn" onClick={() => setUi({ menu: menu === 'bell' ? null : 'bell', searchOpen: false })} aria-label={`Notifications${notes.length ? ` (${notes.length})` : ''}`}>
          <Icon name="bell" />
          {pendingHints > 0 && <span className="nbadge">{pendingHints}</span>}
        </button>
        {menu === 'bell' && (
          <div className="dropdown dd-right" style={{ width: 340 }}>
            <div className="dd-label">Notifications</div>
            {notes.map((n) => (
              <button key={n.t} className="dd-item" onClick={n.go}>
                <span className="sr-t">{n.t}</span>
                <span className="sr-s">{n.s}</span>
              </button>
            ))}
            {!notes.length && <div className="dd-empty">You’re all caught up.</div>}
          </div>
        )}
      </div>
      <div className="rel">
        <button className="iconbtn" onClick={() => setUi({ menu: menu === 'profile' ? null : 'profile', searchOpen: false })} aria-label="Profile and settings menu">
          <span className="av sm" style={{ background: 'var(--pri)', color: 'var(--on-pri)' }}>
            {ownerIni || <Icon name="people" sm />}
          </span>
        </button>
        {menu === 'profile' && (
          <div className="dropdown dd-right" style={{ width: 300 }}>
            <div className="dd-label">{owner || 'You'} · tree owner</div>
            <button className="dd-item row" onClick={() => setUi({ menu: null, modal: { kind: 'theme' } })}>
              Colour theme…
            </button>
            <button className="dd-item row" onClick={() => handleMenu('toggle-dark')}>
              {prefs.dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button className="dd-item row" onClick={() => handleMenu('toggle-density')}>
              {prefs.compact ? 'Comfortable density' : 'Compact density'}
            </button>
            <div className="dd-sep" />
            <button className="dd-item row" onClick={() => setUi({ menu: null, section: 'settings', stab: 'appearance', panel: null })}>
              Settings
            </button>
            <button className="dd-item row" onClick={() => setUi({ menu: null, modal: { kind: 'shortcuts' } })}>
              Keyboard shortcuts
            </button>
            {data.settings.self_person && T.person[data.settings.self_person] && (
              <button className="dd-item row" onClick={() => openProfile(data.settings.self_person)}>
                My profile
              </button>
            )}
            <button className="dd-item row" onClick={() => setUi({ menu: null, section: 'settings', stab: 'account', panel: null })}>
              Account
            </button>
            <button
              className="dd-item row"
              onClick={async () => {
                setUi({ menu: null });
                (await import('./account/Account')).signOut();
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

let searchEl: HTMLInputElement | null = null;
export function focusSearch() {
  searchEl?.focus();
  searchEl?.select();
  setUi({ searchOpen: true, menu: null });
}

function SearchBox() {
  const q = useUi((s) => s.q);
  const open = useUi((s) => s.searchOpen);
  const data = useData((s) => s.data);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchEl = ref.current;
  });
  const groups = useMemo(
    () => (open ? searchTree(treeApi(data), q, { person: openPerson, place: openPlace, source: openSource, media: openMedia }) : []),
    [data, q, open],
  );
  const showDrop = open && q.trim().length >= 2;
  return (
    <div className="search">
      <Icon name="search" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setUi({ q: e.target.value, searchOpen: true })}
        onFocus={() => q.length > 1 && setUi({ searchOpen: true })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const first = groups[0]?.items[0];
            if (first) {
              setUi({ searchOpen: false });
              first.go();
            }
          }
        }}
        placeholder="Search people, places, sources…  Ctrl K"
        aria-label="Search people, places, sources and media"
        role="combobox"
        aria-expanded={showDrop}
      />
      {showDrop && (
        <div className="dropdown dd-search" role="listbox">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="dd-label">
                <span>{g.label}</span>
                <span>{g.count}</span>
              </div>
              {g.items.map((it, i) => (
                <button
                  key={g.label + i}
                  className="dd-item"
                  role="option"
                  onClick={() => {
                    setUi({ searchOpen: false });
                    it.go();
                  }}
                >
                  <span className="sr-t">{it.title}</span>
                  <span className="sr-s">{it.sub}</span>
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <div className="dd-empty">No matches for “{q}”. Try a surname or a town.</div>}
        </div>
      )}
    </div>
  );
}

export { openPerson, closePanel };
