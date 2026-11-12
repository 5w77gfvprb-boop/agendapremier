-- 0004: backup (baixar, cópias guardadas, restaurar) e "manter ativo" (evita a pausa do plano grátis).
-- Pode rodar de novo sem problema.

-- =====================================================================
-- BACKUP
-- =====================================================================
create table if not exists public.backup_log (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('download', 'automatico', 'manual', 'antes_de_restaurar', 'restauracao'))
);
alter table public.backup_log enable row level security;
drop policy if exists autenticado on public.backup_log;
create policy autenticado on public.backup_log for all to authenticated using (true) with check (true);

-- Cópias guardadas dentro do próprio banco (protegem de exclusão errada; para proteger de perder o projeto, baixe o arquivo).
create table if not exists public.backups_guardados (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('automatico', 'manual', 'antes_de_restaurar')),
  linhas int not null default 0,
  dados jsonb not null
);
alter table public.backups_guardados enable row level security;
drop policy if exists autenticado on public.backups_guardados;
create policy autenticado on public.backups_guardados for all to authenticated using (true) with check (true);

-- Tabela mínima que o site "cutuca" uma vez por dia para o Supabase não pausar o projeto por falta de uso.
create table if not exists public.ativo (
  id int primary key default 1 check (id = 1),
  nota text not null default 'usada só para manter o projeto ativo'
);
insert into public.ativo (id) values (1) on conflict do nothing;
alter table public.ativo enable row level security;
drop policy if exists leitura_publica on public.ativo;
create policy leitura_publica on public.ativo for select to anon, authenticated using (true);

-- Tabelas que NÃO entram no backup
create or replace function public.tabelas_do_backup() returns text[]
language sql stable as $$
  select coalesce(array_agg(tablename::text order by tablename), '{}') from pg_tables
   where schemaname = 'public' and tablename not in ('backups_guardados', 'backup_log', 'ativo')
$$;

create or replace function public.exportar_backup() returns jsonb
language plpgsql as $$
declare t text; r jsonb := '{}'::jsonb; d jsonb;
begin
  foreach t in array public.tabelas_do_backup() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into d;
    r := r || jsonb_build_object(t, d);
  end loop;
  return jsonb_build_object('sistema', 'agenda-premier', 'versao', 1, 'gerado_em', now(), 'tabelas', r);
end $$;

create or replace function public.salvar_backup(p_tipo text default 'automatico') returns uuid
language plpgsql as $$
declare v_dados jsonb; v_id uuid; v_linhas int;
begin
  v_dados := public.exportar_backup();
  select coalesce(sum(jsonb_array_length(value)), 0)::int into v_linhas from jsonb_each(v_dados->'tabelas');
  insert into public.backups_guardados (tipo, linhas, dados) values (p_tipo, v_linhas, v_dados) returning id into v_id;
  insert into public.backup_log (tipo) values (p_tipo);
  -- guarda as 8 últimas cópias normais e as 3 últimas de segurança
  delete from public.backups_guardados where tipo <> 'antes_de_restaurar' and id not in (
    select id from public.backups_guardados where tipo <> 'antes_de_restaurar' order by criado_em desc limit 8);
  delete from public.backups_guardados where tipo = 'antes_de_restaurar' and id not in (
    select id from public.backups_guardados where tipo = 'antes_de_restaurar' order by criado_em desc limit 3);
  return v_id;
end $$;

create or replace function public.registrar_download_backup() returns void
language sql as $$ insert into public.backup_log (tipo) values ('download') $$;

-- Troca TODOS os dados pelos do backup, numa transação só (se algo falhar, nada muda).
-- Antes, guarda uma cópia do estado atual para dar para voltar atrás.
create or replace function public.restaurar_backup(p_dados jsonb) returns jsonb
language plpgsql as $$
declare
  tabs jsonb := p_dados -> 'tabelas';
  todas text[]; pend text[]; ordem text[] := '{}'; t text; i int; n int; avancou boolean; cols text;
  resumo jsonb := '{}'::jsonb; vazias text[] := '{}';
begin
  if tabs is null or jsonb_typeof(tabs) <> 'object' then raise exception 'Arquivo de backup inválido.'; end if;
  if coalesce(p_dados ->> 'sistema', '') <> 'agenda-premier' then
    raise exception 'Este arquivo não é um backup da Agenda Premier.';
  end if;
  if jsonb_typeof(tabs -> 'mecanicos') <> 'array' or jsonb_array_length(tabs -> 'mecanicos') = 0 then
    raise exception 'Este arquivo não parece ser um backup completo (faltam os mecânicos).';
  end if;
  perform set_config('statement_timeout', '300s', true);

  perform public.salvar_backup('antes_de_restaurar');
  todas := public.tabelas_do_backup();

  -- ordem de gravação: tabelas "pai" antes das "filhas"
  pend := todas;
  while coalesce(array_length(pend, 1), 0) > 0 loop
    avancou := false;
    foreach t in array pend loop
      if not exists (
        select 1 from pg_constraint k
          join pg_class c on c.oid = k.conrelid join pg_class rc on rc.oid = k.confrelid join pg_namespace ns on ns.oid = c.relnamespace
         where k.contype = 'f' and ns.nspname = 'public' and c.relname = t and rc.relname <> t and rc.relname = any (pend)) then
        ordem := ordem || t; pend := array_remove(pend, t); avancou := true;
      end if;
    end loop;
    if not avancou then raise exception 'Dependência circular entre tabelas.'; end if;
  end loop;

  for i in reverse array_length(ordem, 1)..1 loop execute format('delete from public.%I', ordem[i]); end loop;
  foreach t in array ordem loop
    if tabs ? t and jsonb_typeof(tabs -> t) = 'array' then
      -- só as colunas "normais" (a coluna calculada periodo é refeita pelo banco)
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
        from information_schema.columns
       where table_schema = 'public' and table_name = t and is_generated = 'NEVER';
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', t, cols, cols, t)
        using tabs -> t;
      get diagnostics n = row_count;
      resumo := resumo || jsonb_build_object(t, n);
    else
      vazias := vazias || t;
    end if;
  end loop;

  insert into public.backup_log (tipo) values ('restauracao');
  return jsonb_build_object('tabelas', resumo, 'vazias_no_arquivo', to_jsonb(vazias));
end $$;

create or replace function public.restaurar_copia(p_id uuid) returns jsonb
language plpgsql as $$
declare d jsonb;
begin
  select dados into d from public.backups_guardados where id = p_id;
  if d is null then raise exception 'Cópia não encontrada.'; end if;
  return public.restaurar_backup(d);
end $$;

-- Chamada pelo site ao abrir: se a última cópia guardada tem 7 dias ou mais, guarda outra (não precisa de pg_cron).
create or replace function public.backup_se_preciso() returns boolean
language plpgsql as $$
begin
  if exists (select 1 from public.backups_guardados where tipo <> 'antes_de_restaurar' and criado_em > now() - interval '7 days') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('backup_se_preciso'));   -- dois aparelhos abrindo juntos não fazem duas cópias
  if exists (select 1 from public.backups_guardados where tipo <> 'antes_de_restaurar' and criado_em > now() - interval '7 days') then
    return false;
  end if;
  perform public.salvar_backup('automatico');
  return true;
end $$;

-- Também toda semana pelo pg_cron (domingo 03:20 em Brasília), se ele estiver ligado.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('backup_semanal') where exists (select 1 from cron.job where jobname = 'backup_semanal');
    perform cron.schedule('backup_semanal', '20 6 * * 0', $cmd$select public.salvar_backup('automatico')$cmd$);
  end if;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
