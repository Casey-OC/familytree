import { describe, expect, it } from 'vitest';
import { sampleTree } from '../lib/sample';
import { treeApi } from '../lib/family';
import { mergeInto } from '../lib/merge';
import { newSqlJsDb } from '../data/sqljsDb';
import { migrate } from '../data/db';
import { loadTree, SqlLog } from '../data/repo';
import { lines, recipeMatches, recipesOf, whoseRecipe } from '../features/recipes/Recipes';
import { fromWallRecipe, inCookbook, toWallRecipe } from '../features/wall/ShareRecipe';

describe('family recipes', () => {
  it('saves and loads recipes with their people and photos', async () => {
    const db = await newSqlJsDb();
    await migrate(db);
    const d = sampleTree();
    d.recipes[0].mediaIds = ['m13'];
    const sql = new SqlLog(false);
    sql.all(d);
    await db.batch(sql.stmts);
    const back = await loadTree(db);
    expect(back.recipes).toHaveLength(d.recipes.length);
    const r = back.recipes.find((x) => x.id === 'r2')!;
    expect(r).toMatchObject({ title: 'Nan’s Christmas pudding', people: ['p6', 'p10'], category: 'Christmas', servings: '10' });
    expect(back.recipes.find((x) => x.id === 'r1')!.mediaIds).toEqual(['m13']);
    expect(lines(r.method).length).toBe(5);
  });

  it('finds recipes by name, ingredient or cook', () => {
    const d = sampleTree();
    const T = treeApi(d);
    const pud = d.recipes.find((r) => r.id === 'r2')!;
    expect(recipeMatches(T, pud, 'brandy')).toBe(true);
    expect(recipeMatches(T, pud, 'florence pudding')).toBe(true);
    expect(recipeMatches(T, pud, 'coconut')).toBe(false);
    expect(whoseRecipe(T, pud)).toMatch(/ and /);
    expect(recipesOf(d, 'p10').map((r) => r.id)).toEqual(['r2']);
  });

  it('moves recipes across when two people are merged', () => {
    const d = sampleTree();
    const mary = d.people.find((p) => p.id === 'p6')!;
    d.people.push({ ...mary, id: 'dup', profileId: 'dup' });
    d.recipes.push({ ...d.recipes[0], id: 'r9', people: ['dup', 'p6'] });
    const r = mergeInto(d, 'p6', 'dup');
    expect(r.changedRecipes).toEqual(['r9']);
    expect(d.recipes.find((x) => x.id === 'r9')!.people).toEqual(['p6']);
  });

  it('shares to the wall and saves back to a cookbook, matching the cook by name', () => {
    const d = sampleTree();
    const T = treeApi(d);
    const w = toWallRecipe(T, d.recipes.find((r) => r.id === 'r3')!);
    expect(w.whose).toBe(T.short('p14'));
    expect(inCookbook(d, w)).toBe(true);
    const draft = fromWallRecipe(d, { ...w, title: 'Something new', whose: 'Joan Ellis' }, { authorName: 'Susan Kerr', tags: [] });
    expect(draft.people).toEqual(['p13']);
    expect(draft.sharedBy).toBe('Susan Kerr on the Family Wall');
    expect(inCookbook(d, { ...w, title: 'Something new' })).toBe(false);
  });
});
