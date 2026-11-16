-- 48: desde quando cada paciente espera resposta (pedido da clínica em 12/11/2026, lista da Mari)
--
-- "Criar filtro de mensagens não lidas: exibir todas as conversas que ainda
-- aguardam resposta em um único lugar, priorizando as mais antigas." Para
-- ordenar pela espera, a conversa precisa saber desde quando o paciente espera:
-- a primeira mensagem dele depois da última resposta de uma pessoa. O Painel já
-- calcula isso pelo tempo de resposta do Radar, mas enxerga as duas unidades e
-- não serve para a lista do Atendimento, que respeita a unidade de cada um.
--
-- 1. crm.conversations.aguardando_desde (nulo = ninguém esperando).
-- 2. crm.on_radar_message (versão da 47): mantém a coluna. Mensagem do paciente
--    começa a espera (ou mantém o começo, se já esperava); resposta de uma pessoa
--    zera; a saudação automática não zera; conversa da equipe e grupo, sempre nulo.
-- 3. Resolver a conversa zera a espera (gatilho em crm.conversations): se o
--    paciente escrever de novo, a espera começa na mensagem nova.
-- 4. Acerto: conversas abertas recebem o começo da espera pela primeira mensagem
--    do paciente depois da última resposta de uma pessoa (a saudação não conta).
--
-- Ordem: aplicar antes de publicar a tela desta PR (a tela lê a coluna).
-- Desfazer: reaplicar a ponte da 47, apagar o gatilho e a coluna.

begin;

-- ---------------------------------------------------------------- 1
alter table crm.conversations add column if not exists aguardando_desde timestamptz;
create index if not exists conversations_aguardando
  on crm.conversations (tenant_id, aguardando_desde)
  where aguardando_desde is not null and status = 'aberta';

-- ---------------------------------------------------------------- 2
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
      last_inbound_at, window_expires_at, interna, iniciada_pela_clinica, aguardando_desde)
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
      v_interna, not v_entrada and not v_automatica,
      case when v_entrada and not v_interna then v_quando end)
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
      window_expires_at    = greatest(c.window_expires_at, excluded.window_expires_at),
      -- Desde quando o paciente espera (48-aguardando-resposta.sql): a primeira
      -- mensagem dele depois da última resposta de uma pessoa. Mensagem nova dele
      -- não muda o começo da espera; resposta de uma pessoa (não a saudação) zera.
      -- Mensagem que chega atrasada, mais velha que a conversa, não mexe.
      aguardando_desde     = case
                               when v_interna then null
                               when v_entrada and not v_atrasada then coalesce(c.aguardando_desde, v_quando)
                               when v_entrada or v_automatica then c.aguardando_desde
                               when v_quando >= coalesce(c.aguardando_desde, '-infinity') then null
                               else c.aguardando_desde
                             end
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


-- ---------------------------------------------------------------- 3
create or replace function crm.conversa_resolvida_sem_espera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'resolvida' and old.status is distinct from 'resolvida' then
    new.aguardando_desde := null;
  end if;
  return new;
end;
$$;

drop trigger if exists conversa_resolvida_sem_espera on crm.conversations;
create trigger conversa_resolvida_sem_espera
  before update of status on crm.conversations
  for each row execute function crm.conversa_resolvida_sem_espera();

-- ---------------------------------------------------------------- 4
with ultima_humana as (
  select c.id, c.radar_company_id, c.phone,
         (select max(m.timestamp_unix) from public.messages m
           where m.company_id = c.radar_company_id and m.phone_number = c.phone and m.is_from_me
             and not (m.sent_by is null and crm.mensagem_automatica(m.company_id, m.body))
             and m.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                        'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                        'senderKeyDistributionMessage', 'editedMessage')) as t_humana
    from crm.conversations c
   where c.status = 'aberta' and not c.interna
), espera as (
  select u.id,
         (select min(m.timestamp_unix) from public.messages m
           where m.company_id = u.radar_company_id and m.phone_number = u.phone
             and not coalesce(m.is_from_me, false) and m.timestamp_unix > coalesce(u.t_humana, 0)
             and m.message_type not in ('reactionMessage', 'protocolMessage', 'secretEncryptedMessage',
                                        'pinInChatMessage', 'associatedChildMessage', 'encEventResponseMessage',
                                        'senderKeyDistributionMessage', 'editedMessage')) as t_espera
    from ultima_humana u
)
update crm.conversations c
   set aguardando_desde = to_timestamp(e.t_espera)
  from espera e
 where c.id = e.id and e.t_espera is not null;

commit;
