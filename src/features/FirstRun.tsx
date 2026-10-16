import { createTree, openTree, useData } from '../data/store';
import { setUi, toast } from '../data/ui';
import { centreOn } from '../data/actions';
import { sampleTree } from '../lib/sample';
import { GedcomImport } from './settings/GedcomImport';

export async function openSample() {
  const { prefs } = useData.getState();
  const existing = prefs.trees.find((t) => t.sample);
  try {
    if (existing) await openTree(existing.id);
    else await createTree(sampleTree());
    setUi({ screen: 'app', section: 'wall', panel: null, treeView: 'family', menu: null });
    centreOn(useData.getState().data.settings.root_person || '');
  } catch (e) {
    toast('Couldn’t open the sample tree: ' + String((e as Error)?.message || e));
  }
}

export function ImportStart() {
  return (
    <main className="first" style={{ overflow: 'auto', alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="first-inner" style={{ textAlign: 'left', alignItems: 'stretch' }}>
        <div className="row">
          <button className="btn ghost" onClick={() => setUi({ screen: useData.getState().treeId ? 'app' : 'about' })}>
            ← Back
          </button>
        </div>
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 className="h2">Import a GEDCOM file</h1>
          <GedcomImport newTreeOnly />
        </section>
      </div>
    </main>
  );
}
