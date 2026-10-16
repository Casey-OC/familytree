-- Family Wall: recipe posts.
-- Lets family share a recipe on the wall. The recipe travels inside the post, so anyone on the
-- wall can save a copy to their own family cookbook. Safe to run more than once.

alter table public.posts add column if not exists recipe jsonb;
-- { "title": "...", "whose": "...", "category": "...", "servings": "...", "time": "...",
--   "ingredients": "...", "method": "...", "story": "...", "date": "..." }

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check check (type in ('text', 'photo', 'life', 'recipe'));

-- A recipe post must carry a recipe with a title; other posts carry none. Keep recipes a sensible size.
alter table public.posts drop constraint if exists posts_recipe_check;
alter table public.posts add constraint posts_recipe_check check (
  (type = 'recipe') = (recipe is not null)
  and (recipe is null or (jsonb_typeof(recipe) = 'object' and length(coalesce(recipe->>'title', '')) between 1 and 200 and octet_length(recipe::text) <= 40000))
);
