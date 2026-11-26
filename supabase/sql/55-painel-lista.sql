-- 55: números do Painel da recepção clicáveis (pacote 2 das telas, pedido do Fred em
-- 26/11/2026). Cada número abre a lista exata das conversas que ele conta.
--
-- crm.painel_lista(_unidade, _tipo) devolve as conversas de um número com as mesmas
-- regras de crm.situacao_unidades (definição lida do banco em 26/11/2026):
--   esperando        esperando resposta, escreveu nas últimas 24 horas;
--   atrasados        os de cima que esperam há mais que o prazo da unidade;
--   paradas          esperando resposta há mais de 24 horas;
--   sem_responsavel  abertas, de paciente, sem responsável;
--   novas_hoje       conversas de paciente que chegaram hoje (não as que a clínica começou).
-- A espera é a de crm.esperando_resposta (a mesma da aba Aguardando). Quem pode ver é
-- quem vê o Painel (crm.painel_recepcao): a pessoa da empresa e, com unidades
-- isoladas, só a unidade dela.
--
-- Só leitura: não grava nada. Desfazer: drop function crm.painel_lista(text, text).

begin;

create or replace function crm.painel_lista(_unidade text, _tipo text)
returns json
language plpgsql
stable
security definer
set search_path to 'crm', 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid := crm.get_user_tenant_id(v_caller);
  v_minha  text;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini    timestamptz := (v_hoje::timestamp) at time zone 'America/Sao_Paulo';
  v_fim    timestamptz := ((v_hoje + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v_limite integer;
  v_saida  json;
begin
  if v_caller is null or v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if _tipo not in ('esperando', 'atrasados', 'paradas', 'sem_responsavel', 'novas_hoje') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  select p.unidade into v_minha from crm.profiles p where p.id = v_caller;
  if crm.tenant_unidades_isoladas() and v_minha is not null and v_minha is distinct from _unidade then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- O prazo e as unidades do Painel: só números ativos (como em situacao_unidades).
  select coalesce(c.sla_threshold_minutes, 15) into v_limite
    from crm.wa_accounts w
    left join public.companies c on c.id = w.radar_company_id
   where w.tenant_id = v_tenant and w.ativo and w.unidade = _unidade
   order by w.unidade
   limit 1;
  if v_limite is null then
    return json_build_object('total', 0, 'itens', '[]'::json);
  end if;

  with escolhidas as (
    select e.conversa_id, e.nome, e.desde as quando, e.assigned_to
      from crm.esperando_resposta(v_tenant) e
     where _tipo in ('esperando', 'atrasados', 'paradas')
       and e.unidade = _unidade
       and case _tipo
             when 'esperando' then e.desde >= now() - interval '24 hours'
             when 'atrasados' then e.desde >= now() - interval '24 hours'
                                   and e.desde < now() - make_interval(mins => v_limite)
             else e.desde < now() - interval '24 hours'
           end
    union all
    select c.id, coalesce(nullif(btrim(l.name), ''), c.contact_name, '+' || c.phone),
           case when _tipo = 'novas_hoje' then c.created_at else c.last_message_at end,
           c.assigned_to
      from crm.conversations c
      left join crm.leads l on l.id = c.lead_id
     where _tipo in ('sem_responsavel', 'novas_hoje')
       and c.tenant_id = v_tenant and c.unidade = _unidade and not c.interna
       and case _tipo
             when 'sem_responsavel' then c.status = 'aberta' and c.assigned_to is null
             else not c.iniciada_pela_clinica and c.created_at >= v_ini and c.created_at < v_fim
           end
  ),
  ordenadas as (
    -- Espera: quem espera há mais tempo primeiro. As outras: a mais recente primeiro.
    select s.*, row_number() over (
             order by case when _tipo in ('esperando', 'atrasados', 'paradas') then s.quando end asc,
                      s.quando desc nulls last) as n
      from escolhidas s
  )
  select json_build_object(
           'total', (select count(*) from ordenadas),
           'itens', coalesce((
             select json_agg(json_build_object(
                      'conversa_id', o.conversa_id,
                      'nome', o.nome,
                      'quando', o.quando,
                      'responsavel', (select p.name from crm.profiles p where p.id = o.assigned_to))
                    order by o.n)
               from ordenadas o
              where o.n <= 300), '[]'::json))
    into v_saida;

  return v_saida;
end;
$function$;

revoke all on function crm.painel_lista(text, text) from public, anon;
grant execute on function crm.painel_lista(text, text) to authenticated;

commit;
