// Foto, áudio, vídeo e documento sob demanda, para a tela de atendimento.
//
// O Radar guarda só o texto: mídia fica como "[mídia]" em public.messages, e o
// arquivo continua no provedor. Esta função busca lá quando alguém clica.
// A mensagem é lida com o token de quem clicou, então a policy de
// public.messages decide: só abre mídia de conversa que a pessoa enxerga.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { baixarMidia, configDaConta } from "../_shared/wa-provider.ts";

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
    const comoUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return resposta({ error: "not_authenticated" }, 401);

    const { message_id } = await req.json();
    if (!message_id) return resposta({ error: "dados_invalidos" }, 400);

    const { data: msg } = await comoUsuario
      .from("messages")
      .select("id, company_id, evolution_message_id")
      .eq("id", message_id)
      .maybeSingle();
    if (!msg?.evolution_message_id) return resposta({ error: "sem_acesso" }, 403);

    const { data: conta } = await comoUsuario
      .schema("crm")
      .from("wa_accounts")
      .select("provedor, instancia, phone_number_id")
      .eq("radar_company_id", msg.company_id)
      .maybeSingle();
    if (!conta) return resposta({ error: "sem_acesso" }, 403);

    const midia = await baixarMidia(configDaConta(conta), msg.evolution_message_id);
    if (!midia.ok) {
      console.error("[wa-midia] falha", midia.error);
      return resposta({ error: "midia_indisponivel" }, 404);
    }
    return resposta({ base64: midia.base64, mimetype: midia.mimetype });
  } catch (err) {
    console.error("[wa-midia] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
