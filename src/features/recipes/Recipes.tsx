// Family recipes: the family cookbook, a recipe card you can print, and the editor.

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { addMediaFromPicked, deleteRecipe, openProfile, saveRecipe, type RecipeDraft } from '../../data/actions';
import { mediaUrl, pickFile } from '../../data/platform';
import { treeApi, type TreeApi } from '../../lib/family';
import type { Recipe } from '../../lib/types';
import { Avatar, Empty, Icon, ModalFrame, PlaceInput } from '../../components/ui';
import { MediaThumb } from '../media/MediaThumb';

export const RECIPE_CATEGORIES = ['Mains', 'Soups', 'Baking', 'Desserts', 'Christmas', 'Preserves', 'Drinks', 'Sides', 'Other'];

const PHOTO_FILTERS = [{ name: 'Photos and scans', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tif', 'tiff', 'bmp', 'pdf'] }];

/** Splits a block of text into its non-empty lines. */
export const lines = (t: string) =>
  t
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

/** "Elizabeth Ann Rowe’s" / "Mary and Florence’s" — whose recipe it is. */
export function whoseRecipe(T: TreeApi, r: Pick<Recipe, 'people'>) {
  const names = r.people.filter((p) => T.person[p]).map((p) => T.short(p));
  if (!names.length) return '';
  const joined = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  return joined;
}

/** Matches a recipe against what someone typed in the search box. */
export function recipeMatches(T: TreeApi, r: Recipe, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [r.title, r.category, r.ingredients, r.story, r.date, ...r.people.map((p) => (T.person[p] ? T.nm(p) : ''))].join('\n').toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}

export function recipesOf(data: { recipes: Recipe[] }, pid: string) {
  return (data.recipes || []).filter((r) => r.people.includes(pid));
}

function firstPhoto(T: TreeApi, r: Recipe) {
  return r.mediaIds.map((id) => T.media[id]).find((m) => m && m.kind === 'photo' && (m.thumb || m.file));
}

// ---------- the cookbook page ----------
export function RecipesPage() {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [who, setWho] = useState('all');
  const recipes = data.recipes || [];
  const rows = useMemo(
    () => recipes.filter((r) => (cat === 'all' || r.category === cat) && (who === 'all' || r.people.includes(who)) && recipeMatches(T, r, q)),
    [recipes, cat, who, q, T],
  );
  const cats = [...new Set(recipes.map((r) => r.category).filter(Boolean))].sort();
  const cooks = [...new Set(recipes.flatMap((r) => r.people))].filter((p) => T.person[p]).sort((a, b) => T.nm(a).localeCompare(T.nm(b)));

  return (
    <div className="view">
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="h1">Family recipes</h1>
            <p className="lede">
              {recipes.length
                ? `${recipes.length} recipe${recipes.length === 1 ? '' : 's'} in the family cookbook`
                : 'Keep the family’s favourite recipes, and the stories behind them, together with the tree.'}
            </p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setUi({ modal: { kind: 'editRecipe' } })}>
            <Icon name="plus" sm />
            Add a recipe
          </button>
        </div>
        {recipes.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="tb-field" style={{ flex: '1 1 240px' }}>
              Search
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recipe, ingredient or cook" style={{ flex: 1, minWidth: 0, width: '100%' }} />
            </label>
            <label className="tb-field">
              Type
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="all">All types</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-field">
              Whose recipe
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">Anyone’s</option>
                {cooks.map((p) => (
                  <option key={p} value={p}>
                    {T.nm(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {rows.length ? (
          <div className="recipegrid">
            {rows.map((r) => (
              <RecipeCard key={r.id} T={T} r={r} />
            ))}
          </div>
        ) : recipes.length ? (
          <div className="empty">No recipes match. Try a different search.</div>
        ) : (
          <Empty>
            <strong>No recipes yet.</strong> Add Nan’s scones, Dad’s curry or the Christmas pudding. Type the recipe in, and add a photo of the handwritten card if you have one.
          </Empty>
        )}
      </div>
    </div>
  );
}

export function RecipeCard({ T, r }: { T: TreeApi; r: Recipe }) {
  const photo = firstPhoto(T, r);
  const whose = whoseRecipe(T, r);
  return (
    <button className="card recipecard" onClick={() => setUi({ modal: { kind: 'recipe', id: r.id } })} aria-label={`${r.title}${whose ? ', ' + whose + '’s recipe' : ''}`}>
      <div className="recipecard-pic">
        {photo ? (
          <MediaThumb m={photo} tag={false} />
        ) : (
          <div className="recipe-noimg" aria-hidden="true">
            <Icon name="recipe" />
          </div>
        )}
      </div>
      <div className="recipecard-b">
        <span className="h3">{r.title}</span>
        {whose && <span className="small">{whose}’s recipe</span>}
        <span className="small muted">{[r.category, r.date, r.time].filter(Boolean).join(' · ')}</span>
      </div>
    </button>
  );
}

// ---------- viewing one recipe ----------
export function RecipeModal({ id, close }: { id: string; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const r = (data.recipes || []).find((x) => x.id === id);
  const [printing, setPrinting] = useState(false);
  if (!r) return null;
  const whose = whoseRecipe(T, r);
  const photos = r.mediaIds.map((m) => T.media[m]).filter(Boolean);
  const print = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(false), 500);
    }, 300);
  };
  return (
    <ModalFrame label={r.title} onClose={close} width={820}>
      <div className="recipe-view">
        <div>
          <h2 className="h2" style={{ margin: 0 }}>
            {r.title}
          </h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {r.people.length > 0 && (
              <>
                {r.people
                  .filter((p) => T.person[p])
                  .map((p, i, a) => (
                    <span key={p}>
                      {i > 0 && (i === a.length - 1 ? ' and ' : ', ')}
                      <button
                        className="link"
                        onClick={() => {
                          close();
                          openProfile(p);
                        }}
                      >
                        {T.short(p)}
                      </button>
                    </span>
                  ))}
                ’s recipe
              </>
            )}
            {[r.date && (whose ? ' · ' : '') + r.date, r.placeId && ' · ' + T.placeName(r.placeId)].filter(Boolean).join('')}
          </p>
        </div>
        <div className="recipe-facts">
          {r.category && <span className="chip">{r.category}</span>}
          {r.servings && (
            <span>
              <span className="strong">Makes</span> {r.servings}
            </span>
          )}
          {r.time && (
            <span>
              <span className="strong">Time</span> {r.time}
            </span>
          )}
        </div>
        {r.story && <blockquote className="recipe-story">{r.story}</blockquote>}
        <div className="recipe-cols">
          <section aria-labelledby="ri-h">
            <h3 className="h3" id="ri-h">
              Ingredients
            </h3>
            {lines(r.ingredients).length ? <IngredientList text={r.ingredients} /> : <p className="muted">No ingredients written down yet.</p>}
          </section>
          <section aria-labelledby="rm-h">
            <h3 className="h3" id="rm-h">
              Method
            </h3>
            {lines(r.method).length ? (
              <ol className="recipe-steps">
                {lines(r.method).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            ) : (
              <p className="muted">No method written down yet.</p>
            )}
          </section>
        </div>
        {photos.length > 0 && (
          <div className="fl">
            <span>Photos and scans</span>
            <div className="story-photos">
              {photos.map((m) => (
                <a key={m.id} className="pf-mini-tile" href={m.file ? mediaUrl(m.file) : undefined} target="_blank" rel="noreferrer" aria-label={`Open ${m.title}`}>
                  <MediaThumb m={m} tag={m.kind !== 'photo'} />
                </a>
              ))}
            </div>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          {r.sharedBy ? `Shared by ${r.sharedBy}` : r.addedBy ? `Added by ${r.addedBy}` : ''}
        </p>
      </div>
      <div className="mfoot">
        <button
          className="btn ghost danger"
          style={{ marginRight: 'auto' }}
          onClick={() =>
            setUi({
              modal: {
                kind: 'confirm',
                title: `Delete ${r.title}?`,
                body: 'The recipe is removed from the family cookbook. Its photos stay in Media.',
                action: 'Delete recipe',
                danger: true,
                onConfirm: () => deleteRecipe(r.id),
              },
            })
          }
        >
          Delete
        </button>
        <button className="btn" onClick={print}>
          <Icon name="print" sm />
          Print
        </button>
        <button className="btn" onClick={() => setUi({ modal: { kind: 'shareRecipe', id: r.id } })}>
          Share on the Family Wall
        </button>
        <button className="btn primary" onClick={() => setUi({ modal: { kind: 'editRecipe', id: r.id } })}>
          Edit
        </button>
      </div>
      {printing && createPortal(<RecipePrint T={T} r={r} />, document.body)}
    </ModalFrame>
  );
}

function IngredientList({ text }: { text: string }) {
  // A line ending in ":" is a heading, e.g. "For the pastry:"
  const out: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = (k: number) => {
    if (items.length)
      out.push(
        <ul key={'u' + k} className="recipe-ings">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>,
      );
    items = [];
  };
  lines(text).forEach((x, i) => {
    if (x.endsWith(':')) {
      flush(i);
      out.push(
        <div key={'h' + i} className="strong" style={{ marginTop: 8 }}>
          {x.slice(0, -1)}
        </div>,
      );
    } else items.push(x.replace(/^[-•*]\s*/, ''));
  });
  flush(-1);
  return <>{out}</>;
}

function RecipePrint({ T, r }: { T: TreeApi; r: Recipe }) {
  const photo = firstPhoto(T, r);
  const whose = whoseRecipe(T, r);
  return (
    <div className="printroot">
      <div className="printpage recipe-print">
        <h1 className="ph1">{r.title}</h1>
        <p className="bk-muted">{[whose && whose + '’s recipe', r.date, r.placeId && T.placeName(r.placeId)].filter(Boolean).join(' · ')}</p>
        <p>{[r.servings && 'Makes ' + r.servings, r.time && 'Time: ' + r.time].filter(Boolean).join('   ·   ')}</p>
        {photo && <img className="recipe-print-img" src={mediaUrl(photo.file || photo.thumb)} alt="" />}
        {r.story && <p className="bk-note">{r.story}</p>}
        <h2 className="bk-h" style={{ fontSize: '14pt' }}>
          Ingredients
        </h2>
        <IngredientList text={r.ingredients} />
        <h2 className="bk-h" style={{ fontSize: '14pt' }}>
          Method
        </h2>
        <ol>
          {lines(r.method).map((x, i) => (
            <li key={i} style={{ marginBottom: '2mm' }}>
              {x}
            </li>
          ))}
        </ol>
        <footer>From the family cookbook</footer>
      </div>
    </div>
  );
}

// ---------- adding and editing ----------
export function RecipeEditor({ id, pid, draft, close }: { id?: string; pid?: string; draft?: Partial<RecipeDraft>; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const existing = id ? (data.recipes || []).find((r) => r.id === id) : undefined;
  const [f, setF] = useState<RecipeDraft>(() => ({
    title: existing?.title || '',
    category: existing?.category || '',
    servings: existing?.servings || '',
    time: existing?.time || '',
    ingredients: existing?.ingredients || '',
    method: existing?.method || '',
    story: existing?.story || '',
    date: existing?.date || '',
    place: existing ? T.placeName(existing.placeId) : '',
    people: existing?.people || (pid ? [pid] : []),
    mediaIds: existing?.mediaIds || [],
    ...draft,
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<RecipeDraft>) => setF((x) => ({ ...x, ...p }));
  const addable = T.peopleSorted().filter((p) => !f.people.includes(p.id));
  const title = existing ? 'Edit recipe' : 'Add a family recipe';

  const addPhoto = async () => {
    const picked = await pickFile({ title: 'Choose a photo of the dish or the recipe card', filters: PHOTO_FILTERS });
    if (!picked) return;
    setBusy(true);
    const m = await addMediaFromPicked(picked, { title: f.title.trim() ? `${f.title.trim()} — recipe` : '', date: '', place: '' });
    setBusy(false);
    if (m) set({ mediaIds: [...f.mediaIds, m.id] });
  };

  return (
    <ModalFrame label={title} onClose={close} width={820}>
      <h2 className="h2">{title}</h2>
      <label className="fl">
        Recipe name
        <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Nan’s pumpkin scones" />
      </label>
      <div className="fl">
        <span>Whose recipe is it?</span>
        {f.people.length > 0 && (
          <div className="chips">
            {f.people.map((p) => (
              <span key={p} className="chip person" style={{ fontSize: 15 }}>
                <Avatar pid={p} size="xs" />
                {T.nm(p)}
                <button type="button" className="link" onClick={() => set({ people: f.people.filter((x) => x !== p) })} aria-label={`Remove ${T.nm(p)}`}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <select value="" onChange={(e) => e.target.value && set({ people: [...f.people, e.target.value] })} aria-label="Add whose recipe it is" style={{ maxWidth: 360 }}>
          <option value="">{f.people.length ? 'Add someone else…' : 'Choose a person…'}</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.surname}, {p.given}
            </option>
          ))}
        </select>
        <span className="fieldnote">The recipe shows on their profile, under Recipes.</span>
      </div>
      <div className="grid2">
        <label className="fl">
          Type
          <input list="recipe-cats" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Baking" />
          <datalist id="recipe-cats">
            {[...new Set([...RECIPE_CATEGORIES, ...(data.recipes || []).map((r) => r.category).filter(Boolean)])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="fl">
          Makes
          <input value={f.servings} onChange={(e) => set({ servings: e.target.value })} placeholder="e.g. 12 scones" />
        </label>
        <label className="fl">
          Time
          <input value={f.time} onChange={(e) => set({ time: e.target.value })} placeholder="e.g. 45 minutes" />
        </label>
        <label className="fl">
          How old is it? <span className="muted">(optional)</span>
          <input value={f.date} onChange={(e) => set({ date: e.target.value })} placeholder="e.g. 1950s, or c. 1920" />
        </label>
      </div>
      <label className="fl">
        Ingredients
        <textarea
          rows={7}
          value={f.ingredients}
          onChange={(e) => set({ ingredients: e.target.value })}
          placeholder={'One per line, e.g.\n2 cups self-raising flour\n1 cup mashed pumpkin\nFor the icing:'}
        />
        <span className="fieldnote">One ingredient per line. End a line with “:” to make a heading, like “For the icing:”.</span>
      </label>
      <label className="fl">
        Method
        <textarea
          rows={7}
          value={f.method}
          onChange={(e) => set({ method: e.target.value })}
          placeholder={'One step per line, e.g.\nHeat the oven to 220°C.\nRub the butter into the flour.'}
        />
        <span className="fieldnote">One step per line. They’re numbered for you.</span>
      </label>
      <label className="fl">
        The story behind it <span className="muted">(optional)</span>
        <textarea rows={3} value={f.story} onChange={(e) => set({ story: e.target.value })} placeholder="Who made it, and when? Any secrets?" />
      </label>
      <label className="fl">
        Where it comes from <span className="muted">(optional)</span>
        <PlaceInput value={f.place} onChange={(v) => set({ place: v })} />
      </label>
      <div className="fl">
        <span>Photos of the dish, or a scan of the handwritten card</span>
        <div className="story-pick">
          {f.mediaIds
            .map((m) => T.media[m])
            .filter(Boolean)
            .map((m) => (
              <div key={m.id} className="pf-mini-tile recipe-pic-edit">
                <MediaThumb m={m} tag={m.kind !== 'photo'} />
                <button type="button" className="btn sm" onClick={() => set({ mediaIds: f.mediaIds.filter((x) => x !== m.id) })} aria-label={`Remove ${m.title}`}>
                  Remove
                </button>
              </div>
            ))}
        </div>
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={addPhoto} disabled={busy}>
          <Icon name="upload" sm />
          {busy ? 'Adding…' : 'Add a photo or scan'}
        </button>
      </div>
      <div className="mfoot">
        <span className="small muted" style={{ marginRight: 'auto' }}>
          Saved on this computer with the tree
        </span>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const rid = await saveRecipe({ ...f, id });
            setBusy(false);
            if (rid) setUi({ modal: { kind: 'recipe', id: rid } });
          }}
        >
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Save recipe'}
        </button>
      </div>
    </ModalFrame>
  );
}

// ---------- on a profile ----------
export function RecipesTab({ T, pid }: { T: TreeApi; pid: string }) {
  const data = useData((s) => s.data);
  const list = recipesOf(data, pid);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p className="muted" style={{ margin: 0 }}>
          {list.length ? `${T.first(pid)}’s recipes in the family cookbook.` : `No recipes for ${T.first(pid)} yet.`}
        </p>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setUi({ modal: { kind: 'editRecipe', pid } })}>
          <Icon name="plus" sm />
          Add a recipe
        </button>
      </div>
      {list.length > 0 && (
        <div className="recipegrid">
          {list.map((r) => (
            <RecipeCard key={r.id} T={T} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
