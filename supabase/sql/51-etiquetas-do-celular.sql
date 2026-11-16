-- 51: etiquetas do celular no CRM (decisão do Fred em 16/11/2026: "Etiqueta feitas no
-- celular aparece no CRM"). Continua a 50-etiquetas.sql.
--
-- Como chega: o servidor da Evolution roda, a cada minuto, o script
-- /root/evolution-etiquetas/etiquetas.sh, que lê no banco da Evolution as etiquetas do
-- WhatsApp Business de cada número do CRM ("Label") e as conversas marcadas
-- ("Chat".labels), troca o código interno do WhatsApp (@lid) pelo telefone e manda
-- esse retrato para a função wa-etiquetas, que chama crm.sincronizar_etiquetas_whatsapp
-- (só a chave de serviço chama). O retrato é a verdade do celular: o que sai de lá sai
-- daqui; as etiquetas e marcações do CRM não são tocadas.
--
-- Defeito da Evolution: ela apaga do nome toda letra fora do ASCII antes de gravar
-- (dist/main.mjs, labels.edit: name.replace(/[^\x20-\x7E]/g, "")). "Não fecharam
-- plano" chega "No fecharam plano". Em 16/11 todo "no" solto nos nomes das duas
-- unidades era "não" (7 etiquetas), então crm.nome_da_etiqueta_do_whatsapp devolve o
-- "não". Os outros acentos não têm como voltar.
-- "Não lidas" e "Grupos" são filtros do próprio WhatsApp, não etiquetas: ficam de fora.
-- A cor do WhatsApp vem como número (0 a 19) e vira uma cor parecida.
--
-- Só chegam as marcações de conversas com telefone conhecido: em 16/11, 118 da Lapa e
-- 195 de Osasco das 1.418 marcações do celular; as outras são conversas antigas, sem
-- mensagem desde que a Evolution foi ligada. Das 313, 302 já têm conversa no CRM; as
-- outras entram quando a conversa existir (o script manda de novo a cada 10 minutos).
--
-- Desfazer: drop das três funções. As etiquetas do celular já gravadas ficam; para
-- tirar: delete from crm.etiquetas where origem = 'whatsapp' (leva as marcações junto).

begin;

-- Cor parecida com a de cada número de cor do WhatsApp Business.
create or replace function crm.cor_do_whatsapp(_indice text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array[
    '#ff9485', '#64c4ff', '#ffd429', '#dfaef0', '#99b6c1', '#55ccb3', '#ff9dff', '#d3a91d', '#6d7cce', '#d7e752',
    '#00d0e2', '#ffc5c7', '#93ceac', '#f74848', '#00a0f2', '#83e422', '#ffaf04', '#b5ebff', '#9ba6ff', '#9368cf'
  ])[case when _indice ~ '^[0-9]{1,2}$' then least(_indice::int, 19) + 1 else 1 end]
$$;

-- Nome como a clínica escreveu: o "no" solto volta a ser "não" e espaço sobrando sai.
create or replace function crm.nome_da_etiqueta_do_whatsapp(_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(
           regexp_replace(coalesce(_nome, ''), '(^|[^[:alpha:]])([Nn])o(?=$|[^[:alpha:]])', '\1\2ão', 'g'),
           '\s+', ' ', 'g')), 40)
$$;

create or replace function crm.sincronizar_etiquetas_whatsapp(_instancia text, _etiquetas jsonb, _marcacoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wa crm.wa_accounts;
  v_ids text[];
  v_mudadas int;
  v_apagadas int;
  v_postas int;
  v_tiradas int;
  v_sem_conversa int;
begin
  select * into v_wa from crm.wa_accounts
   where instancia = _instancia and ativo and unidade is not null
   limit 1;
  if not found then
    return jsonb_build_object('ignorado', 'numero_fora_do_crm');
  end if;
  if jsonb_typeof(_etiquetas) is distinct from 'array' or jsonb_typeof(_marcacoes) is distinct from 'array' then
    raise exception 'retrato_invalido';
  end if;
  -- O WhatsApp Business sempre tem etiquetas; retrato sem nenhuma é leitura que falhou,
  -- e apagaria tudo.
  if jsonb_array_length(_etiquetas) = 0 then
    return jsonb_build_object('ignorado', 'retrato_sem_etiquetas');
  end if;

  -- 1. Etiquetas: cria as novas, acerta nome e cor das que mudaram, apaga as que saíram.
  create temporary table if not exists _etiquetas_do_celular (wa_label_id text primary key, nome text, cor text) on commit drop;
  truncate _etiquetas_do_celular;
  insert into _etiquetas_do_celular
  select distinct on (x.id) x.id, x.nome, x.cor
    from (select e->>'id' as id,
                 crm.nome_da_etiqueta_do_whatsapp(e->>'nome') as nome,
                 crm.cor_do_whatsapp(e->>'cor') as cor
            from jsonb_array_elements(_etiquetas) e) x
   where coalesce(x.id, '') <> '' and x.nome <> '' and lower(x.nome) not in ('não lidas', 'grupos')
   order by x.id;

  insert into crm.etiquetas (tenant_id, unidade, nome, cor, origem, wa_account_id, wa_label_id, created_by)
  select v_wa.tenant_id, v_wa.unidade, n.nome, n.cor, 'whatsapp', v_wa.id, n.wa_label_id, null
    from _etiquetas_do_celular n
  on conflict (wa_account_id, wa_label_id) where origem = 'whatsapp'
  do update set nome = excluded.nome, cor = excluded.cor
   where (crm.etiquetas.nome, crm.etiquetas.cor) is distinct from (excluded.nome, excluded.cor);
  get diagnostics v_mudadas = row_count;

  select coalesce(array_agg(wa_label_id), '{}') into v_ids from _etiquetas_do_celular;
  delete from crm.etiquetas
   where origem = 'whatsapp' and wa_account_id = v_wa.id and wa_label_id <> all (v_ids);
  get diagnostics v_apagadas = row_count;

  -- 2. Marcações: conversa (pelo telefone, no mesmo número) e etiqueta do celular.
  create temporary table if not exists _marcacoes_do_celular (conversation_id uuid, etiqueta_id uuid, primary key (conversation_id, etiqueta_id)) on commit drop;
  truncate _marcacoes_do_celular;
  insert into _marcacoes_do_celular
  select distinct c.id, et.id
    from jsonb_array_elements(_marcacoes) m
   cross join lateral jsonb_array_elements_text(
           case when jsonb_typeof(m->'etiquetas') = 'array' then m->'etiquetas' else '[]'::jsonb end) l(wa_label_id)
    join crm.conversations c on c.wa_account_id = v_wa.id and c.phone = m->>'telefone'
    join crm.etiquetas et on et.wa_account_id = v_wa.id and et.origem = 'whatsapp' and et.wa_label_id = l.wa_label_id;

  select count(*) into v_sem_conversa
    from jsonb_array_elements(_marcacoes) m
   where not exists (select 1 from crm.conversations c where c.wa_account_id = v_wa.id and c.phone = m->>'telefone');

  delete from crm.conversa_etiquetas ce
   using crm.etiquetas et
   where et.id = ce.etiqueta_id and et.origem = 'whatsapp' and et.wa_account_id = v_wa.id
     and not exists (select 1 from _marcacoes_do_celular q
                      where q.conversation_id = ce.conversation_id and q.etiqueta_id = ce.etiqueta_id);
  get diagnostics v_tiradas = row_count;

  insert into crm.conversa_etiquetas (conversation_id, etiqueta_id, tenant_id, origem, created_by)
  select q.conversation_id, q.etiqueta_id, v_wa.tenant_id, 'whatsapp', null
    from _marcacoes_do_celular q
  on conflict (conversation_id, etiqueta_id) do nothing;
  get diagnostics v_postas = row_count;

  return jsonb_build_object(
    'unidade', v_wa.unidade,
    'etiquetas_novas_ou_mudadas', v_mudadas,
    'etiquetas_apagadas', v_apagadas,
    'marcacoes_postas', v_postas,
    'marcacoes_tiradas', v_tiradas,
    'telefones_sem_conversa', v_sem_conversa);
end;
$$;

revoke all on function crm.sincronizar_etiquetas_whatsapp(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function crm.sincronizar_etiquetas_whatsapp(text, jsonb, jsonb) to service_role;

commit;
