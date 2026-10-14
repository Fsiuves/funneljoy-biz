// Edita um integrante da equipe: nome, usuário, função e unidade.
//
// Quem edita quem, e o que cada um pode virar, está em crm.editar_integrante
// (13-editar-integrante.sql). Aqui fica o que só o Auth faz: trocar o endereço
// interno quando o usuário muda, e o nome que aparece no rodapé do menu, que o
// front lê do user_metadata.
//
// Ordem: confere no banco sem mudar nada, troca o email no Auth, aplica no
// banco. Se o banco recusar depois da troca, o email volta ao que era.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { user_id, name, email, role, unidade } = await req.json();
    if (!user_id || typeof name !== "string" || !role) return resposta({ error: "dados_invalidos" }, 400);

    const emailNovo = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const crm = createClient(supabaseUrl, serviceKey, { db: { schema: "crm" } });
    const args = {
      _caller: quemPede.id,
      _alvo: user_id,
      _name: name,
      _role: role,
      _unidade: unidade || null,
      _email: emailNovo,
    };

    const { data: conferido, error: erroConferir } = await crm.rpc("editar_integrante", { ...args, _aplicar: false });
    if (erroConferir) {
      console.error("[editar-equipe] conferir", erroConferir.message);
      return resposta({ error: "falha" }, 500);
    }
    if (!conferido?.success) return resposta({ error: conferido?.error ?? "falha" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    if (conferido.email_muda) {
      const { error } = await admin.auth.admin.updateUserById(user_id, { email: emailNovo!, email_confirm: true });
      if (error) {
        console.error("[editar-equipe] email", error.message);
        const emUso = /already|registered|exists/i.test(error.message);
        return resposta({ error: emUso ? "usuario_em_uso" : "falha" }, emUso ? 400 : 500);
      }
    }

    const { data: aplicado, error: erroAplicar } = await crm.rpc("editar_integrante", { ...args, _aplicar: true });
    if (erroAplicar || !aplicado?.success) {
      if (conferido.email_muda) {
        await admin.auth.admin.updateUserById(user_id, { email: conferido.email_antigo, email_confirm: true });
      }
      console.error("[editar-equipe] aplicar", erroAplicar?.message ?? aplicado?.error);
      return resposta({ error: aplicado?.error ?? "falha" }, erroAplicar ? 500 : 400);
    }

    // O Auth mescla o user_metadata: a marca de senha provisória, se houver, fica.
    const { error: erroNome } = await admin.auth.admin.updateUserById(user_id, {
      user_metadata: { name: name.trim() },
    });
    if (erroNome) console.error("[editar-equipe] nome no auth", erroNome.message);

    return resposta({
      ok: true,
      usuario_mudou: conferido.email_muda,
      conversas_liberadas: aplicado.conversas_liberadas ?? 0,
    });
  } catch (err) {
    console.error("[editar-equipe] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
