-- 54: correções de segurança da auditoria de 21/11/2026 (Radar/fase3-inbox/auditoria-2026-11-21.md)
--
-- 1. crm.complete_team_member_setup: não puxa para a empresa uma conta que já
--    existia fora dela (tomada de conta: create-team-member ligava a conta de
--    outra pessoa pelo e-mail, e redefinir-senha trocava a senha dela). Também
--    não mexe em quem tem cargo em outra empresa.
-- 2. crm.salvar_avisos: até 10 números de destino (o teste dos avisos virava
--    disparo pelo número da Dom).
--
-- O resto da correção está nas funções create-team-member, avisos-gestores e
-- _shared/equipe.ts (acesso-equipe e redefinir-senha) e no front.
-- Ordem: aplicar a 54, publicar as funções e então fazer o merge.
-- Desfazer: reaplicar o texto das duas funções que está no fim deste arquivo.

begin;

-- ---------------------------------------------------------------- 1
CREATE OR REPLACE FUNCTION crm.complete_team_member_setup(_user_id uuid, _email text, _name text, _role crm.app_role, _unidade text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
declare
  v_caller_id uuid;
  v_tenant_id uuid;
  v_unidade text;
  v_erro text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return json_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_tenant_id := crm.get_user_tenant_id(v_caller_id);
  if v_tenant_id is null then
    return json_build_object('success', false, 'error', 'no_tenant');
  end if;

  -- Antes, o upsert abaixo trocava o tenant_id de quem já existia: convidar o
  -- email de alguém de outra empresa tirava essa pessoa de lá.
  if exists (
    select 1 from crm.profiles p
     where p.id = _user_id and p.tenant_id is not null and p.tenant_id <> v_tenant_id
  ) then
    return json_build_object('success', false, 'error', 'email_em_outra_empresa');
  end if;

  -- Auditoria de 21/11/2026 (54-seguranca-auditoria.sql): conta que já existia
  -- fora desta empresa não é puxada para ela. Sem esta trava, quem fosse admin
  -- de qualquer empresa (o cadastro é aberto) ligava a conta de outra pessoa
  -- pelo e-mail e depois trocava a senha dela. Entra só quem já é desta empresa
  -- ou a conta que o create-team-member acabou de criar: nova, nunca usada e
  -- fora do Radar. Quem tem cargo em outra empresa também não é mexido daqui
  -- (a mesma trava do podeGerirAcesso e do editar_integrante).
  if exists (select 1 from crm.user_roles r where r.user_id = _user_id and r.tenant_id <> v_tenant_id) then
    return json_build_object('success', false, 'error', 'pessoa_de_outra_empresa');
  end if;

  if not exists (select 1 from crm.profiles p where p.id = _user_id and p.tenant_id = v_tenant_id)
     and not exists (select 1 from auth.users u
                      where u.id = _user_id
                        and u.created_at > now() - interval '10 minutes'
                        and u.last_sign_in_at is null
                        and not exists (select 1 from public.user_companies uc where uc.user_id = u.id)) then
    return json_build_object('success', false, 'error', 'conta_existente');
  end if;

  -- Vazio vira nulo: campo em branco na tela significa direcao, nao unidade "".
  v_unidade := nullif(btrim(coalesce(_unidade, '')), '');

  v_erro := crm.regra_de_cadastro(v_caller_id, v_tenant_id, _role, v_unidade);
  if v_erro is not null then
    return json_build_object('success', false, 'error', v_erro);
  end if;

  -- A gerente só cria gente nova. Sem isto, chamando a função direto com o id
  -- da direção, ela a rebaixaria a atendente.
  if crm.get_user_role(v_caller_id, v_tenant_id) = 'manager'
     and exists (select 1 from crm.user_roles r where r.user_id = _user_id and r.tenant_id = v_tenant_id) then
    return json_build_object('success', false, 'error', 'ja_cadastrado');
  end if;

  insert into crm.profiles (id, email, name, tenant_id, unidade)
  values (_user_id, lower(btrim(_email)), btrim(_name), v_tenant_id, v_unidade)
  on conflict (id) do update set
    tenant_id = excluded.tenant_id,
    name      = excluded.name,
    unidade   = excluded.unidade;

  insert into crm.user_roles (user_id, tenant_id, role)
  values (_user_id, v_tenant_id, _role)
  on conflict (user_id, tenant_id) do update set role = excluded.role;

  return json_build_object('success', true, 'user_id', _user_id, 'unidade', v_unidade);
end;
$function$;

-- ---------------------------------------------------------------- 2
CREATE OR REPLACE FUNCTION crm.salvar_avisos(_config jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid := crm.get_user_tenant_id(v_caller);
  v_dest jsonb := '[]'::jsonb;
  d jsonb;
  v_tel text;
  v_dias jsonb;
  v_limpo jsonb;
begin
  if v_tenant is null or crm.get_user_role(v_caller, v_tenant) not in ('admin', 'manager') then
    return json_build_object('success', false, 'error', 'not_authorized');
  end if;

  for d in select * from jsonb_array_elements(coalesce(_config -> 'destinatarios', '[]'::jsonb)) loop
    v_tel := regexp_replace(coalesce(d ->> 'telefone', ''), '\D', '', 'g');
    if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
    if length(v_tel) not in (12, 13) then
      return json_build_object('success', false, 'error', 'telefone_invalido', 'telefone', d ->> 'telefone');
    end if;
    v_dest := v_dest || jsonb_build_object('nome', nullif(btrim(coalesce(d ->> 'nome', '')), ''), 'telefone', v_tel);
  end loop;

  -- Auditoria de 21/11/2026 (54-seguranca-auditoria.sql): sem limite, a lista
  -- virava disparo pelo número da Dom no teste dos avisos. Até 10 números.
  if jsonb_array_length(v_dest) > 10 then
    return json_build_object('success', false, 'error', 'destinatarios_demais');
  end if;

  select coalesce(jsonb_agg(distinct x::int order by x::int), '[]'::jsonb) into v_dias
    from jsonb_array_elements_text(coalesce(_config -> 'dias', '[]'::jsonb)) x
   where x ~ '^[1-7]$';

  begin
    perform (_config ->> 'inicio')::time, (_config ->> 'fim')::time, (_config ->> 'resumo_hora')::time;
  exception when others then
    return json_build_object('success', false, 'error', 'horario_invalido');
  end;
  if (_config ->> 'inicio')::time >= (_config ->> 'fim')::time then
    return json_build_object('success', false, 'error', 'horario_invalido');
  end if;
  if coalesce((_config ->> 'espera_minutos')::int, 0) not between 5 and 240 then
    return json_build_object('success', false, 'error', 'espera_invalida');
  end if;

  v_limpo := jsonb_build_object(
    'ativo', coalesce((_config ->> 'ativo')::boolean, false),
    'destinatarios', v_dest,
    'inicio', to_char((_config ->> 'inicio')::time, 'HH24:MI'),
    'fim', to_char((_config ->> 'fim')::time, 'HH24:MI'),
    'dias', v_dias,
    'espera_minutos', (_config ->> 'espera_minutos')::int,
    'resumo_hora', to_char((_config ->> 'resumo_hora')::time, 'HH24:MI'),
    'espera', coalesce((_config ->> 'espera')::boolean, true),
    'crm_fechado', coalesce((_config ->> 'crm_fechado')::boolean, true),
    'resumo', coalesce((_config ->> 'resumo')::boolean, true));

  update crm.tenants set config = jsonb_set(coalesce(config, '{}'::jsonb), '{avisos}', v_limpo) where id = v_tenant;
  return json_build_object('success', true, 'config', v_limpo);
end;
$function$;

commit;

-- ---------------------------------------------------------------- desfazer
-- As duas funções como estavam no banco em 21/11/2026:
-- CREATE OR REPLACE FUNCTION crm.complete_team_member_setup(_user_id uuid, _email text, _name text, _role crm.app_role, _unidade text DEFAULT NULL::text)
--  RETURNS json
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'crm', 'public'
-- AS $function$
-- declare
--   v_caller_id uuid;
--   v_tenant_id uuid;
--   v_unidade text;
--   v_erro text;
-- begin
--   v_caller_id := auth.uid();
--   if v_caller_id is null then
--     return json_build_object('success', false, 'error', 'not_authenticated');
--   end if;
--
--   v_tenant_id := crm.get_user_tenant_id(v_caller_id);
--   if v_tenant_id is null then
--     return json_build_object('success', false, 'error', 'no_tenant');
--   end if;
--
--   -- Antes, o upsert abaixo trocava o tenant_id de quem já existia: convidar o
--   -- email de alguém de outra empresa tirava essa pessoa de lá.
--   if exists (
--     select 1 from crm.profiles p
--      where p.id = _user_id and p.tenant_id is not null and p.tenant_id <> v_tenant_id
--   ) then
--     return json_build_object('success', false, 'error', 'email_em_outra_empresa');
--   end if;
--
--   -- Vazio vira nulo: campo em branco na tela significa direcao, nao unidade "".
--   v_unidade := nullif(btrim(coalesce(_unidade, '')), '');
--
--   v_erro := crm.regra_de_cadastro(v_caller_id, v_tenant_id, _role, v_unidade);
--   if v_erro is not null then
--     return json_build_object('success', false, 'error', v_erro);
--   end if;
--
--   -- A gerente só cria gente nova. Sem isto, chamando a função direto com o id
--   -- da direção, ela a rebaixaria a atendente.
--   if crm.get_user_role(v_caller_id, v_tenant_id) = 'manager'
--      and exists (select 1 from crm.user_roles r where r.user_id = _user_id and r.tenant_id = v_tenant_id) then
--     return json_build_object('success', false, 'error', 'ja_cadastrado');
--   end if;
--
--   insert into crm.profiles (id, email, name, tenant_id, unidade)
--   values (_user_id, lower(btrim(_email)), btrim(_name), v_tenant_id, v_unidade)
--   on conflict (id) do update set
--     tenant_id = excluded.tenant_id,
--     name      = excluded.name,
--     unidade   = excluded.unidade;
--
--   insert into crm.user_roles (user_id, tenant_id, role)
--   values (_user_id, v_tenant_id, _role)
--   on conflict (user_id, tenant_id) do update set role = excluded.role;
--
--   return json_build_object('success', true, 'user_id', _user_id, 'unidade', v_unidade);
-- end;
-- $function$;

-- CREATE OR REPLACE FUNCTION crm.salvar_avisos(_config jsonb)
--  RETURNS json
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'crm', 'public'
-- AS $function$
-- declare
--   v_caller uuid := auth.uid();
--   v_tenant uuid := crm.get_user_tenant_id(v_caller);
--   v_dest jsonb := '[]'::jsonb;
--   d jsonb;
--   v_tel text;
--   v_dias jsonb;
--   v_limpo jsonb;
-- begin
--   if v_tenant is null or crm.get_user_role(v_caller, v_tenant) not in ('admin', 'manager') then
--     return json_build_object('success', false, 'error', 'not_authorized');
--   end if;
--
--   for d in select * from jsonb_array_elements(coalesce(_config -> 'destinatarios', '[]'::jsonb)) loop
--     v_tel := regexp_replace(coalesce(d ->> 'telefone', ''), '\D', '', 'g');
--     if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
--     if length(v_tel) not in (12, 13) then
--       return json_build_object('success', false, 'error', 'telefone_invalido', 'telefone', d ->> 'telefone');
--     end if;
--     v_dest := v_dest || jsonb_build_object('nome', nullif(btrim(coalesce(d ->> 'nome', '')), ''), 'telefone', v_tel);
--   end loop;
--
--   select coalesce(jsonb_agg(distinct x::int order by x::int), '[]'::jsonb) into v_dias
--     from jsonb_array_elements_text(coalesce(_config -> 'dias', '[]'::jsonb)) x
--    where x ~ '^[1-7]$';
--
--   begin
--     perform (_config ->> 'inicio')::time, (_config ->> 'fim')::time, (_config ->> 'resumo_hora')::time;
--   exception when others then
--     return json_build_object('success', false, 'error', 'horario_invalido');
--   end;
--   if (_config ->> 'inicio')::time >= (_config ->> 'fim')::time then
--     return json_build_object('success', false, 'error', 'horario_invalido');
--   end if;
--   if coalesce((_config ->> 'espera_minutos')::int, 0) not between 5 and 240 then
--     return json_build_object('success', false, 'error', 'espera_invalida');
--   end if;
--
--   v_limpo := jsonb_build_object(
--     'ativo', coalesce((_config ->> 'ativo')::boolean, false),
--     'destinatarios', v_dest,
--     'inicio', to_char((_config ->> 'inicio')::time, 'HH24:MI'),
--     'fim', to_char((_config ->> 'fim')::time, 'HH24:MI'),
--     'dias', v_dias,
--     'espera_minutos', (_config ->> 'espera_minutos')::int,
--     'resumo_hora', to_char((_config ->> 'resumo_hora')::time, 'HH24:MI'),
--     'espera', coalesce((_config ->> 'espera')::boolean, true),
--     'crm_fechado', coalesce((_config ->> 'crm_fechado')::boolean, true),
--     'resumo', coalesce((_config ->> 'resumo')::boolean, true));
--
--   update crm.tenants set config = jsonb_set(coalesce(config, '{}'::jsonb), '{avisos}', v_limpo) where id = v_tenant;
--   return json_build_object('success', true, 'config', v_limpo);
-- end;
-- $function$;
