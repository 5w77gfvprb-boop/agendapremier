-- Agenda da oficina (Centro Automotivo Premier).
-- Rode inteiro no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
-- Regra principal: o banco NÃO deixa o mesmo mecânico nem o mesmo elevador/rampa em dois carros ao mesmo tempo.

do $$ begin
  -- no Supabase as extensões ficam no esquema "extensions"
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists btree_gist with schema extensions;
  else
    create extension if not exists btree_gist;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------------------------
create table if not exists public.mecanicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cor text not null default '#2563eb',
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists mecanicos_nome_uq on public.mecanicos (lower(nome));

-- Onde o carro fica: elevador ou rampa de alinhamento
create table if not exists public.locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'elevador' check (tipo in ('elevador', 'rampa')),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create unique index if not exists locais_nome_uq on public.locais (lower(nome));

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  duracao_min int not null check (duracao_min between 5 and 1440),
  preco numeric(12,2) not null default 0 check (preco >= 0),
  local_tipo text default 'elevador' check (local_tipo is null or local_tipo in ('elevador', 'rampa')),   -- null = não ocupa elevador nem rampa
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists servicos_nome_uq on public.servicos (lower(nome));

-- Cadastro inicial (só entra se ainda não existir)
insert into public.locais (nome, tipo, ordem) values
  ('Elevador 1', 'elevador', 1), ('Elevador 2', 'elevador', 2), ('Elevador 3', 'elevador', 3), ('Rampa de alinhamento', 'rampa', 4)
on conflict ((lower(nome))) do nothing;
insert into public.mecanicos (nome, cor, ordem) values ('Eric', '#2563eb', 1), ('Thales', '#16a34a', 2)
on conflict ((lower(nome))) do nothing;
insert into public.servicos (nome, duracao_min, preco, local_tipo) values ('Alinhamento', 30, 0, 'rampa'), ('Balanceamento', 30, 0, 'elevador')
on conflict ((lower(nome))) do nothing;

-- Horário de funcionamento por dia da semana (0 = domingo … 6 = sábado)
create table if not exists public.horarios (
  dia_semana int primary key check (dia_semana between 0 and 6),
  aberto boolean not null default true,
  abre time not null default '08:00',
  fecha time not null default '18:00',
  almoco_ini time,
  almoco_fim time,
  check (fecha > abre),
  check ((almoco_ini is null) = (almoco_fim is null)),
  check (almoco_ini is null or (almoco_fim > almoco_ini and almoco_ini >= abre and almoco_fim <= fecha))
);
insert into public.horarios (dia_semana, aberto, abre, fecha, almoco_ini, almoco_fim) values
  (0, false, '08:00', '12:00', null, null),
  (1, true, '08:00', '18:00', '12:00', '13:00'),
  (2, true, '08:00', '18:00', '12:00', '13:00'),
  (3, true, '08:00', '18:00', '12:00', '13:00'),
  (4, true, '08:00', '18:00', '12:00', '13:00'),
  (5, true, '08:00', '18:00', '12:00', '13:00'),
  (6, false, '08:00', '12:00', null, null)
on conflict (dia_semana) do nothing;

-- Dias sem expediente (feriado, ponte…)
create table if not exists public.folgas (
  dia date primary key,
  motivo text
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  telefone text,
  seguradora text not null default 'particular' check (seguradora in ('porto', 'azul', 'itau', 'particular')),
  observacoes text,
  criado_em timestamptz not null default now()
);
create index if not exists clientes_nome_idx on public.clientes (lower(nome));

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  placa text not null check (placa ~ '^[A-Z0-9]{7}$'),     -- guardada sem traço e em maiúsculas
  modelo text,
  ano text,
  cor text,
  criado_em timestamptz not null default now()
);
create unique index if not exists veiculos_placa_uq on public.veiculos (placa);

-- ---------------------------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------------------------
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'servico' check (tipo in ('servico', 'bloqueio')),
  titulo text,                                   -- para bloqueio (folga do mecânico, elevador em manutenção…)
  cliente_id uuid references public.clientes(id) on delete restrict,
  veiculo_id uuid references public.veiculos(id) on delete set null,
  seguradora text check (seguradora in ('porto', 'azul', 'itau', 'particular')),
  sinistro text,                                 -- nº do sinistro / OS da seguradora
  mecanico_id uuid references public.mecanicos(id) on delete restrict,
  local_id uuid references public.locais(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  fim_previsto timestamptz,                      -- o fim marcado (o "fim" encurta se concluir antes, liberando o horário)
  periodo tstzrange generated always as (tstzrange(inicio, fim, '[)')) stored,
  espera text check (espera in ('aguarda', 'deixa')),
  entrega_prevista timestamptz,
  status text not null default 'agendado' check (status in ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'faltou', 'remarcado')),
  remarcado_de uuid references public.agendamentos(id) on delete set null,
  remarcado_para uuid references public.agendamentos(id) on delete set null,
  -- controle dos finalizados
  nf_status text not null default 'pendente' check (nf_status in ('pendente', 'emitida', 'nao_precisa')),
  nf_numero text,
  nf_data date,
  pagamento text not null default 'pendente' check (pagamento in ('pendente', 'recebido')),
  pagamento_data date,
  forma_pagamento text,
  inicio_real timestamptz,
  fim_real timestamptz,
  valor_total numeric(12,2) not null default 0,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio),
  check (tipo = 'bloqueio' or (cliente_id is not null and mecanico_id is not null and espera is not null and seguradora is not null)),
  check (tipo = 'servico' or mecanico_id is not null or local_id is not null)
);
create index if not exists agendamentos_inicio_idx on public.agendamentos (inicio);
create index if not exists agendamentos_cliente_idx on public.agendamentos (cliente_id);

-- A trava: mesmo mecânico ou mesmo elevador/rampa não podem ter dois horários que se cruzam
-- (cancelados, faltas e remarcados não ocupam). Funciona até com duas pessoas marcando ao mesmo tempo.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agend_mecanico_sem_conflito') then
    alter table public.agendamentos add constraint agend_mecanico_sem_conflito
      exclude using gist (mecanico_id with =, periodo with &&) where (mecanico_id is not null and status not in ('cancelado', 'faltou', 'remarcado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agend_local_sem_conflito') then
    alter table public.agendamentos add constraint agend_local_sem_conflito
      exclude using gist (local_id with =, periodo with &&) where (local_id is not null and status not in ('cancelado', 'faltou', 'remarcado'));
  end if;
end $$;

create table if not exists public.agendamento_itens (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  servico_id uuid references public.servicos(id) on delete set null,
  descricao text not null,
  duracao_min int not null check (duracao_min between 1 and 1440),
  preco numeric(12,2) not null default 0 check (preco >= 0),
  ordem int not null default 0
);
create index if not exists agendamento_itens_ag_idx on public.agendamento_itens (agendamento_id);

-- ---------------------------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------------------------
create or replace function public.placa_limpa(p text) returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- Hora local (Brasil) de um instante
create or replace function public.hora_local(t timestamptz) returns timestamp language sql stable as $$
  select t at time zone 'America/Sao_Paulo'
$$;

-- (salvar, mudar situação, conflito e expediente estão no 0002_patio_fotos.sql)

-- Estica um serviço que está atrasando (só se o horário seguinte estiver livre)
create or replace function public.estender_agendamento(p_id uuid, p_minutos int) returns void
language plpgsql as $$
declare a public.agendamentos%rowtype; v_fim timestamptz; v_msg text;
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if p_minutos is null or p_minutos <= 0 then raise exception 'Informe os minutos.'; end if;
  v_fim := a.fim + make_interval(mins => p_minutos);
  v_msg := public.descrever_conflito(a.id, a.mecanico_id, a.local_id, a.fim, v_fim);
  if v_msg is not null then raise exception 'Não dá para estender: %.', v_msg; end if;
  update public.agendamentos set fim = v_fim, fim_previsto = greatest(coalesce(fim_previsto, fim), v_fim),
    entrega_prevista = case when entrega_prevista is not null and entrega_prevista < v_fim then v_fim else entrega_prevista end,
    atualizado_em = now()
  where id = p_id;
end $$;

-- Controle dos finalizados: nota fiscal e pagamento
create or replace function public.marcar_finalizado(p_id uuid, p_nf_status text, p_nf_numero text, p_nf_data date,
                                                    p_pagamento text, p_pagamento_data date, p_forma text) returns void
language plpgsql as $$
begin
  if not exists (select 1 from public.agendamentos where id = p_id and status = 'concluido') then raise exception 'Só serviços concluídos.'; end if;
  if p_nf_status = 'emitida' and coalesce(trim(p_nf_numero), '') = '' then raise exception 'Informe o número da nota.'; end if;
  update public.agendamentos set
    nf_status = p_nf_status, nf_numero = case when p_nf_status = 'emitida' then trim(p_nf_numero) end,
    nf_data = case when p_nf_status = 'emitida' then coalesce(p_nf_data, (now() at time zone 'America/Sao_Paulo')::date) end,
    pagamento = p_pagamento, pagamento_data = case when p_pagamento = 'recebido' then coalesce(p_pagamento_data, (now() at time zone 'America/Sao_Paulo')::date) end,
    forma_pagamento = case when p_pagamento = 'recebido' then nullif(trim(p_forma), '') end, atualizado_em = now()
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Segurança: só quem faz login usa o sistema
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mecanicos', 'locais', 'servicos', 'horarios', 'folgas', 'clientes', 'veiculos', 'agendamentos', 'agendamento_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'autenticado') then
      execute format('create policy autenticado on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
