-- 0006: arrastar agendamento no quadro (trocar de elevador/mecânico e de horário).
-- Pode rodar de novo sem problema.

-- Minutos de expediente entre dois instantes (pula noite, almoço, dias fechados e folgas).
create or replace function public.minutos_uteis(p_ini timestamptz, p_fim timestamptz) returns int
language plpgsql stable as $$
declare
  li timestamp := public.hora_local(p_ini); lf timestamp := public.hora_local(p_fim);
  d date := li::date; h public.horarios%rowtype; segs time[]; i int; s timestamp; e timestamp; total int := 0;
begin
  if p_fim <= p_ini then return 0; end if;
  while d <= lf::date loop
    select * into h from public.horarios where dia_semana = extract(dow from d)::int;
    if found and h.aberto and not exists (select 1 from public.folgas where dia = d) then
      segs := case when h.almoco_ini is not null then array[h.abre, h.almoco_ini, h.almoco_fim, h.fecha] else array[h.abre, h.fecha] end;
      i := 1;
      while i < array_length(segs, 1) loop
        s := greatest(li, d + segs[i]); e := least(lf, d + segs[i + 1]);
        if s < e then total := total + (extract(epoch from (e - s)) / 60)::int; end if;
        i := i + 2;
      end loop;
    end if;
    d := d + 1;
  end loop;
  return total;
end $$;

-- Move um agendamento (ou bloqueio) para outro horário e/ou outro elevador/rampa/mecânico, mantendo a duração.
-- Vale para qualquer situação:
--  * agendado / confirmado / em andamento: continua igual, conferindo choque de horário;
--  * aguardando peça, cancelado, faltou: volta para a agenda como "agendado" no novo horário;
--  * concluído: só corrige o horário/lugar (não ocupa mais a agenda, não confere choque);
--  * remarcado: não (o que vale é o agendamento novo).
-- p_encaixe = true aceita horário fora do expediente (o tempo do serviço corre seguido, como no agendar).
create or replace function public.mover_agendamento(p_id uuid, p_inicio timestamptz, p_mecanico_id uuid, p_local_id uuid, p_encaixe boolean default false)
returns void language plpgsql as $$
declare
  a public.agendamentos%rowtype; v_dur int; v_fim timestamptz; v_fora text; v_msg text; v_status text;
begin
  select * into a from public.agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if a.status = 'remarcado' then raise exception 'Este agendamento já foi remarcado: mova o horário novo.'; end if;
  if p_inicio is null then raise exception 'Informe o novo horário.'; end if;
  if a.tipo = 'servico' and p_mecanico_id is null then raise exception 'Escolha o mecânico.'; end if;
  if a.tipo = 'bloqueio' and p_mecanico_id is null and p_local_id is null then raise exception 'Bloqueio precisa de um mecânico ou elevador.'; end if;

  v_status := case when a.status in ('pausado', 'cancelado', 'faltou') then 'agendado' else a.status end;

  if a.tipo = 'servico' and a.status <> 'concluido' then
    v_dur := greatest(public.minutos_uteis(a.inicio, a.fim),
                      coalesce((select sum(duracao_min) from public.agendamento_itens where agendamento_id = a.id), 0)::int);
  end if;
  if a.tipo = 'bloqueio' or a.status = 'concluido' or coalesce(v_dur, 0) <= 0 then
    v_fim := p_inicio + (a.fim - a.inicio);
  elsif p_encaixe then
    v_fim := p_inicio + make_interval(mins => v_dur);
  else
    v_fim := public.somar_expediente(p_inicio, v_dur);
  end if;

  if v_status <> 'concluido' then
    if not p_encaixe then
      v_fora := public.fora_do_expediente(p_inicio, v_fim);
      if v_fora is not null then raise exception 'Horário %. Se for encaixe, use “Mover mesmo assim”.', v_fora; end if;
    end if;
    v_msg := public.descrever_conflito(a.id, p_mecanico_id, p_local_id, p_inicio, v_fim);
    if v_msg is not null then raise exception 'Horário ocupado: %.', v_msg; end if;
  end if;

  update public.agendamentos set
    status = v_status, mecanico_id = p_mecanico_id, local_id = p_local_id, inicio = p_inicio, fim = v_fim,
    fim_previsto = case when a.status = 'concluido' then fim_previsto else v_fim end,
    entrega_prevista = case when entrega_prevista is not null then greatest(entrega_prevista + (p_inicio - a.inicio), v_fim) end,
    atualizado_em = now()
  where id = p_id;
exception
  when exclusion_violation then
    raise exception 'Horário ocupado: alguém acabou de marcar esse mecânico ou elevador nesse horário. Atualize a agenda.';
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
