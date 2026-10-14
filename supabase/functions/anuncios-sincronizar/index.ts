// Copia do Vigia da Performance o que a tela de resultados precisa: o gasto de
// cada anúncio por dia (Meta e Google Ads) e de qual anúncio veio cada contato
// (ad_leads). Ver 19-resultados.sql.
//
// O Vigia guarda as contas e os tokens e renova o do Google a cada hora; aqui só
// se lê. A unidade do gasto sai do nome da campanha ("[LAPA]", "CA - Osasco 09");
// a do contato, do número de WhatsApp em que ele chegou.
//
// Chamada pela própria tela quando os dados estão velhos, por quem é direção ou
// gerente. Entre uma e outra, no mínimo 10 minutos, a não ser com "forcar".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sincronizarAnuncios } from "../_shared/anuncios.ts";

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
    const comoUsuario = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return resposta({ error: "not_authenticated" }, 401);

    const crm = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "crm" } });
    const { data: tenant } = await crm.rpc("get_user_tenant_id", { _user_id: user.id });
    const { data: papel } = tenant ? await crm.rpc("get_user_role", { _user_id: user.id, _tenant_id: tenant }) : { data: null };
    if (!tenant || !["admin", "manager"].includes(papel)) return resposta({ error: "not_authorized" }, 403);

    const { forcar } = await req.json().catch(() => ({}));
    const { data: ultima } = await crm.from("anuncio_sync").select("*").eq("tenant_id", tenant).maybeSingle();
    const agora = Date.now();
    if (ultima?.iniciado_em && (!ultima.concluido_em || ultima.concluido_em < ultima.iniciado_em) &&
        agora - new Date(ultima.iniciado_em).getTime() < 120_000) {
      return resposta({ ok: true, em_andamento: true });
    }
    if (!forcar && ultima?.concluido_em && agora - new Date(ultima.concluido_em).getTime() < 600_000) {
      return resposta({ ok: true, recente: true });
    }

    const { data: empresa } = await crm.from("tenants").select("config").eq("id", tenant).single();
    const workspaces: string[] = empresa?.config?.anuncios?.vigia_workspaces ?? [];
    if (!workspaces.length) return resposta({ ok: false, error: "sem_contas" });

    await crm.from("anuncio_sync").upsert({ tenant_id: tenant, iniciado_em: new Date().toISOString() });

    return resposta(await sincronizarAnuncios(crm, tenant, workspaces));
  } catch (err) {
    console.error("[anuncios-sincronizar] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
