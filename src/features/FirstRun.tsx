import { useState } from 'react';
import { createTree, openTree, useData } from '../data/store';
import { setUi, toast } from '../data/ui';
import { addRelModal, centreOn } from '../data/actions';
import { sampleTree } from '../lib/sample';
import { emptyTree } from '../lib/types';
import { Icon } from '../components/ui';
import { GedcomImport } from './settings/GedcomImport';
import { relativeTime } from '../lib/dates';

export async function openSample() {
  const { prefs } = useData.getState();
  const existing = prefs.trees.find((t) => t.sample);
  try {
    if (existing) await openTree(existing.id);
    else await createTree(sampleTree());
    setUi({ screen: 'app', section: 'home', panel: null, treeView: 'family', menu: null });
    centreOn(useData.getState().data.settings.root_person || '');
  } catch (e) {
    toast('Couldn’t open the sample tree: ' + String((e as Error)?.message || e));
  }
}

export function FirstRun() {
  const trees = useData((s) => s.prefs.trees);
  const sorted = trees.slice().sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
  return (
    <main className="first" style={{ overflow: 'auto' }}>
      <div className="first-inner">
        <svg className="illo" viewBox="0 0 160 110" style={{ width: 160, height: 110 }} aria-hidden="true">
          <path className="fillsoft" d="M80 18c-22 0-38 14-38 32 0 16 14 28 32 30v22h12V80c18-2 32-14 32-30 0-18-16-32-38-32z" />
          <path d="M80 102V60M80 74l-14-12M80 66l14-12M80 84l10-8" />
          <circle cx="58" cy="40" r="5" />
          <circle cx="102" cy="40" r="5" />
          <circle cx="80" cy="30" r="5" />
          <path d="M40 104h80" />
        </svg>
        <h1 className="h1">Every family has a story worth keeping</h1>
        <p className="lede">Build your tree, prove every fact with evidence, and share the living part of the story privately with the people in it.</p>
        <div className="first-cards">
          <button className="fcard" onClick={() => setUi({ screen: 'empty' })}>
            <span className="fc-ico">
              <Icon name="plus" />
            </span>
            <span className="fc-t">Start a new tree</span>
            <span className="fc-d">Begin with yourself and work back through your parents and grandparents.</span>
          </button>
          <button className="fcard" onClick={() => setUi({ screen: 'import' })}>
            <span className="fc-ico">
              <Icon name="download" />
            </span>
            <span className="fc-t">Import a GEDCOM file</span>
            <span className="fc-d">Bring a tree from another program or website. You’ll preview it before anything changes.</span>
          </button>
          <button className="fcard primary" onClick={openSample}>
            <span className="fc-ico">
              <Icon name="tree" />
            </span>
            <span className="fc-t">Open sample tree</span>
            <span className="fc-d">The Pascoes — from Cornwall to Queensland in 1885. Four generations, 30 people.</span>
          </button>
        </div>
        {sorted.length > 0 && (
          <div className="card" style={{ width: '100%', textAlign: 'left', marginTop: 8 }}>
            <div className="card-head">
              <h2 className="h3">Your trees</h2>
            </div>
            <div className="list">
              {sorted.map((t) => (
                <button
                  key={t.id}
                  className="li"
                  onClick={async () => {
                    await openTree(t.id);
                    setUi({ screen: 'app', section: 'home', panel: null });
                  }}
                >
                  <span className="ts-mark" aria-hidden="true">
                    <Icon name="tree" />
                  </span>
                  <span>
                    <span className="li-t">{t.name}</span>
                    <span className="li-s">
                      {t.people} {t.people === 1 ? 'person' : 'people'} · last opened {relativeTime(t.lastOpened)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="fine">Your tree is stored on this computer. Nothing is shared until you invite someone.</p>
      </div>
    </main>
  );
}

export function EmptyTree() {
  const [name, setName] = useState('My Family Tree');
  const start = async () => {
    const d = emptyTree();
    d.settings = { tree_name: name.trim() || 'My Family Tree', subtitle: '', privacy_default: 'Private', backup_schedule: 'daily' };
    try {
      await createTree(d);
      setUi({ screen: 'app', section: 'tree', panel: null });
      addRelModal('', 'none');
    } catch (e) {
      toast('Couldn’t create the tree: ' + String((e as Error)?.message || e));
    }
  };
  return (
    <main className="first">
      <div className="first-inner">
        <svg className="illo" viewBox="0 0 160 110" style={{ width: 160, height: 110 }} aria-hidden="true">
          <circle className="fillsoft" cx="80" cy="46" r="26" />
          <path d="M80 34v24M68 46h24M40 104h80M80 72v32" />
        </svg>
        <h1 className="h1">Your new tree is ready</h1>
        <p className="lede">Start with the person you know best — usually yourself. You can add parents, partners and children from their card.</p>
        <label className="fl" style={{ width: 'min(420px, 100%)', textAlign: 'left' }}>
          Name your tree
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
        </label>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="btn primary" onClick={start}>
            Add the first person
          </button>
          <button className="btn" onClick={() => setUi({ screen: 'first' })}>
            Back
          </button>
        </div>
      </div>
    </main>
  );
}

export function ImportStart() {
  return (
    <main className="first" style={{ overflow: 'auto', alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="first-inner" style={{ textAlign: 'left', alignItems: 'stretch' }}>
        <div className="row">
          <button className="btn ghost" onClick={() => setUi({ screen: 'first' })}>
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
