// Sharing a family recipe on the Family Wall, and saving one from the wall into your cookbook.

import { useEffect, useState } from 'react';
import { useData } from '../../data/store';
import { setUi } from '../../data/ui';
import { treeApi, type TreeApi } from '../../lib/family';
import type { Recipe, TreeData } from '../../lib/types';
import { currentWall, sendPost, startWall, useWall } from '../../wall/store';
import type { WallPost, WallRecipe } from '../../wall/types';
import { Icon, ModalFrame } from '../../components/ui';
import { lines, whoseRecipe } from '../recipes/Recipes';
import type { RecipeDraft } from '../../data/actions';

/** The copy of a recipe that goes on the wall. */
export function toWallRecipe(T: TreeApi, r: Recipe): WallRecipe {
  return {
    title: r.title,
    whose: whoseRecipe(T, r),
    category: r.category,
    servings: r.servings,
    time: r.time,
    ingredients: r.ingredients,
    method: r.method,
    story: r.story,
    date: r.date,
  };
}

/** Turns a recipe from the wall into a draft for your own cookbook, matching whose it is to people in your tree. */
export function fromWallRecipe(data: TreeData, x: WallRecipe, post: Pick<WallPost, 'authorName' | 'tags'>): Partial<RecipeDraft> {
  const T = treeApi(data);
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  const names = x.whose
    .split(/,| and /)
    .map(norm)
    .filter(Boolean);
  const people = data.people.filter((p) => names.includes(norm(T.nm(p.id))) || names.includes(norm(T.short(p.id)))).map((p) => p.id);
  // Tags on the post point at people in the wall owner's tree, which is this tree when you own the wall.
  for (const t of post.tags) if (T.person[t.id] && names.includes(norm(t.name)) && !people.includes(t.id)) people.push(t.id);
  return {
    title: x.title,
    category: x.category,
    servings: x.servings,
    time: x.time,
    ingredients: x.ingredients,
    method: x.method,
    story: x.story,
    date: x.date,
    people,
    mediaIds: [],
    sharedBy: `${post.authorName} on the Family Wall`,
  };
}

/** Whether this recipe is already in your cookbook (saved from this post, or it's your own). */
export function inCookbook(data: TreeData, x: WallRecipe) {
  return (data.recipes || []).some((r) => r.title.trim().toLowerCase() === x.title.trim().toLowerCase());
}

export function ShareRecipeModal({ id, close }: { id: string; close: () => void }) {
  const data = useData((s) => s.data);
  const T = treeApi(data);
  const r = (data.recipes || []).find((x) => x.id === id);
  const mode = useWall((s) => s.mode);
  const wallId = useWall((s) => s.wallId);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    startWall();
  }, []);
  if (!r) return null;
  const w = wallId ? currentWall() : undefined;
  return (
    <ModalFrame label="Share on the Family Wall" onClose={close} width={620}>
      <h2 className="h2">Share “{r.title}” on the Family Wall</h2>
      {mode === 'loading' && <p className="muted">Opening the Family Wall…</p>}
      {(mode === 'off' || mode === 'connect' || mode === 'error') && (
        <p style={{ margin: 0 }}>
          The Family Wall isn’t connected yet, so the recipe can’t be shared. It’s safe in your family cookbook. {mode === 'connect' && 'Open Home to sign in to the wall first.'}
        </p>
      )}
      {mode === 'ready' && w && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Posting to <span className="strong">{w.name}</span>. Everyone on the wall can read the recipe and save a copy to their own cookbook.
          </p>
          <div className="wall-recipe">
            <span className="h3">{r.title}</span>
            <span className="small">
              {[whoseRecipe(T, r) && whoseRecipe(T, r) + '’s recipe', `${lines(r.ingredients).length} ingredients`, `${lines(r.method).length} steps`].filter(Boolean).join(' · ')}
            </span>
          </div>
          <label className="fl">
            Add a message <span className="muted">(optional)</span>
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Finally wrote down Nan’s pudding!" />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Only the recipe’s words are shared — not its photos or anything else from your tree.
          </p>
        </>
      )}
      <div className="mfoot">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        {mode === 'connect' && (
          <button
            className="btn primary"
            onClick={() => {
              close();
              setUi({ section: 'wall' });
            }}
          >
            Go to Home
          </button>
        )}
        {mode === 'ready' && w && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await sendPost({
                type: 'recipe',
                body,
                photo: null,
                photoAlt: '',
                life: { type: '', date: '', place: '' },
                suggestForTree: false,
                recipe: toWallRecipe(T, r),
                tags: r.people.filter((p) => T.person[p]).map((p) => ({ id: p, name: T.nm(p) })),
              });
              setBusy(false);
              if (ok) close();
            }}
          >
            <Icon name="recipe" sm />
            {busy ? 'Sharing…' : 'Share recipe'}
          </button>
        )}
      </div>
    </ModalFrame>
  );
}

/** A recipe inside a wall post. */
export function WallRecipeCard({ p }: { p: WallPost }) {
  const data = useData((s) => s.data);
  const [open, setOpen] = useState(false);
  const x = p.recipe;
  if (!x) return null;
  const saved = inCookbook(data, x);
  const ings = lines(x.ingredients);
  const steps = lines(x.method);
  return (
    <div className="wall-recipe">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span className="recipe-noimg" style={{ width: 52, height: 52, aspectRatio: 'auto', borderRadius: 10, flex: 'none' }} aria-hidden="true">
          <Icon name="recipe" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="h3">{x.title}</div>
          <div className="small">{[x.whose && x.whose + '’s recipe', x.category, x.date, x.time].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {x.story && !open && (
        <p className="small" style={{ margin: 0, fontStyle: 'italic' }}>
          {x.story}
        </p>
      )}
      {open && (
        <>
          {x.story && <blockquote className="recipe-story">{x.story}</blockquote>}
          {x.servings && (
            <div>
              <span className="strong">Makes</span> {x.servings}
            </div>
          )}
          <div className="recipe-cols">
            <div>
              <div className="strong">Ingredients</div>
              <ul className="recipe-ings">
                {ings.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="strong">Method</div>
              <ol className="recipe-steps">
                {steps.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
      <div className="row">
        <button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide the recipe' : 'Show the recipe'}
        </button>
        {saved ? (
          <span className="small muted">✓ In your family cookbook</span>
        ) : (
          <button className="btn sm primary" onClick={() => setUi({ modal: { kind: 'editRecipe', draft: fromWallRecipe(data, x, p) } })}>
            Save to my cookbook
          </button>
        )}
      </div>
    </div>
  );
}
