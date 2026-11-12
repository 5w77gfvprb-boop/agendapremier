-- Agenda v2.1: correções de uso (nada fica sem saída).
-- • Concluído deixa de ocupar horário (o que terminou não trava a agenda; editar um concluído nunca dá conflito).
-- • Cancelado e faltou podem ser reagendados pela edição (em outro horário).
-- • Desfazer conclusão, reabrir remarcação desfeita e EXCLUIR de vez (desfazendo a remarcação, se for o caso).
-- • Contatos para retornar (ligou e ficou de agendar).
-- Rode depois do 0001 e do 0002. Pode rodar de novo.

alter table public.agendamentos drop constraint if exists agend_mecanico_sem_conflito;
alter table public.agendamentos add constraint agend_mecanico_sem_conflito
  exclude using gist (mecanico_id with =, periodo with &&) where (mecanico_id is not null and status not in ('cancelado', 'faltou', 'remarcado', 'pausado', 'concluido'));
alter table public.agendamentos drop constraint if exists agend_local_sem_conflito;
alter table public.agendamentos add constraint agend_local_sem_conflito
  exclude using gist (local_id with =, periodo with &&) where (local_id is not null and status not in ('cancelado', 'faltou', 'remarcado', 'pausado', 'concluido'));

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
     and a.status not in ('cancelado', 'faltou', 'remarcado', 'pausado', 'concluido')
     and a.periodo && tstzrange(p_inicio, p_fim, '[)')
     and ((p_mecanico is not null and a.mecanico_id = p_mecanico) or (p_local is not null and a.local_id = p_local))
$$;

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
    if v_antigo.status = 'remarcado' then raise exception 'Este agendamento foi remarcado: edite o novo horário.'; end if;
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
        raise exception 'A placa % está no cadastro de %. Escolha esse cliente ou, se o carro mudou de dono, apague a placa do cadastro dele em Clientes.', v_placa, (select c.nome from public.veiculos v join public.clientes c on c.id = v.cliente_id where v.id = v_vei);
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
  -- concluído não ocupa mais horário: editar (valor, serviços, dados) não esbarra em ninguém
  if coalesce(v_antigo.status, '') <> 'concluido' then
    v_msg := public.descrever_conflito(v_id, v_mec, v_loc, v_ini, v_ocupa_fim);
    if v_msg is not null then raise exception 'Horário ocupado: %.', v_msg; end if;
  end if;

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
      -- retomar o que aguardava peça, ou reagendar o que foi cancelado / faltou
      status = case when status in ('pausado', 'cancelado', 'faltou') then 'agendado' else status end
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
-- De concluído para "em andamento" = desfazer a conclusão (o horário volta a ocupar).
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
  if a.status = 'remarcado' and a.remarcado_para is not null then raise exception 'Este agendamento foi remarcado: mexa no novo horário.'; end if;

  if p_status = 'em_andamento' and a.status = 'concluido' then
    v_msg := public.descrever_conflito(a.id, a.mecanico_id, a.local_id, a.inicio, a.fim);
    if v_msg is not null then raise exception 'Não dá para desfazer a conclusão: %.', v_msg; end if;
    update public.agendamentos set status = 'em_andamento', fim_real = null, checklist = null, conferido_por = null,
      entregue_em = null, atualizado_em = now()
    where id = p_id;
  elsif p_status in ('agendado', 'confirmado') and a.status in ('cancelado', 'faltou', 'concluido', 'pausado', 'remarcado') then
    -- reabrir no mesmo horário: precisa estar livre (senão, Editar e escolher outro)
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

-- Excluir de vez (lançou errado, duplicou, teste). Se era a remarcação de outro, o antigo volta
-- para "agendado" (se o horário dele ainda estiver livre) ou fica "cancelado".
-- Devolve os caminhos das fotos para a tela apagar os arquivos.
create or replace function public.excluir_agendamento(p_id uuid) returns text[]
language plpgsql as $$
declare a public.agendamentos%rowtype; o public.agendamentos%rowtype; v_fotos text[];
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  select coalesce(array_agg(path), array[]::text[]) into v_fotos from public.fotos where agendamento_id = p_id;
  delete from public.agendamentos where id = p_id;
  if a.remarcado_de is not null then
    select * into o from public.agendamentos where id = a.remarcado_de for update;
    if found and o.status = 'remarcado' then
      update public.agendamentos set remarcado_para = null,
        status = case when public.descrever_conflito(o.id, o.mecanico_id, o.local_id, o.inicio, coalesce(o.fim_previsto, o.fim)) is null then 'agendado' else 'cancelado' end,
        atualizado_em = now()
      where id = o.id;
    end if;
  end if;
  return v_fotos;
end $$;

-- Cadastro em dobro: passa veículos e agendamentos de um cliente para o outro e apaga o repetido
create or replace function public.juntar_clientes(p_manter uuid, p_apagar uuid) returns void
language plpgsql as $$
begin
  if p_manter = p_apagar then raise exception 'Escolha dois cadastros diferentes.'; end if;
  if not exists (select 1 from public.clientes where id = p_manter) or not exists (select 1 from public.clientes where id = p_apagar) then
    raise exception 'Cliente não encontrado.';
  end if;
  update public.veiculos set cliente_id = p_manter where cliente_id = p_apagar;
  update public.agendamentos set cliente_id = p_manter where cliente_id = p_apagar;
  update public.clientes k set
    telefone = coalesce(k.telefone, (select telefone from public.clientes where id = p_apagar)),
    observacoes = nullif(concat_ws(' · ', k.observacoes, (select observacoes from public.clientes where id = p_apagar)), '')
  where k.id = p_manter;
  delete from public.clientes where id = p_apagar;
end $$;

-- Contatos para retornar: cliente ligou, ficou de agendar e não agendou
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  telefone text,
  interesse text,                                 -- o que ele quer (ex.: alinhamento, barulho na suspensão)
  observacoes text,
  lembrar_em date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  status text not null default 'aberto' check (status in ('aberto', 'agendado', 'desistiu')),
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists contatos_aberto_idx on public.contatos (lembrar_em) where status = 'aberto';
alter table public.contatos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contatos' and policyname = 'autenticado') then
    create policy autenticado on public.contatos for all to authenticated using (true) with check (true);
  end if;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
