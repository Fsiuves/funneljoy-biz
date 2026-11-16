-- 47: saudação automática do WhatsApp não é resposta (pedido da clínica em 16/11/2026)
--
-- "O CRM está marcando algumas conversas como lidas mesmo sem ninguém ter
-- aberto." Causa: Osasco tem a saudação automática do WhatsApp Business ("Olá!
-- Bem-vindo(a) à Coluna Ajustada…"), que sai do celular em média 2 s depois da
-- primeira mensagem do paciente (177 vezes em 14 dias; 536 no total). A ponte
-- tratava toda mensagem nossa como resposta: zerava as não lidas, punha a seta
-- de respondida, passava a conversa para a atendente logada e o gatilho do Radar
-- fechava o tempo de resposta (486 fechados pela saudação, média de 0,03 min),
-- deixando o Painel, os avisos e o tempo de resposta de Osasco falsos.
--
-- 1. crm.mensagem_automatica(empresa do Radar, texto): o texto começa com uma das
--    mensagens de tenants.config.atendimento.mensagens_automaticas da empresa
--    dona do número. Comparação pelo começo, sem diferenciar maiúsculas.
-- 2. Configuração da clínica: a saudação de Osasco. Se a clínica mudar o texto,
--    é trocar a lista (salvar_regras_atendimento mescla e não apaga a lista).
-- 3. crm.on_radar_message: a versão de 45 com a saudação tratada como automática
--    (só mensagem nossa que não saiu pelo CRM). Fica no histórico; não mexe em
--    não lidas, prévia, hora da conversa, "respondida" nem responsável, e não
--    faz a conversa nascer como "a clínica começou".
-- 4. public.close_sla_on_outbound (gatilho do Radar): a saudação não fecha o
--    tempo de resposta; fecha a primeira resposta de uma pessoa.
-- 5. Acerto do que já aconteceu:
--    a) tempos de resposta fechados pela saudação passam a valer a primeira
--       resposta de uma pessoa (478 em 16/11) ou voltam a esperar (8);
--    b) conversas em que a saudação foi a última coisa da clínica e o paciente
--       segue sem resposta de uma pessoa (7 em 16/11): prévia e hora da última
--       mensagem do paciente, sem a seta de respondida, e as abertas com as não
--       lidas contadas desde a última resposta de uma pessoa.
--
-- Ordem: aplicar antes de qualquer tela que dependa disto (esta PR não muda tela).
-- Desfazer: reaplicar a ponte de 45-paciente-respondeu-entra-no-funil.sql e o
-- close_sla_on_outbound original (sem o teste da linha da saudação); o acerto
-- dos dados não volta sozinho.

begin;

-- ---------------------------------------------------------------- 1
create or replace function crm.mensagem_automatica(_company uuid, _body text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(btrim(_body), '') <> '' and exists (
    select 1
      from crm.wa_accounts w
      join crm.tenants t on t.id = w.tenant_id
     cross join lateral jsonb_array_elements_text(
            coalesce(t.config -> 'atendimento' -> 'mensagens_automaticas', '[]'::jsonb)) as p(inicio)
     where w.radar_company_id = _company
       and btrim(p.inicio) <> ''
       and lower(left(btrim(_body), length(btrim(p.inicio)))) = lower(btrim(p.inicio)))
$$;
revoke all on function crm.mensagem_automatica(uuid, text) from public;
grant execute on function crm.mensagem_automatica(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 2
update crm.tenants
   set config = jsonb_set(coalesce(config, '{}'::jsonb), '{atendimento}',
                          coalesce(config -> 'atendimento', '{}'::jsonb)
                            || jsonb_build_object('mensagens_automaticas',
                                 jsonb_build_array('Olá! Bem-vindo(a) à Coluna Ajustada')))
 where id = 'ea1e83f4-0fdc-41c4-903d-f51b5bfa25b4';

-- ---------------------------------------------------------------- 3
CREATE OR REPLACE FUNCTION crm.on_radar_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
declare
  v_wa        crm.wa_accounts%rowtype;
  v_nome      text;
  v_lead_id   uuid;
  v_quando    timestamptz;
  v_preview   text;
  v_entrada   boolean;
  v_interna   boolean;
  v_conversa  uuid;
  v_resp      uuid;
  v_da_clinica boolean;
  v_primeira_nossa bigint;
  v_paciente_antes boolean := false;
  v_ultima    timestamptz;
  v_atrasada  boolean := false;
  v_automatica boolean := false;
begin
  begin
    select * into v_wa
      from crm.wa_accounts
     where radar_company_id = new.company_id and ativo
     limit 1;
    if not found then
      return new;
    end if;

    -- Reação, apagada, fixada e afins não são conversa: não mexem na fila.
    if new.message_type in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                            'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                            'senderKeyDistributionMessage', 'editedMessage') then
      return new;
    end if;

    v_entrada := not coalesce(new.is_from_me, false);
    v_quando  := coalesce(to_timestamp(nullif(new.timestamp_unix, 0)), new.created_at, now());
    v_interna := crm.telefone_da_equipe(v_wa.tenant_id, new.phone_number);
    -- Saudação automática do WhatsApp Business (47-saudacao-automatica.sql): sai
    -- do celular segundos depois da primeira mensagem do paciente. Fica no
    -- histórico, mas não é resposta de ninguém: não zera as não lidas, não marca
    -- a conversa como respondida nem muda a prévia, e não troca o responsável.
    v_automatica := not v_entrada and new.sent_by is null
                    and crm.mensagem_automatica(new.company_id, new.body);

    v_preview := case
      when nullif(btrim(new.body), '') is not null and new.body <> '[mídia]' then left(btrim(new.body), 160)
      when new.message_type = 'imageMessage'    then 'Imagem'
      when new.message_type = 'audioMessage'    then 'Áudio'
      when new.message_type = 'videoMessage'    then 'Vídeo'
      when new.message_type = 'documentMessage' then 'Documento'
      when new.message_type = 'stickerMessage'  then 'Figurinha'
      when new.message_type = 'locationMessage' then 'Localização'
      when new.message_type in ('contactMessage', 'contactsArrayMessage') then 'Contato'
      else 'Mensagem'
    end;

    -- O nome que o paciente usa no WhatsApp. Só de mensagem dele: em mensagem
    -- nossa o push_name pode ser o da própria clínica.
    if v_entrada then
      select nullif(btrim(l.push_name), '') into v_nome from public.leads l where l.id = new.lead_id;
      if length(v_nome) < 2 then v_nome := null; end if;
    end if;

    if not v_interna then
      select c.lead_id, c.iniciada_pela_clinica, c.last_message_at into v_lead_id, v_da_clinica, v_ultima
        from crm.conversations c
       where c.wa_account_id = v_wa.id and c.phone = new.phone_number;
      -- Mensagem que chega horas depois (n8n refeito, 29/10) e é mais velha que a
      -- última da conversa é histórico: entra na conversa, mas não reabre, não
      -- conta como não lida nem zera as não lidas. Os 10 minutos deixam de fora a
      -- saudação automática que chega antes da mensagem do paciente.
      v_atrasada := coalesce(v_quando < v_ultima, false) and v_quando < now() - interval '10 minutes';

      if v_lead_id is null then
        select l.id into v_lead_id
          from crm.leads l
         where l.tenant_id = v_wa.tenant_id
           and crm.phone_key(l.phone) = crm.phone_key(new.phone_number)
         order by (l.unidade = v_wa.unidade) desc nulls last, l.created_at
         limit 1;
      end if;

      -- A saudação automática do WhatsApp Business sai no mesmo segundo da
      -- mensagem do paciente e às vezes chega aqui antes dela: a conversa nascia
      -- como "a clínica começou" e o paciente não entrava no funil. Vale a hora
      -- do WhatsApp, não a ordem de chegada: se nada nosso saiu antes desta
      -- mensagem, quem começou foi o paciente.
      if v_entrada and coalesce(v_da_clinica, false) then
        select min(m.timestamp_unix) into v_primeira_nossa
          from public.messages m
         where m.company_id = new.company_id and m.phone_number = new.phone_number and m.is_from_me
           and m.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                      'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                      'senderKeyDistributionMessage', 'editedMessage');
        v_paciente_antes := coalesce(new.timestamp_unix <= v_primeira_nossa, false);
        if v_paciente_antes then v_da_clinica := false; end if;
      end if;

      -- Paciente escreveu e não tem cadastro: entra no funil, também quando foi a
      -- clínica que começou a conversa. A regra de 14/10 (22-conversa-da-clinica.sql)
      -- deixava fora a resposta a conversa da clínica; o Fred desfez em 12/11/2026,
      -- porque o paciente que fechava assim não aparecia no funil para lançar a venda.
      -- iniciada_pela_clinica continua valendo para os números de Resultados.
      if v_lead_id is null and v_entrada then
        -- Duas mensagens do mesmo número novo no mesmo segundo criavam dois
        -- pacientes (josyartesanatos10, 03/10): uma não via o da outra. A trava
        -- faz a segunda esperar a primeira gravar e então achar o paciente dela.
        perform pg_advisory_xact_lock(hashtextextended(
          'crm.paciente:' || v_wa.tenant_id || ':' || coalesce(crm.phone_key(new.phone_number), new.phone_number), 0));
        select l.id into v_lead_id
          from crm.leads l
         where l.tenant_id = v_wa.tenant_id
           and crm.phone_key(l.phone) = crm.phone_key(new.phone_number)
         order by (l.unidade = v_wa.unidade) desc nulls last, l.created_at
         limit 1;
        if v_lead_id is null then
          insert into crm.leads (name, phone, source, stage, tenant_id, unidade, created_by)
          values (left(coalesce(v_nome, '+' || new.phone_number), 200), new.phone_number,
                  'whatsapp', 'new', v_wa.tenant_id, v_wa.unidade, null)
          returning id into v_lead_id;
        end if;
      end if;
    end if;

    insert into crm.conversations as c (
      tenant_id, wa_account_id, unidade, radar_company_id, radar_lead_id, lead_id,
      phone, contact_name, status, unread_count,
      last_message_at, last_message_preview, last_message_from_me,
      last_inbound_at, window_expires_at, interna, iniciada_pela_clinica)
    values (
      v_wa.tenant_id, v_wa.id, v_wa.unidade, new.company_id, new.lead_id, v_lead_id,
      new.phone_number, v_nome, 'aberta', case when v_entrada then 1 else 0 end,
      -- Saudação que chega antes da mensagem do paciente: a conversa nasce sem
      -- prévia e sem hora, e a mensagem do paciente preenche as duas.
      case when v_automatica then null else v_quando end,
      case when v_automatica then null else v_preview end,
      not v_entrada and not v_automatica,
      case when v_entrada then v_quando end,
      case when v_entrada then v_quando + interval '24 hours' end,
      v_interna, not v_entrada and not v_automatica)
    on conflict (wa_account_id, phone) do update set
      radar_lead_id        = coalesce(excluded.radar_lead_id, c.radar_lead_id),
      lead_id              = coalesce(c.lead_id, excluded.lead_id),
      contact_name         = coalesce(excluded.contact_name, c.contact_name),
      interna              = excluded.interna,
      iniciada_pela_clinica = c.iniciada_pela_clinica and not v_paciente_antes,
      -- Paciente escreveu: volta para a fila. Resposta nossa, de onde for, zera
      -- as não lidas, porque alguém já leu para responder. A saudação automática
      -- não é resposta: não mexe em nada disso.
      status               = case when v_entrada and not v_atrasada then 'aberta' else c.status end,
      unread_count         = case when v_atrasada or v_automatica then c.unread_count
                                  when v_entrada then c.unread_count + 1 else 0 end,
      last_message_preview = case when v_automatica then c.last_message_preview
                                  when excluded.last_message_at >= coalesce(c.last_message_at, '-infinity')
                                  then excluded.last_message_preview else c.last_message_preview end,
      last_message_from_me = case when v_automatica then c.last_message_from_me
                                  when excluded.last_message_at >= coalesce(c.last_message_at, '-infinity')
                                  then excluded.last_message_from_me else c.last_message_from_me end,
      last_message_at      = greatest(c.last_message_at, excluded.last_message_at),
      last_inbound_at      = greatest(c.last_inbound_at, excluded.last_inbound_at),
      window_expires_at    = greatest(c.window_expires_at, excluded.window_expires_at)
    returning c.id, c.assigned_to into v_conversa, v_resp;

    -- Resposta da clínica: quem fica com a conversa segue a regra de troca de
    -- turno da empresa (crm.assumir_conversa). Pelo painel, quem clicou; pelo
    -- celular ou WhatsApp Web, a atendente logada da unidade. Erro aqui não pode
    -- desfazer a conversa acima. Resposta de horas atrás não diz quem está no
    -- turno agora: não troca o responsável.
    if not v_entrada and not v_interna and not v_automatica and v_quando > now() - interval '1 hour' then
      begin
        perform crm.assumir_conversa(v_conversa, v_wa.tenant_id, v_wa.unidade, v_resp, new.sent_by);
      exception when others then
        insert into crm.bridge_errors (message_id, company_id, erro, sqlstate)
        values (new.id, new.company_id, 'assumir: ' || sqlerrm, sqlstate);
      end;
    end if;

  exception when others then
    insert into crm.bridge_errors (message_id, company_id, erro, sqlstate)
    values (new.id, new.company_id, sqlerrm, sqlstate);
  end;
  return new;
end;
$function$;


-- ---------------------------------------------------------------- 4
create or replace function public.close_sla_on_outbound()
 returns trigger
 language plpgsql
as $function$
declare
  threshold int;
begin
  -- Saudação automática do WhatsApp (CRM, 47-saudacao-automatica.sql) não é
  -- resposta: o tempo segue correndo até uma pessoa responder.
  if NEW.is_from_me = true
     and not (NEW.sent_by is null and crm.mensagem_automatica(NEW.company_id, NEW.body)) then
    select sla_threshold_minutes into threshold
    from companies where id = NEW.company_id;

    update response_times
    set
      responded_at = NEW.created_at,
      outbound_message_id = NEW.id,
      response_minutes = extract(epoch from (NEW.created_at - inbound_at)) / 60,
      within_sla = extract(epoch from (NEW.created_at - inbound_at)) / 60 <= threshold,
      status = 'responded'
    where
      lead_id = NEW.lead_id
      and status = 'pending';
  end if;
  return NEW;
end;
$function$;

-- ---------------------------------------------------------------- 5a
create temporary table automaticas on commit drop as
  select m.id
    from public.messages m
   where m.is_from_me and m.sent_by is null
     and m.company_id in (select radar_company_id from crm.wa_accounts)
     and crm.mensagem_automatica(m.company_id, m.body);

with alvo as (
  select rt.id, rt.inbound_at, co.sla_threshold_minutes as limite,
         (select h.id from public.messages h
           where h.lead_id = rt.lead_id and h.is_from_me and h.created_at >= rt.inbound_at
             and h.id not in (select id from automaticas)
           order by h.created_at limit 1) as humana
    from public.response_times rt
    join public.companies co on co.id = rt.company_id
   where rt.outbound_message_id in (select id from automaticas)
)
update public.response_times rt
   set status              = case when a.humana is null then 'pending' else 'responded' end,
       outbound_message_id = a.humana,
       responded_at        = h.created_at,
       response_minutes    = extract(epoch from (h.created_at - rt.inbound_at)) / 60,
       within_sla          = extract(epoch from (h.created_at - rt.inbound_at)) / 60 <= a.limite
  from alvo a
  left join public.messages h on h.id = a.humana
 where rt.id = a.id;

-- ---------------------------------------------------------------- 5b
with conv as (
  select c.id, c.status, c.radar_company_id, c.phone,
         (select max(m.timestamp_unix) from public.messages m
           where m.company_id = c.radar_company_id and m.phone_number = c.phone and m.is_from_me
             and m.id not in (select id from automaticas)
             and m.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                        'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                        'senderKeyDistributionMessage', 'editedMessage')) as t_humana,
         (select max(m.timestamp_unix) from public.messages m
           where m.company_id = c.radar_company_id and m.phone_number = c.phone
             and m.id in (select id from automaticas)) as t_auto
    from crm.conversations c
   where not c.interna
     and c.radar_company_id in (select radar_company_id from crm.wa_accounts)
), alvo as (
  select v.id, v.status, v.t_humana, u.timestamp_unix, u.body, u.message_type,
         (select count(*) from public.messages i
           where i.company_id = v.radar_company_id and i.phone_number = v.phone
             and not coalesce(i.is_from_me, false) and i.timestamp_unix > coalesce(v.t_humana, 0)
             and i.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                        'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                        'senderKeyDistributionMessage', 'editedMessage')) as nao_lidas
    from conv v
    cross join lateral (
      select m.timestamp_unix, m.body, m.message_type from public.messages m
       where m.company_id = v.radar_company_id and m.phone_number = v.phone
         and not coalesce(m.is_from_me, false)
         and m.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                    'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                    'senderKeyDistributionMessage', 'editedMessage')
       order by m.timestamp_unix desc limit 1) u
   where v.t_auto is not null and v.t_auto > coalesce(v.t_humana, 0) and u.timestamp_unix > coalesce(v.t_humana, 0)
)
update crm.conversations c
   set last_message_from_me = false,
       last_message_at      = to_timestamp(a.timestamp_unix),
       last_message_preview = case
         when nullif(btrim(a.body), '') is not null and a.body <> '[mídia]' then left(btrim(a.body), 160)
         when a.message_type = 'imageMessage'    then 'Imagem'
         when a.message_type = 'audioMessage'    then 'Áudio'
         when a.message_type = 'videoMessage'    then 'Vídeo'
         when a.message_type = 'documentMessage' then 'Documento'
         when a.message_type = 'stickerMessage'  then 'Figurinha'
         when a.message_type = 'locationMessage' then 'Localização'
         when a.message_type in ('contactMessage', 'contactsArrayMessage') then 'Contato'
         else 'Mensagem' end,
       unread_count         = case when a.status = 'aberta' then greatest(c.unread_count, a.nao_lidas::int) else c.unread_count end
  from alvo a
 where c.id = a.id;

commit;
