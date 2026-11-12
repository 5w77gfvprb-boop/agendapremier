-- Agenda v2: serviço de vários dias, pátio (chegou / aguardando peça / pronto / entregue),
-- checklist de entrega, fotos de cada carro e "recebi" nos finalizados.
-- Rode depois do 0001. Pode rodar de novo sem estragar nada.

alter table public.agendamentos add column if not exists chegou_em timestamptz;
alter table public.agendamentos add column if not exists entregue_em timestamptz;
alter table public.agendamentos add column if not exists teve_pausa boolean not null default false;
alter table public.agendamentos add column if not exists checklist jsonb;
alter table public.agendamentos add column if not exists conferido_por text;

-- nova situação: "pausado" = aguardando peça (libera mecânico e elevador; o carro continua no pátio)
alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos add constraint agendamentos_status_check
  check (status in ('agendado', 'confirmado', 'em_andamento', 'pausado', 'concluido', 'cancelado', 'faltou', 'remarcado'));
alter table public.agendamentos drop constraint if exists agend_mecanico_sem_conflito;
alter table public.agendamentos add constraint agend_mecanico_sem_conflito
  exclude using gist (mecanico_id with =, periodo with &&) where (mecanico_id is not null and status not in ('cancelado', 'faltou', 'remarcado', 'pausado'));
alter table public.agendamentos drop constraint if exists agend_local_sem_conflito;
alter table public.agendamentos add constraint agend_local_sem_conflito
  exclude using gist (local_id with =, periodo with &&) where (local_id is not null and status not in ('cancelado', 'faltou', 'remarcado', 'pausado'));

-- Checklist de entrega (editável em Ajustes)
create table if not exists public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(trim(texto)) > 0),
  ordem int not null default 0,
  ativo boolean not null default true
);
insert into public.checklist_itens (texto, ordem)
select x.texto, x.ordem from (values
  ('Ferramentas retiradas de dentro do carro', 1),
  ('Serviço feito e conferido', 2),
  ('Rodas e parafusos reapertados', 3),
  ('Carro testado (rodou e freou normal)', 4),
  ('Carro sem graxa ou sujeira', 5)) as x(texto, ordem)
where not exists (select 1 from public.checklist_itens);

-- Fotos de cada carro (arquivo no Storage, bucket "fotos")
create table if not exists public.fotos (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  path text not null unique,
  criado_em timestamptz not null default now()
);
create index if not exists fotos_agendamento_idx on public.fotos (agendamento_id);

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fotos_autenticado') then
      create policy fotos_autenticado on storage.objects for all to authenticated
        using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
    end if;
  end if;
end $$;

-- Quem ocupa o mecânico/local (aguardando peça não ocupa)
create or replace function public.descrever_conflito(p_id uuid, p_mecanico uuid, p_local uuid, p_inicio timestamptz, p_fim timestamptz)
returns text language sql stable as $$
  select string_agg(
           case when a.mecanico_id = p_mecanico then 'o mecânico ' || m.nome when l.tipo = 'rampa' then 'a ' || l.nome else 'o ' || l.nome end
           || ' já está com ' || coalesce(nullif(c.nome, ''), a.titulo, 'um bloqueio')
           || ' das ' || to_char(public.hora_local(a.inicio), 'HH24:MI') || ' às ' || to_char(public.hora_local(a.fim), 'HH24:MI'),
           '; ' order by a.inicio)
    from public.agendamentos a
    left join public.clientes c on c.id = a.cliente_id
    left join public.mecanicos m on m.id = a.mecanico_id
    left join public.locais l on l.id = a.local_id
   where a.id is distinct from p_id
     and a.status not in ('cancelado', 'faltou', 'remarcado', 'pausado')
     and a.periodo && tstzrange(p_inicio, p_fim, '[)')
     and ((p_mecanico is not null and a.mecanico_id = p_mecanico) or (p_local is not null and a.local_id = p_local))
$$;

-- Soma minutos de TRABALHO a partir de um instante: pula almoço, noite, dias fechados e feriados.
create or replace function public.somar_expediente(p_ini timestamptz, p_min int) returns timestamptz
language plpgsql stable as $$
declare
  t timestamp := public.hora_local(p_ini); falta int := p_min; d date; h public.horarios%rowtype;
  segs time[]; i int; s timestamp; e timestamp; dur int; guarda int := 0;
begin
  if p_min <= 0 then return p_ini; end if;
  loop
    guarda := guarda + 1;
    if guarda > 400 then raise exception 'Não há expediente suficiente para esse serviço (confira o horário de funcionamento).'; end if;
    d := t::date;
    select * into h from public.horarios where dia_semana = extract(dow from d)::int;
    if found and h.aberto and not exists (select 1 from public.folgas where dia = d) then
      segs := case when h.almoco_ini is not null then array[h.abre, h.almoco_ini, h.almoco_fim, h.fecha] else array[h.abre, h.fecha] end;
      i := 1;
      while i < array_length(segs, 1) loop
        s := greatest(t, d + segs[i]); e := d + segs[i + 1];
        if s < e then
          dur := (extract(epoch from (e - s)) / 60)::int;
          if falta <= dur then return (s + make_interval(mins => falta)) at time zone 'America/Sao_Paulo'; end if;
          falta := falta - dur;
        end if;
        i := i + 2;
      end loop;
    end if;
    t := (d + 1)::timestamp;
  end loop;
end $$;

-- Agora só o INÍCIO precisa cair no expediente (o fim é calculado pulando o que estiver fechado)
create or replace function public.fora_do_expediente(p_inicio timestamptz, p_fim timestamptz) returns text
language plpgsql stable as $$
declare li timestamp := public.hora_local(p_inicio); h public.horarios%rowtype; f public.folgas%rowtype;
begin
  select * into f from public.folgas where dia = li::date;
  if found then return 'dia sem expediente' || coalesce(' (' || f.motivo || ')', ''); end if;
  select * into h from public.horarios where dia_semana = extract(dow from li)::int;
  if not found or not h.aberto then return 'a oficina não abre nesse dia'; end if;
  if li::time < h.abre or li::time >= h.fecha then
    return 'fora do horário (' || to_char(h.abre, 'HH24:MI') || ' às ' || to_char(h.fecha, 'HH24:MI') || ')';
  end if;
  if h.almoco_ini is not null and li::time >= h.almoco_ini and li::time < h.almoco_fim then
    return 'no horário de almoço (' || to_char(h.almoco_ini, 'HH24:MI') || ' às ' || to_char(h.almoco_fim, 'HH24:MI') || ')';
  end if;
  return null;
end $$;

create or replace function public.salvar_agendamento(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_tipo text := coalesce(nullif(p->>'tipo', ''), 'servico');
  v_cli uuid := nullif(p->>'cliente_id', '')::uuid;
  v_vei uuid := nullif(p->>'veiculo_id', '')::uuid;
  v_placa text := public.placa_limpa(p->>'placa');
  v_mec uuid := nullif(p->>'mecanico_id', '')::uuid;
  v_loc uuid := nullif(p->>'local_id', '')::uuid;
  v_ini timestamptz := (p->>'inicio')::timestamptz;
  v_fim timestamptz := nullif(p->>'fim', '')::timestamptz;
  v_de uuid := nullif(p->>'remarcar_de', '')::uuid;
  v_dur int; v_valor numeric; v_precisa text; v_tipo_loc text; v_msg text; v_fora text;
  v_antigo public.agendamentos%rowtype; v_orig public.agendamentos%rowtype; it jsonb; v_ord int := 0; v_ocupa_fim timestamptz;
begin
  if v_ini is null then raise exception 'Informe a data e a hora.'; end if;
  if v_tipo not in ('servico', 'bloqueio') then raise exception 'Tipo inválido.'; end if;
  if v_id is not null then
    select * into v_antigo from public.agendamentos where id = v_id for update;
    if not found then raise exception 'Agendamento não encontrado.'; end if;
    if v_antigo.status in ('cancelado', 'faltou', 'remarcado') then raise exception 'Este agendamento está %: reabra antes de editar.', v_antigo.status; end if;
  end if;
  if v_de is not null then
    if v_id is not null then raise exception 'Remarcar cria um agendamento novo.'; end if;
    select * into v_orig from public.agendamentos where id = v_de for update;
    if not found then raise exception 'Agendamento a remarcar não encontrado.'; end if;
    if v_orig.status not in ('agendado', 'confirmado', 'faltou') then raise exception 'Só dá para remarcar o que ainda não foi feito.'; end if;
    -- libera o horário antigo antes de conferir o novo (pode ser o mesmo mecânico/local mais tarde)
    update public.agendamentos set status = 'remarcado', atualizado_em = now() where id = v_de;
  end if;

  if v_tipo = 'servico' then
    if jsonb_typeof(p->'itens') <> 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'Escolha pelo menos um serviço.'; end if;
    if v_mec is null then raise exception 'Escolha o mecânico.'; end if;
    if coalesce(p->>'espera', '') not in ('aguarda', 'deixa') then raise exception 'Diga se o cliente aguarda ou deixa o carro.'; end if;
    if coalesce(p->>'seguradora', '') not in ('porto', 'azul', 'itau', 'particular') then raise exception 'Escolha a seguradora (ou particular).'; end if;
    -- elevador vence rampa: se algum serviço precisa de elevador, o carro vai para um elevador
    select sum((x->>'duracao_min')::int), sum(coalesce((x->>'preco')::numeric, 0)),
           case when bool_or(coalesce(case when s.id is not null then s.local_tipo else x->>'local_tipo' end, '') = 'elevador') then 'elevador'
                when bool_or(coalesce(case when s.id is not null then s.local_tipo else x->>'local_tipo' end, '') = 'rampa') then 'rampa' end
      into v_dur, v_valor, v_precisa
      from jsonb_array_elements(p->'itens') x left join public.servicos s on s.id = nullif(x->>'servico_id', '')::uuid;
    if v_dur is null or v_dur <= 0 then raise exception 'Os serviços precisam ter duração.'; end if;
    if v_precisa is not null then
      if v_loc is null then raise exception 'Este serviço precisa de %: escolha qual.', case v_precisa when 'rampa' then 'rampa' else 'elevador' end; end if;
      select tipo into v_tipo_loc from public.locais where id = v_loc;
      if v_precisa = 'elevador' and v_tipo_loc <> 'elevador' then raise exception 'Este serviço precisa de elevador, não da rampa.'; end if;
    end if;
    -- o fim pula a noite, o almoço, fins de semana e feriados (serviço de vários dias)
    if v_fim is null then
      v_fim := case when coalesce((p->>'encaixe')::boolean, false) then v_ini + make_interval(mins => v_dur) else public.somar_expediente(v_ini, v_dur) end;
    end if;

    -- cliente: o escolhido, ou cadastra pelo nome
    if v_cli is null then
      if coalesce(trim(p->>'cliente_nome'), '') = '' then raise exception 'Informe o cliente.'; end if;
      if v_placa is not null then select cliente_id, id into v_cli, v_vei from public.veiculos where placa = v_placa; end if;   -- dono da placa
      if v_cli is null then
        insert into public.clientes (nome, telefone, seguradora)
        values (regexp_replace(trim(p->>'cliente_nome'), '\s+', ' ', 'g'), nullif(trim(p->>'telefone'), ''), p->>'seguradora')
        returning id into v_cli;
      end if;
    end if;
    if v_vei is null and v_placa is not null then
      if length(v_placa) <> 7 then raise exception 'Placa inválida: %.', p->>'placa'; end if;
      select id into v_vei from public.veiculos where placa = v_placa;
      if v_vei is null then
        insert into public.veiculos (cliente_id, placa, modelo) values (v_cli, v_placa, nullif(trim(p->>'modelo'), '')) returning id into v_vei;
      elsif (select cliente_id from public.veiculos where id = v_vei) <> v_cli then
        raise exception 'A placa % já é de outro cliente: escolha esse cliente ou corrija a placa.', v_placa;
      end if;
    end if;
  else
    if v_fim is null then raise exception 'Informe até que horas vai o bloqueio.'; end if;
    if v_mec is null and v_loc is null then raise exception 'Escolha o mecânico ou o elevador/rampa que fica bloqueado.'; end if;
    v_valor := 0;
  end if;

  if v_fim <= v_ini then raise exception 'O fim precisa ser depois do início.'; end if;
  -- concluído editado: continua ocupando só até a hora em que terminou de verdade
  v_ocupa_fim := case when v_antigo.status = 'concluido' and v_antigo.fim_real > v_ini and v_antigo.fim_real < v_fim then v_antigo.fim_real else v_fim end;
  if not coalesce((p->>'encaixe')::boolean, false) and coalesce(v_antigo.status, '') <> 'concluido' then
    v_fora := public.fora_do_expediente(v_ini, v_fim);
    if v_fora is not null then raise exception 'Horário %: marque como encaixe se quiser mesmo assim.', v_fora; end if;
  end if;
  v_msg := public.descrever_conflito(v_id, v_mec, v_loc, v_ini, v_ocupa_fim);
  if v_msg is not null then raise exception 'Horário ocupado: %.', v_msg; end if;

  if v_id is null then
    insert into public.agendamentos (tipo, titulo, cliente_id, veiculo_id, seguradora, sinistro, mecanico_id, local_id, inicio, fim, fim_previsto,
                                     espera, entrega_prevista, valor_total, observacoes, remarcado_de)
    values (v_tipo, nullif(trim(p->>'titulo'), ''), v_cli, v_vei, case when v_tipo = 'servico' then p->>'seguradora' end, nullif(trim(p->>'sinistro'), ''),
            v_mec, v_loc, v_ini, v_fim, v_fim, case when v_tipo = 'servico' then p->>'espera' end,
            case when v_tipo = 'servico' and p->>'espera' = 'deixa' then coalesce(nullif(p->>'entrega_prevista', '')::timestamptz, v_fim) end,
            v_valor, nullif(trim(p->>'observacoes'), ''), v_de)
    returning id into v_id;
    if v_de is not null then update public.agendamentos set remarcado_para = v_id where id = v_de; end if;
  else
    update public.agendamentos set tipo = v_tipo, titulo = nullif(trim(p->>'titulo'), ''), cliente_id = v_cli, veiculo_id = v_vei,
      seguradora = case when v_tipo = 'servico' then p->>'seguradora' end, sinistro = nullif(trim(p->>'sinistro'), ''),
      mecanico_id = v_mec, local_id = v_loc, inicio = v_ini, fim = v_ocupa_fim, fim_previsto = v_fim,
      espera = case when v_tipo = 'servico' then p->>'espera' end,
      entrega_prevista = case when v_tipo = 'servico' and p->>'espera' = 'deixa' then coalesce(nullif(p->>'entrega_prevista', '')::timestamptz, v_fim) end,
      valor_total = v_valor, observacoes = nullif(trim(p->>'observacoes'), ''), atualizado_em = now(),
      status = case when status = 'pausado' then 'agendado' else status end   -- retomar o que estava aguardando peça
    where id = v_id;
    delete from public.agendamento_itens where agendamento_id = v_id;
  end if;

  if v_tipo = 'servico' then
    for it in select * from jsonb_array_elements(p->'itens') loop
      insert into public.agendamento_itens (agendamento_id, servico_id, descricao, duracao_min, preco, ordem)
      values (v_id, nullif(it->>'servico_id', '')::uuid, coalesce(nullif(trim(it->>'descricao'), ''), 'Serviço'),
              (it->>'duracao_min')::int, round(coalesce((it->>'preco')::numeric, 0), 2), v_ord);
      v_ord := v_ord + 1;
    end loop;
  end if;
  return v_id;
exception
  when exclusion_violation then
    -- duas pessoas marcando o mesmo horário ao mesmo tempo: a segunda cai aqui
    raise exception 'Horário ocupado: alguém acabou de marcar esse mecânico ou elevador nesse horário. Atualize a agenda.';
end $$;

-- Muda a situação. "pausado" = aguardando peça. Concluir é pela função concluir (com checklist).
create or replace function public.mudar_status(p_id uuid, p_status text) returns void
language plpgsql as $$
declare a public.agendamentos%rowtype; v_agora timestamptz := now(); v_msg text;
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if p_status not in ('agendado', 'confirmado', 'em_andamento', 'pausado', 'cancelado', 'faltou') then
    raise exception '%', case when p_status = 'concluido' then 'Para concluir, preencha o checklist de entrega.' else 'Situação inválida.' end;
  end if;
  if a.tipo = 'bloqueio' and p_status not in ('agendado', 'cancelado') then raise exception 'Bloqueio só pode ser mantido ou cancelado.'; end if;
  if a.status = 'remarcado' then raise exception 'Este agendamento foi remarcado: mexa no novo horário.'; end if;
  if p_status in ('agendado', 'confirmado') and a.status in ('cancelado', 'faltou', 'concluido', 'pausado') then
    -- reabrir: volta a ocupar o horário inteiro, então precisa estar livre
    v_msg := public.descrever_conflito(a.id, a.mecanico_id, a.local_id, a.inicio, coalesce(a.fim_previsto, a.fim));
    if v_msg is not null then raise exception 'Não dá para reabrir nesse horário: %. Use Editar para escolher outro.', v_msg; end if;
    update public.agendamentos set status = p_status, fim = coalesce(fim_previsto, fim),
      fim_real = case when a.status = 'concluido' then null else fim_real end,
      entregue_em = case when a.status = 'concluido' then null else entregue_em end, atualizado_em = now()
    where id = p_id;
  elsif p_status = 'em_andamento' then
    if a.status not in ('agendado', 'confirmado') then raise exception 'Só dá para começar o que está agendado.'; end if;
    update public.agendamentos set status = p_status, inicio_real = coalesce(inicio_real, v_agora), chegou_em = coalesce(chegou_em, v_agora), atualizado_em = now() where id = p_id;
  elsif p_status = 'pausado' then
    if a.status not in ('agendado', 'confirmado', 'em_andamento') then raise exception 'Só dá para pausar o que ainda não terminou.'; end if;
    update public.agendamentos set status = 'pausado', teve_pausa = true, chegou_em = coalesce(chegou_em, v_agora), atualizado_em = now() where id = p_id;
  else
    update public.agendamentos set status = p_status, atualizado_em = now() where id = p_id;
  end if;
end $$;

-- Concluir: todos os itens do checklist marcados + quem conferiu. Concluir antes do fim libera o resto do horário.
-- Cliente que aguarda leva o carro na hora (entregue); quem deixou o carro fica "pronto para retirar" no pátio.
create or replace function public.concluir(p_id uuid, p_marcados uuid[], p_conferido text) returns void
language plpgsql as $$
declare a public.agendamentos%rowtype; v_agora timestamptz := now(); v_falta text; v_lista jsonb;
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if a.tipo <> 'servico' then raise exception 'Bloqueio não se conclui.'; end if;
  if a.status not in ('agendado', 'confirmado', 'em_andamento', 'pausado') then raise exception 'Este agendamento está %.', a.status; end if;
  select string_agg(texto, '; ' order by ordem) into v_falta
    from public.checklist_itens where ativo and not (id = any(coalesce(p_marcados, array[]::uuid[])));
  if v_falta is not null then raise exception 'Falta marcar no checklist: %.', v_falta; end if;
  if coalesce(trim(p_conferido), '') = '' and exists (select 1 from public.checklist_itens where ativo) then
    raise exception 'Diga quem conferiu o carro.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('texto', texto, 'ok', true) order by ordem), '[]'::jsonb) into v_lista
    from public.checklist_itens where ativo;
  update public.agendamentos set status = 'concluido', checklist = v_lista, conferido_por = nullif(trim(p_conferido), ''),
    inicio_real = coalesce(inicio_real, least(v_agora, inicio)), fim_real = v_agora, chegou_em = coalesce(chegou_em, least(v_agora, inicio)),
    fim = case when v_agora > inicio and v_agora < fim then v_agora else fim end,
    entregue_em = case when espera = 'aguarda' then v_agora else entregue_em end, atualizado_em = now()
  where id = p_id;
end $$;

-- Pátio: chegou / entregue (com desfazer)
create or replace function public.marcar_chegada(p_id uuid, p_chegou boolean) returns void
language plpgsql as $$
begin
  update public.agendamentos set chegou_em = case when p_chegou then coalesce(chegou_em, now()) end, atualizado_em = now()
   where id = p_id and tipo = 'servico';
  if not found then raise exception 'Agendamento não encontrado.'; end if;
end $$;
create or replace function public.marcar_entregue(p_id uuid, p_entregue boolean) returns void
language plpgsql as $$
begin
  if p_entregue and not exists (select 1 from public.agendamentos where id = p_id and status = 'concluido') then
    raise exception 'Conclua o serviço (com o checklist) antes de entregar o carro.';
  end if;
  update public.agendamentos set entregue_em = case when p_entregue then coalesce(entregue_em, now()) end, atualizado_em = now() where id = p_id;
end $$;

-- Finalizados: "recebi" tira da lista; dá para desfazer
create or replace function public.marcar_recebido(p_id uuid, p_recebido boolean) returns void
language plpgsql as $$
begin
  if not exists (select 1 from public.agendamentos where id = p_id and status = 'concluido') then raise exception 'Só serviços concluídos.'; end if;
  update public.agendamentos set pagamento = case when p_recebido then 'recebido' else 'pendente' end,
    pagamento_data = case when p_recebido then (now() at time zone 'America/Sao_Paulo')::date end, atualizado_em = now()
  where id = p_id;
end $$;

do $$
declare t text;
begin
  foreach t in array array['checklist_itens', 'fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'autenticado') then
      execute format('create policy autenticado on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
