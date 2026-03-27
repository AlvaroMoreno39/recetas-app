## Supabase Setup (Recetas App)

Ejecuta este SQL en Supabase (SQL Editor):

```sql
create table if not exists public.recipes_state (
  id text primary key,
  recipes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.recipes_state enable row level security;

drop policy if exists "read_recipes_state" on public.recipes_state;
create policy "read_recipes_state"
on public.recipes_state
for select
to anon
using (true);

drop policy if exists "write_recipes_state" on public.recipes_state;
create policy "write_recipes_state"
on public.recipes_state
for insert
to anon
with check (true);

drop policy if exists "update_recipes_state" on public.recipes_state;
create policy "update_recipes_state"
on public.recipes_state
for update
to anon
using (true)
with check (true);
```

Luego edita `assets/js/backend.config.js`:

- `url`: URL del proyecto Supabase
- `anonKey`: clave `anon public`

Con eso, la app sincroniza recetas en la nube y en local.

