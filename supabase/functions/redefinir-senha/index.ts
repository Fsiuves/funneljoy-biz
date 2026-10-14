// A direção, ou a gerente para as atendentes, dá uma senha provisória nova.
//
// Existe porque a recuperação por email não está de pé, e porque na clínica
// quem resolve senha esquecida é a direção ou a gerente, não a Dom. Quem pode
// mexer em quem está em _shared/equipe.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { podeGerirAcesso } from "../_shared/equipe.ts";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const senhaForte = (s: string) =>
  s.length >= 8 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);

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

    const { user_id, password } = await req.json();
    const senha = String(password ?? "");
    if (!user_id) return resposta({ error: "dados_invalidos" }, 400);
    if (!senhaForte(senha)) return resposta({ error: "senha_fraca" }, 400);

    const crm = createClient(supabaseUrl, serviceKey, { db: { schema: "crm" } });
    const permissao = await podeGerirAcesso(crm, quemPede.id, user_id);
    if (!permissao.ok) return resposta({ error: permissao.erro }, permissao.status);

    const admin = createClient(supabaseUrl, serviceKey);
    // Provisória: a pessoa cria a dela no próximo acesso.
    const { error } = await admin.auth.admin.updateUserById(user_id, {
      password: senha,
      user_metadata: { senha_provisoria: true },
    });
    if (error) {
      console.error("[redefinir-senha]", error.message);
      return resposta({ error: "falha" }, 500);
    }
    return resposta({ ok: true });
  } catch (err) {
    console.error("[redefinir-senha] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
