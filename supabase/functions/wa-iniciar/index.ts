// Inicia conversa com um número digitado na busca do Atendimento (reunião de 05/11).
//
// Antes pergunta ao WhatsApp se o número existe e qual é o número real: as conversas são
// únicas por número exato, e com o número digitado a resposta de quem tem número sem o nono
// dígito abriria uma segunda conversa. A conversa nasce vazia; a mensagem sai pela wa-enviar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { configDaConta, verificarNumero } from "../_shared/wa-provider.ts";

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
      db: { schema: "crm" },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return resposta({ error: "not_authenticated" }, 401);

    const { telefone, unidade } = await req.json();
    const digitado = String(telefone ?? "").trim();
    const digitos = digitado.replace(/\D/g, "");
    // Sem o + vale número do Brasil; número de fora precisa vir com o +.
    const numero = digitado.startsWith("+") || digitos.length > 11 ? digitos : `55${digitos}`;
    if (numero.length < 12 || numero.length > 15) return resposta({ error: "telefone_invalido" }, 400);

    // Quem autoriza é o RLS: só vêm os números que a pessoa enxerga.
    const { data: contas } = await comoUsuario
      .from("wa_accounts")
      .select("id, unidade, provedor, instancia, phone_number_id, ativo")
      .eq("ativo", true);
    const opcoes = (contas ?? []).filter((c: any) => !unidade || c.unidade === unidade);
    if (!opcoes.length) return resposta({ error: "sem_acesso" }, 403);
    if (opcoes.length > 1) return resposta({ error: "escolha_unidade" }, 400);
    const conta = opcoes[0] as any;
    // Na Cloud API, fora da janela de 24h só template aprovado.
    if (conta.provedor !== "evolution") return resposta({ error: "janela_fechada" }, 409);

    const achado = await verificarNumero(configDaConta(conta), numero);
    if (achado.semResposta) return resposta({ error: "whatsapp_sem_resposta" }, 504);
    if (!achado.ok) {
      console.error("[wa-iniciar] falha", achado.error);
      return resposta({ error: "falha_envio", detalhe: achado.error }, 502);
    }
    if (!achado.numero) return resposta({ error: "sem_whatsapp" }, 404);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: id, error } = await admin.schema("crm")
      .rpc("iniciar_conversa", { _conta: conta.id, _telefone: achado.numero, _usuario: user.id });
    if (error) throw new Error(error.message);
    if (!id) return resposta({ error: "sem_acesso" }, 403);
    return resposta({ ok: true, conversation_id: id });
  } catch (err) {
    console.error("[wa-iniciar] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
