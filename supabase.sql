-- CariFlip : synchronisation des profils (à exécuter une fois dans Supabase › SQL Editor).
create table if not exists public.cariflip_families (
  code text primary key,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.cariflip_families enable row level security;
revoke all on public.cariflip_families from anon, authenticated;

create or replace function public.cariflip_get(p_code text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('rev', rev, 'data', data)
  from cariflip_families where code = p_code;
$$;

create or replace function public.cariflip_put(p_code text, p_data jsonb, p_rev bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_rev bigint;
begin
  if length(p_code) < 12 or octet_length(p_data::text) > 1000000 then
    raise exception 'invalid';
  end if;
  if p_rev = 0 then
    insert into cariflip_families(code, data, rev) values (p_code, p_data, 1)
    on conflict (code) do nothing returning rev into new_rev;
  else
    update cariflip_families set data = p_data, rev = rev + 1, updated_at = now()
    where code = p_code and rev = p_rev returning rev into new_rev;
  end if;
  return new_rev;
end $$;

revoke execute on function public.cariflip_get(text), public.cariflip_put(text, jsonb, bigint) from public;
grant execute on function public.cariflip_get(text), public.cariflip_put(text, jsonb, bigint) to anon, authenticated;
