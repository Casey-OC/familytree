// Native menu items and keyboard shortcuts land here.
import { setPrefs, useData } from '../data/store';
import { setUi, toast, ui } from '../data/ui';
import { addRelModal, go } from '../data/actions';
import * as platform from '../data/platform';
import { openSample } from './FirstRun';

export async function handleMenu(id: string) {
  const inApp = ui().screen === 'app';
  const needTree = (fn: () => void) => (inApp ? fn() : toast('Open or create a tree first'));
  switch (id) {
    case 'open-sample':
      await openSample();
      break;
    case 'import-gedcom':
      if (inApp) setUi({ section: 'settings', stab: 'gedcom', panel: null });
      else setUi({ screen: 'import' });
      break;
    case 'export-gedcom':
      needTree(() => setUi({ section: 'settings', stab: 'gedcom', panel: null }));
      break;
    case 'backup-now':
      needTree(async () => {
        try {
          await platform.backupNow(useData.getState().treeId, 'manual');
          toast('Backup complete');
        } catch (e) {
          toast(String(e));
        }
      });
      break;
    case 'backups':
      needTree(() => setUi({ section: 'settings', stab: 'backup', panel: null }));
      break;
    case 'settings':
      needTree(() => setUi({ section: 'settings', panel: null }));
      break;
    case 'search':
      needTree(() => import('./Shell').then((m) => m.focusSearch()));
      break;
    case 'go-home':
      needTree(() => go('wall'));
      break;
    case 'go-overview':
      needTree(() => go('home'));
      break;
    case 'go-tree':
    case 'go-people':
    case 'go-sources':
    case 'go-media':
    case 'go-research':
      needTree(() => go(id.slice(3) as 'home'));
      break;
    case 'toggle-dark':
      setPrefs((p) => ({ dark: !p.dark }));
      setUi({ menu: null });
      break;
    case 'toggle-density':
      setPrefs((p) => ({ compact: !p.compact }));
      setUi({ menu: null });
      break;
    case 'themes':
      setUi({ modal: { kind: 'theme' }, menu: null });
      break;
    case 'add-person':
      needTree(() => {
        const p = ui().panel;
        addRelModal(p?.kind === 'person' ? p.id : '', p?.kind === 'person' ? 'child' : 'none');
      });
      break;
    case 'add-source':
      needTree(() => setUi({ modal: { kind: 'source', title: '', type: 'Certificate', repo: '', url: '' } }));
      break;
    case 'upload-media':
      needTree(() => setUi({ modal: { kind: 'upload' } }));
      break;
    case 'new-task':
      needTree(() => setUi({ modal: { kind: 'task', title: '', pid: ui().panel?.kind === 'person' ? ui().panel!.id : '', priority: 'Medium', notes: '' } }));
      break;
    case 'tree-fit':
      needTree(() => {
        go('tree');
        setUi((s) => ({ fitRequest: s.fitRequest + 1 }));
      });
      break;
    case 'lock':
      (await import('./account/Account')).signOut();
      break;
    case 'shortcuts':
      setUi({ modal: { kind: 'shortcuts' } });
      break;
    case 'data-folder': {
      const where = await platform.revealDataFolder();
      toast('Your trees are saved in: ' + where);
      break;
    }
  }
}
