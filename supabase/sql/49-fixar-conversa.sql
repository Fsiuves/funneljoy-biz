-- 49: fixar conversa no topo, para a unidade inteira (pedido da clínica em 12/11/2026,
-- lista da Mari, item 3: "fixar conversas e grupos no topo da lista de mensagens").
-- Decisão do Fred em 16/11: o que uma pessoa fixa vale para todos da unidade, como
-- no celular da unidade.
--
-- 1. crm.conversations.fixada_em e fixada_por. A tela grava só fixada_em (grant por
--    coluna, como responsável, status e lidas); quem pode é quem pode alterar a
--    conversa (regra "Atendimento: atualizar conversas").
-- 2. Gatilho: ao fixar, a hora é a do servidor (o relógio do computador da Lapa já
--    esteve atrasado) e fixada_por é quem fixou; ao desafixar, os dois ficam nulos.
--
-- Ordem: aplicar antes do merge (a tela lê e grava as colunas novas).
-- Desfazer: apagar o gatilho, a função e as duas colunas; reverter o merge.

begin;

alter table crm.conversations
  add column if not exists fixada_em  timestamptz,
  add column if not exists fixada_por uuid references crm.profiles(id) on delete set null;
create index if not exists conversations_fixadas
  on crm.conversations (tenant_id, fixada_em) where fixada_em is not null;

grant update (fixada_em) on crm.conversations to authenticated;

create or replace function crm.conversa_fixada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fixada_em is distinct from old.fixada_em then
    if new.fixada_em is null then
      new.fixada_por := null;
    else
      new.fixada_em := now();
      new.fixada_por := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversa_fixada on crm.conversations;
create trigger conversa_fixada
  before update of fixada_em on crm.conversations
  for each row execute function crm.conversa_fixada();

commit;
