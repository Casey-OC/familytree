import { useEffect } from 'react';
import { useData, loadPrefs, setPrefs } from './data/store';
import { setUi, ui, useUi } from './data/ui';
import { continueStartup, LockScreen } from './features/security/Security';
import { closePanel, flushNotes, go } from './data/actions';
import * as platform from './data/platform';
import { FirstRun, EmptyTree, ImportStart } from './features/FirstRun';
import { Shell } from './features/Shell';
import { Modals } from './features/Modals';
import { handleMenu } from './features/menuCommands';
import { runScheduledBackup } from './features/settings/backups';

export default function App() {
  const screen = useUi((s) => s.screen);
  const toastText = useUi((s) => s.toast);
  const modal = useUi((s) => s.modal);
  const prefs = useData((s) => s.prefs);
  const busy = useData((s) => s.busy);

  // Start-up: load preferences, reopen the last tree.
  useEffect(() => {
    (async () => {
      const p = await loadPrefs();
      if (p.lock) setUi({ screen: 'locked' });
      else await continueStartup();
    })();
  }, []);

  // Native menu, online/offline, saving on close, scheduled backups.
  useEffect(() => {
    let unMenu = () => {};
    let unClose = () => {};
    platform.onMenu(handleMenu).then((u) => (unMenu = u));
    platform
      .onCloseRequested(async () => {
        await flushNotes();
        await runScheduledBackup('close');
      })
      .then((u) => (unClose = u));
    const on = () => setUi({ online: true });
    const off = () => setUi({ online: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const timer = setInterval(() => runScheduledBackup('timer'), 5 * 60 * 1000);
    const first = setTimeout(() => runScheduledBackup('timer'), 20 * 1000);
    return () => {
      unMenu();
      unClose();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  // Keyboard: Esc closes the top-most thing; Ctrl/⌘ K searches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const u = ui();
      if (e.key === 'Escape') {
        if (u.modal) setUi({ modal: null });
        else if (u.ctx || u.menu || u.searchOpen) setUi({ ctx: null, menu: null, searchOpen: false });
        else if (u.pendingFace) setUi({ pendingFace: null });
        else if (u.form) setUi({ form: null });
        else if (u.cf) setUi({ cf: null });
        else if (u.panel) closePanel();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || u.screen !== 'app') return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        handleMenu('search');
      } else if (/^[1-6]$/.test(k) && !platform.isTauri()) {
        e.preventDefault();
        go((['home', 'tree', 'people', 'sources', 'media', 'research'] as const)[+k - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rootCls = `app th-${prefs.theme}${prefs.dark ? ' dark' : ''}${prefs.compact ? ' compact' : ''}`;
  // Keep the page behind the app in the theme colour (seen briefly on resize).
  useEffect(() => {
    document.documentElement.style.background = prefs.dark ? '#171612' : '#F7F3EA';
  }, [prefs.dark]);

  return (
    <div className={rootCls}>
      {screen === 'loading' && (
        <div className="first">
          <div className="busy" style={{ position: 'static', background: 'none' }}>
            <div>
              <span className="spinner" /> Opening Family Tree…
            </div>
          </div>
        </div>
      )}
      {screen === 'locked' && <LockScreen />}
      {screen === 'first' && <FirstRun />}
      {screen === 'empty' && <EmptyTree />}
      {screen === 'import' && <ImportStart />}
      {screen === 'app' && <Shell />}
      {modal && <Modals />}
      {toastText && (
        <div className="toast" role="status" aria-live="polite">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          {toastText}
        </div>
      )}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div>
            <span className="spinner" />
            {busy}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export so other modules can update prefs without importing the store directly.
export { setPrefs };
