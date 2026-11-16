-- 52: renovação de plano (lista da Mari de 12/11/2026, item 1: "opção específica no
-- funil para identificar pacientes que fizeram a renovação de plano"). Como a clínica
-- explicou em 16/11: a renovação acontece quando o plano atual termina, e a recepção
-- oferece o plano de manutenção (24 sessões).
--
-- 1. crm.renovacoes: cada renovação é um registro próprio (paciente, plano, sessões,
--    valor, quem e quando). Não vai em crm.avaliacoes: lá o fechamento fica no último
--    horário em que o paciente compareceu (crm.mudar_etapa), então a renovação
--    apagaria o plano de antes, e um registro novo contaria como avaliação do dia no
--    Painel, no resumo e em Resultados. A equipe só lê; grava pelas funções.
-- 2. crm.registrar_renovacao: grava e passa o paciente para a etapa "Renovou plano"
--    (com o valor da renovação no card). Vale para qualquer paciente, inclusive os da
--    base (quem já era paciente antes do CRM). Guarda a etapa e o valor de antes, para
--    crm.desfazer_renovacao voltar o paciente se a renovação foi lançada errada.
-- 3. crm.mudar_etapa: a etapa "renovou" vai para crm.registrar_renovacao; o resto é o
--    mesmo de antes (definição copiada do banco em 16/11/2026).
-- 4. Clínica (tenant ea1e83f4): etapa "Renovou plano" (ganho) depois de "Segue pelo
--    TotalPass", e config.funil.renovacao com o plano e as sessões que a tela já
--    sugere (Plano de manutenção, 24).
--
-- Desfazer: mudar_etapa volta sem o desvio (definição anterior no histórico do git
-- deste arquivo); drop das funções registrar_renovacao e desfazer_renovacao; drop
-- table crm.renovacoes; a etapa sai de crm.funil_etapas (pacientes nela voltam
-- para "Fechou plano" antes).

begin;

-- 1. Renovações -------------------------------------------------------------------
create table if not exists crm.renovacoes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references crm.tenants(id) on delete cascade,
  lead_id         uuid not null references crm.leads(id) on delete cascade,
  unidade         text,
  plano           text check (plano is null or length(btrim(plano)) between 1 and 120),
  sessoes         integer check (sessoes is null or sessoes > 0),
  valor           numeric(12,2) not null check (valor > 0),
  etapa_anterior  text,
  valor_anterior  numeric,
  registrada_por  uuid,
  registrada_em   timestamptz not null default now()
);
create index if not exists renovacoes_lead on crm.renovacoes (lead_id, registrada_em desc);
create index if not exists renovacoes_tenant_quando on crm.renovacoes (tenant_id, registrada_em desc);

alter table crm.renovacoes enable row level security;
revoke all on crm.renovacoes from anon, authenticated;
grant select on crm.renovacoes to authenticated;

-- Quem vê: como a Agenda ("Ver avaliações da empresa").
drop policy if exists "Ver renovações da empresa" on crm.renovacoes;
create policy "Ver renovações da empresa" on crm.renovacoes
  for select to authenticated
  using (
    tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and (not (select crm.tenant_unidades_isoladas())
         or (select crm.my_unidade()) is null
         or unidade = (select crm.my_unidade()))
  );

-- 2. Registrar e desfazer -----------------------------------------------------------
create or replace function crm.registrar_renovacao(_lead_id uuid, _valor numeric, _plano text default null, _sessoes integer default null)
returns json
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_lead crm.leads;
  v_erro text;
  v_id uuid;
begin
  select * into v_lead from crm.leads where id = _lead_id;
  if not found then return json_build_object('success', false, 'error', 'nao_encontrado'); end if;
  v_erro := crm.pode_mexer_no_paciente(v_caller, v_lead);
  if v_erro is not null then return json_build_object('success', false, 'error', v_erro); end if;
  if not exists (select 1 from crm.funil_etapas e where e.tenant_id = v_lead.tenant_id and e.chave = 'renovou') then
    return json_build_object('success', false, 'error', 'etapa_invalida');
  end if;
  if _valor is null or _valor <= 0 then return json_build_object('success', false, 'error', 'valor_invalido'); end if;

  -- Clique duplo: a mesma renovação no mesmo minuto não entra duas vezes.
  select r.id into v_id from crm.renovacoes r
   where r.lead_id = _lead_id and r.valor = round(_valor, 2) and r.registrada_em > now() - interval '1 minute'
   limit 1;
  if v_id is not null then
    return json_build_object('success', true, 'id', v_id, 'etapa', 'renovou');
  end if;

  insert into crm.renovacoes (tenant_id, lead_id, unidade, plano, sessoes, valor, etapa_anterior, valor_anterior, registrada_por)
  values (v_lead.tenant_id, _lead_id, v_lead.unidade, nullif(btrim(coalesce(_plano, '')), ''),
          case when _sessoes > 0 then _sessoes end, round(_valor, 2), v_lead.stage, v_lead.value, v_caller)
  returning id into v_id;

  perform crm.mover_paciente(_lead_id, 'renovou', round(_valor, 2));
  return json_build_object('success', true, 'id', v_id, 'etapa', 'renovou');
end;
$$;

-- Renovação lançada errada: sai, e o paciente volta para a renovação anterior (se
-- houver) ou para a etapa e o valor de antes.
create or replace function crm.desfazer_renovacao(_id uuid)
returns json
language plpgsql
security definer
set search_path to 'crm', 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_ren crm.renovacoes;
  v_lead crm.leads;
  v_erro text;
  v_outra crm.renovacoes;
begin
  select * into v_ren from crm.renovacoes where id = _id;
  if not found then return json_build_object('success', false, 'error', 'nao_encontrado'); end if;
  select * into v_lead from crm.leads where id = v_ren.lead_id;
  v_erro := crm.pode_mexer_no_paciente(v_caller, v_lead);
  if v_erro is not null then return json_build_object('success', false, 'error', v_erro); end if;

  delete from crm.renovacoes where id = _id;

  -- Só mexe na etapa se o paciente ainda está em "Renovou plano".
  if v_lead.stage = 'renovou' then
    select * into v_outra from crm.renovacoes
     where lead_id = v_ren.lead_id order by registrada_em desc limit 1;
    if found then
      update crm.leads set value = v_outra.valor, updated_at = now() where id = v_ren.lead_id;
    elsif v_ren.etapa_anterior is not null
          and exists (select 1 from crm.funil_etapas e where e.tenant_id = v_lead.tenant_id and e.chave = v_ren.etapa_anterior) then
      update crm.leads set stage = v_ren.etapa_anterior, value = v_ren.valor_anterior, updated_at = now()
       where id = v_ren.lead_id;
    end if;
  end if;
  return json_build_object('success', true);
end;
$$;

revoke all on function crm.registrar_renovacao(uuid, numeric, text, integer) from public, anon;
revoke all on function crm.desfazer_renovacao(uuid) from public, anon;
grant execute on function crm.registrar_renovacao(uuid, numeric, text, integer) to authenticated, service_role;
grant execute on function crm.desfazer_renovacao(uuid) to authenticated, service_role;

-- 3. mudar_etapa com o desvio da renovação --------------------------------------------
CREATE OR REPLACE FUNCTION crm.mudar_etapa(_lead_id uuid, _etapa text, _quando timestamp with time zone DEFAULT NULL::timestamp with time zone, _valor numeric DEFAULT NULL::numeric, _plano text DEFAULT NULL::text, _sessoes integer DEFAULT NULL::integer, _unidade text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_lead crm.leads;
  v_erro text;
  v_tipo text;
  v_av uuid;
  r json;
begin
  select * into v_lead from crm.leads where id = _lead_id;
  if not found then return json_build_object('success', false, 'error', 'nao_encontrado'); end if;
  v_erro := crm.pode_mexer_no_paciente(v_caller, v_lead);
  if v_erro is not null then return json_build_object('success', false, 'error', v_erro); end if;
  select e.tipo into v_tipo from crm.funil_etapas e where e.tenant_id = v_lead.tenant_id and e.chave = _etapa;
  if v_tipo is null then return json_build_object('success', false, 'error', 'etapa_invalida'); end if;

  -- Renovação (52-renovacao.sql): registro próprio; o fechamento de antes fica.
  if _etapa = 'renovou' then
    return crm.registrar_renovacao(_lead_id, _valor, _plano, _sessoes);
  end if;

  -- Avaliação, R2 e R3 marcam horário na Agenda.
  if _etapa in ('agendou', 'agendou_r2', 'agendou_r3') then
    if _quando is null then return json_build_object('success', false, 'error', 'data_invalida'); end if;
    return crm.agendar_avaliacao(_lead_id, _quando, _unidade,
      case _etapa when 'agendou' then 'avaliacao' when 'agendou_r2' then 'r2' else 'r3' end);
  end if;

  if _etapa in ('compareceu', 'faltou', 'fechou_plano', 'mes_a_mes', 'avulso', 'totalpass', 'nao_fechou') then
    if _etapa in ('fechou_plano', 'mes_a_mes', 'avulso') and (_valor is null or _valor <= 0) then
      return json_build_object('success', false, 'error', 'valor_invalido');
    end if;
    -- Fechamento vai no último horário em que o paciente compareceu; senão no
    -- que está em aberto; senão num novo, de agora (veio sem agendar pelo CRM).
    -- Compareceu e faltou vão na avaliação em aberto antes de R2 e R3.
    if _etapa in ('fechou_plano', 'mes_a_mes', 'avulso', 'totalpass', 'nao_fechou') then
      select a.id into v_av from crm.avaliacoes a
       where a.lead_id = _lead_id and a.status = 'compareceu'
       order by a.marcada_para desc limit 1;
    end if;
    if v_av is null then
      select a.id into v_av from crm.avaliacoes a
       where a.lead_id = _lead_id and a.status = 'agendada'
       order by (a.tipo = 'avaliacao' and _etapa in ('compareceu', 'faltou')) desc, a.marcada_para desc limit 1;
    end if;
    if v_av is null then
      r := crm.agendar_avaliacao(_lead_id, coalesce(_quando, now()));
      if not (r ->> 'success')::boolean then return r; end if;
      v_av := (r ->> 'id')::uuid;
    end if;

    if _etapa = 'faltou' then
      return crm.registrar_presenca(v_av, false);
    end if;
    if (select a.status from crm.avaliacoes a where a.id = v_av) <> 'compareceu' then
      r := crm.registrar_presenca(v_av, true);
      if not (r ->> 'success')::boolean then return r; end if;
    end if;
    if _etapa = 'compareceu' then
      return json_build_object('success', true);
    end if;
    return crm.registrar_fechamento(v_av, _etapa <> 'nao_fechou', _valor, _plano, _sessoes,
      case _etapa when 'mes_a_mes' then 'mes_a_mes' when 'avulso' then 'avulso' when 'totalpass' then 'totalpass' else 'plano' end);
  end if;

  -- Perdido tira da Agenda o que estava marcado.
  if v_tipo = 'perdido' then
    update crm.avaliacoes set status = 'cancelada' where lead_id = _lead_id and status = 'agendada';
  end if;
  update crm.leads set stage = _etapa, updated_at = now() where id = _lead_id;
  return json_build_object('success', true);
end;
$function$;

-- 4. A clínica ------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := 'ea1e83f4-0fdc-41c4-903d-f51b5bfa25b4';
  v_ordem int;
begin
  if not exists (select 1 from crm.funil_etapas where tenant_id = v_tenant and chave = 'renovou') then
    select ordem + 1 into v_ordem from crm.funil_etapas where tenant_id = v_tenant and chave = 'totalpass';
    if v_ordem is null then
      select coalesce(max(ordem), 0) + 1 into v_ordem from crm.funil_etapas where tenant_id = v_tenant;
    end if;
    update crm.funil_etapas set ordem = ordem + 1 where tenant_id = v_tenant and ordem >= v_ordem;
    insert into crm.funil_etapas (tenant_id, chave, rotulo, cor, ordem, tipo)
    values (v_tenant, 'renovou', 'Renovou plano', '#059669', v_ordem, 'ganho');
  end if;

  update crm.tenants
     set config = jsonb_set(coalesce(config, '{}'::jsonb), '{funil}',
                            coalesce(config -> 'funil', '{}'::jsonb)
                            || jsonb_build_object('renovacao', jsonb_build_object('plano', 'Plano de manutenção', 'sessoes', 24)))
   where id = v_tenant;
end;
$$;

commit;
