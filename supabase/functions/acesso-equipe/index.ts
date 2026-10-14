// Desativa ou reativa o acesso de alguém da equipe.
//
// Desativar, em três camadas:
//   1. crm.profiles.ativo = false: get_user_tenant_id deixa de devolver a
//      empresa, e todas as políticas fecham na hora, mesmo com a sessão aberta;
//   2. bloqueio no Supabase Auth: a pessoa não entra de novo nem renova a sessão;
//   3. as conversas dela voltam para "Sem responsável", para nada ficar parado
//      no nome de quem saiu.
// O histórico fica: mensagens enviadas por ela continuam com o nome dela.
// Quem pode mexer em quem está em _shared/equipe.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { podeGerirAcesso } from "../_shared/equipe.ts";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return resposta({ error: "not_authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const comoUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: quemPede } } = await comoUsuario.auth.getUser();
    if (!quemPede) return resposta({ error: "not_authenticated" }, 401);

    const { user_id, ativo } = await req.json();
    if (!user_id || typeof ativo !== "boolean") return resposta({ error: "dados_invalidos" }, 400);

    const crm = createClient(supabaseUrl, serviceKey, { db: { schema: "crm" } });
    const permissao = await podeGerirAcesso(crm, quemPede.id, user_id);
    if (!permissao.ok) return resposta({ error: permissao.erro }, permissao.status);

    const { error: erroPerfil } = await crm.from("profiles").update({ ativo }).eq("id", user_id);
    if (erroPerfil) {
      console.error("[acesso-equipe] perfil", erroPerfil.message);
      return resposta({ error: "falha" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: erroAuth } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: ativo ? "none" : "876000h",
    });
    if (erroAuth) {
      // O acesso aos dados já caiu pelo perfil; só o login não ficou bloqueado.
      console.error("[acesso-equipe] auth", erroAuth.message);
      return resposta({ error: "bloqueio_parcial" }, 500);
    }

    let conversasLiberadas = 0;
    if (!ativo) {
      const { data } = await crm
        .from("conversations")
        .update({ assigned_to: null })
        .eq("assigned_to", user_id)
        .eq("tenant_id", permissao.empresa)
        .select("id");
      conversasLiberadas = data?.length ?? 0;
    }

    return resposta({ ok: true, conversas_liberadas: conversasLiberadas });
  } catch (err) {
    console.error("[acesso-equipe] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
