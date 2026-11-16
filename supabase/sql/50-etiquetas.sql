-- 50: etiquetas nas conversas (pedido da clínica em 16/11/2026)
--
-- "Adicionar a opção de usar etiquetas nas conversas do CRM, assim como temos no
-- WhatsApp (Agendaram, Não fecharam plano, Influencer, Cancelamento, Favoritas...),
-- e permitir criar, editar e personalizar pelo CRM." Decisão do Fred em 16/11: a
-- etiqueta feita no celular aparece no CRM (sincronização na migração seguinte).
--
-- 1. crm.etiquetas: nome, cor e unidade (nula vale para as duas). Origem:
--    - 'crm': criada no CRM; a equipe cria, edita e apaga (mesma regra das
--      respostas prontas: atendente só as da unidade dela, as das duas unidades
--      ficam com a direção e a gerente);
--    - 'whatsapp': vem do celular da unidade (wa_account_id + wa_label_id); só a
--      sincronização grava. No CRM fica só para leitura: edita-se no celular.
-- 2. crm.conversa_etiquetas: etiqueta marcada numa conversa. Marcação 'crm' a
--    equipe põe e tira no CRM; marcação 'whatsapp' vem do celular e só a
--    sincronização mexe. Etiqueta do celular só se marca pelo celular.
-- 3. Regras de acesso: vê quem enxerga a conversa e a etiqueta (unidade isolada).
--
-- Ordem: aplicar antes do merge (a tela lê as tabelas novas).
-- Desfazer: drop table crm.conversa_etiquetas, crm.etiquetas; reverter o merge.

begin;

-- ---------------------------------------------------------------- 1
create table if not exists crm.etiquetas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references crm.tenants(id) on delete cascade,
  unidade       text,
  nome          text not null check (length(btrim(nome)) between 1 and 40),
  cor           text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  origem        text not null default 'crm' check (origem in ('crm', 'whatsapp')),
  wa_account_id uuid references crm.wa_accounts(id) on delete cascade,
  wa_label_id   text,
  created_by    uuid references crm.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (tenant_id, unidade) references crm.wa_accounts(tenant_id, unidade)
    on update cascade on delete cascade,
  check ((origem = 'whatsapp') = (wa_account_id is not null and wa_label_id is not null))
);

create unique index if not exists etiquetas_do_whatsapp
  on crm.etiquetas (wa_account_id, wa_label_id) where origem = 'whatsapp';
create unique index if not exists etiquetas_do_crm_nome
  on crm.etiquetas (tenant_id, coalesce(unidade, ''), lower(btrim(nome))) where origem = 'crm';

drop trigger if exists update_etiquetas_updated_at on crm.etiquetas;
create trigger update_etiquetas_updated_at before update on crm.etiquetas
  for each row execute function crm.update_updated_at_column();

-- ---------------------------------------------------------------- 2
create table if not exists crm.conversa_etiquetas (
  conversation_id uuid not null references crm.conversations(id) on delete cascade,
  etiqueta_id     uuid not null references crm.etiquetas(id) on delete cascade,
  tenant_id       uuid not null default crm.get_user_tenant_id(auth.uid())
                  references crm.tenants(id) on delete cascade,
  origem          text not null default 'crm' check (origem in ('crm', 'whatsapp')),
  created_by      uuid default auth.uid() references crm.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, etiqueta_id)
);
create index if not exists conversa_etiquetas_etiqueta on crm.conversa_etiquetas (etiqueta_id);
create index if not exists conversa_etiquetas_tenant on crm.conversa_etiquetas (tenant_id);

-- ---------------------------------------------------------------- 3
alter table crm.etiquetas enable row level security;
alter table crm.conversa_etiquetas enable row level security;
revoke all on crm.etiquetas, crm.conversa_etiquetas from anon, authenticated;
grant select, insert, update, delete on crm.etiquetas to authenticated;
grant select, insert, delete on crm.conversa_etiquetas to authenticated;

drop policy if exists "Etiquetas: ver" on crm.etiquetas;
create policy "Etiquetas: ver" on crm.etiquetas
  for select to authenticated
  using (
    (select crm.my_tenant_has_module('atendimento'))
    and tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and (
      unidade is null
      or not (select crm.tenant_unidades_isoladas())
      or (select crm.my_unidade()) is null
      or unidade = (select crm.my_unidade())
    )
  );

-- Só as criadas no CRM; as do celular, só a sincronização (chave de serviço).
drop policy if exists "Etiquetas: gerir as do CRM" on crm.etiquetas;
create policy "Etiquetas: gerir as do CRM" on crm.etiquetas
  for all to authenticated
  using (
    origem = 'crm'
    and (select crm.my_tenant_has_module('atendimento'))
    and tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and (
      (select crm.has_role(auth.uid(), 'admin'))
      or (select crm.has_role(auth.uid(), 'manager'))
      or (select crm.has_role(auth.uid(), 'atendente'))
    )
    and (
      not (select crm.tenant_unidades_isoladas())
      or (select crm.my_unidade()) is null
      or unidade = (select crm.my_unidade())
    )
  )
  with check (
    origem = 'crm' and wa_account_id is null and wa_label_id is null
    and (select crm.my_tenant_has_module('atendimento'))
    and tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and (
      (select crm.has_role(auth.uid(), 'admin'))
      or (select crm.has_role(auth.uid(), 'manager'))
      or (select crm.has_role(auth.uid(), 'atendente'))
    )
    and (
      not (select crm.tenant_unidades_isoladas())
      or (select crm.my_unidade()) is null
      or unidade = (select crm.my_unidade())
    )
  );

-- A conversa e a etiqueta são lidas com as regras delas: só vê a marcação quem
-- enxerga as duas.
drop policy if exists "Marcações: ver" on crm.conversa_etiquetas;
create policy "Marcações: ver" on crm.conversa_etiquetas
  for select to authenticated
  using (
    tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and exists (select 1 from crm.conversations c where c.id = conversation_id)
    and exists (select 1 from crm.etiquetas e where e.id = etiqueta_id)
  );

drop policy if exists "Marcações: pôr as do CRM" on crm.conversa_etiquetas;
create policy "Marcações: pôr as do CRM" on crm.conversa_etiquetas
  for insert to authenticated
  with check (
    origem = 'crm'
    and tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and exists (select 1 from crm.conversations c where c.id = conversation_id)
    and exists (select 1 from crm.etiquetas e where e.id = etiqueta_id and e.origem = 'crm')
  );

drop policy if exists "Marcações: tirar as do CRM" on crm.conversa_etiquetas;
create policy "Marcações: tirar as do CRM" on crm.conversa_etiquetas
  for delete to authenticated
  using (
    origem = 'crm'
    and tenant_id = (select crm.get_user_tenant_id(auth.uid()))
    and exists (select 1 from crm.conversations c where c.id = conversation_id)
  );

commit;
