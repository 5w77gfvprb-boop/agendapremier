-- 0005: cortesia da seguradora e controle de confirmação (mensagem enviada / confirmou).
-- Pode rodar de novo sem problema.

alter table public.agendamentos add column if not exists cortesia boolean not null default false;
alter table public.agendamentos add column if not exists confirmado_em timestamptz;          -- quando o cliente confirmou
alter table public.agendamentos add column if not exists confirmacao_enviada_em timestamptz; -- quando mandamos a mensagem de confirmação

-- quem já estava confirmado continua confirmado
update public.agendamentos set confirmado_em = coalesce(atualizado_em, now()) where status = 'confirmado' and confirmado_em is null;

-- Mantém a confirmação certa sozinha:
--  * status "confirmado" grava a hora da confirmação (e ela continua valendo quando o carro chega / começa);
--  * voltar para "agendado" apaga a confirmação;
--  * mudar o dia/hora de um agendamento pede confirmação de novo (o cliente confirmou o horário antigo).
create or replace function public.ag_confirmacao() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.tipo = 'servico' and new.inicio is distinct from old.inicio and new.status in ('agendado', 'confirmado') then
    new.status := 'agendado'; new.confirmado_em := null; new.confirmacao_enviada_em := null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmado' and new.status = 'agendado' then new.confirmado_em := null; end if;
  if new.status = 'confirmado' and new.confirmado_em is null then new.confirmado_em := now(); end if;
  return new;
end $$;
drop trigger if exists ag_confirmacao on public.agendamentos;
create trigger ag_confirmacao before insert or update on public.agendamentos for each row execute function public.ag_confirmacao();

-- p_acao: 'enviada' (mandei a mensagem), 'confirmou' (cliente respondeu que vem), 'desfazer' (tirar a confirmação)
create or replace function public.marcar_confirmacao(p_id uuid, p_acao text) returns void
language plpgsql as $$
declare a public.agendamentos%rowtype;
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if a.tipo <> 'servico' then raise exception 'Bloqueio não tem confirmação.'; end if;
  if p_acao = 'enviada' then
    update public.agendamentos set confirmacao_enviada_em = now() where id = p_id;
  elsif p_acao = 'confirmou' then
    if a.status not in ('agendado', 'confirmado') then raise exception 'Só dá para confirmar o que ainda está agendado.'; end if;
    update public.agendamentos set status = 'confirmado', confirmado_em = coalesce(confirmado_em, now()), atualizado_em = now() where id = p_id;
  elsif p_acao = 'desfazer' then
    update public.agendamentos set status = case when status = 'confirmado' then 'agendado' else status end, confirmado_em = null, atualizado_em = now() where id = p_id;
  else
    raise exception 'Ação inválida.';
  end if;
end $$;

-- salvar_agendamento: igual ao do 0003, agora guardando a cortesia
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
  v_cortesia boolean := v_tipo = 'servico' and coalesce((p->>'cortesia')::boolean, false) and coalesce(p->>'seguradora', 'particular') <> 'particular';
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
                                     espera, entrega_prevista, valor_total, observacoes, remarcado_de, cortesia)
    values (v_tipo, nullif(trim(p->>'titulo'), ''), v_cli, v_vei, case when v_tipo = 'servico' then p->>'seguradora' end, nullif(trim(p->>'sinistro'), ''),
            v_mec, v_loc, v_ini, v_fim, v_fim, case when v_tipo = 'servico' then p->>'espera' end,
            case when v_tipo = 'servico' and p->>'espera' = 'deixa' then coalesce(nullif(p->>'entrega_prevista', '')::timestamptz, v_fim) end,
            v_valor, nullif(trim(p->>'observacoes'), ''), v_de, v_cortesia)
    returning id into v_id;
    if v_de is not null then update public.agendamentos set remarcado_para = v_id where id = v_de; end if;
  else
    update public.agendamentos set tipo = v_tipo, titulo = nullif(trim(p->>'titulo'), ''), cliente_id = v_cli, veiculo_id = v_vei,
      seguradora = case when v_tipo = 'servico' then p->>'seguradora' end, sinistro = nullif(trim(p->>'sinistro'), ''),
      mecanico_id = v_mec, local_id = v_loc, inicio = v_ini, fim = v_ocupa_fim, fim_previsto = v_fim,
      espera = case when v_tipo = 'servico' then p->>'espera' end,
      entrega_prevista = case when v_tipo = 'servico' and p->>'espera' = 'deixa' then coalesce(nullif(p->>'entrega_prevista', '')::timestamptz, v_fim) end,
      valor_total = v_valor, observacoes = nullif(trim(p->>'observacoes'), ''), cortesia = v_cortesia, atualizado_em = now(),
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

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
