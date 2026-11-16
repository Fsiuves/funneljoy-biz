-- Retrato das etiquetas do celular dos números do CRM, lido por etiquetas.sh no banco
-- da Evolution. :lista = {"instancias": [...]} vem da função wa-etiquetas: só os
-- números do CRM são lidos.
-- A Evolution guarda a conversa marcada pelo código interno do WhatsApp (@lid); o
-- telefone vem das mensagens dessa conversa (remoteJidAlt ou senderPn). Conversa sem
-- mensagem desde que a Evolution foi ligada fica de fora (não há telefone).
-- Tudo em ordem fixa: o script compara o retrato com o anterior para saber se mudou.
with inst as (
  select id, name from "Instance"
   where name in (select jsonb_array_elements_text((:'lista')::jsonb -> 'instancias'))),
marcadas as (
  select c."instanceId", c."remoteJid", c.labels
    from "Chat" c
   where c."instanceId" in (select id from inst)
     and c.labels is not null and c.labels::text not in ('[]', 'null')),
traducao as (
  select distinct on (m."instanceId", m.key->>'remoteJid')
         m."instanceId", m.key->>'remoteJid' as lid,
         split_part(coalesce(m.key->>'remoteJidAlt', m.key->>'senderPn'), '@', 1) as telefone
    from "Message" m
   where m."instanceId" in (select id from inst)
     and m.key->>'remoteJid' in (select "remoteJid" from marcadas)
     and coalesce(m.key->>'remoteJidAlt', m.key->>'senderPn') like '%@s.whatsapp.net'
   order by m."instanceId", m.key->>'remoteJid', m."messageTimestamp" desc)
select json_build_object('instancias', coalesce(json_agg(json_build_object(
  'instancia', i.name,
  'etiquetas', (select coalesce(json_agg(json_build_object('id', l."labelId", 'nome', l.name, 'cor', l.color) order by l."labelId"), '[]')
                  from "Label" l where l."instanceId" = i.id),
  'marcacoes', (select coalesce(json_agg(json_build_object('telefone', coalesce(t.telefone, split_part(k."remoteJid", '@', 1)), 'etiquetas', k.labels)
                                  order by coalesce(t.telefone, split_part(k."remoteJid", '@', 1)), k."remoteJid"), '[]')
                  from marcadas k
                  left join traducao t on t."instanceId" = k."instanceId" and t.lid = k."remoteJid"
                 where k."instanceId" = i.id and (t.telefone is not null or k."remoteJid" like '%@s.whatsapp.net'))
  ) order by i.name), '[]'))
  from inst i;
