// Envio de texto, foto, vídeo, áudio e documento pelo painel de atendimento.
//
// Quem autoriza é o RLS: a conversa é lida com o token de quem clicou, então só
// sai mensagem de conversa que a pessoa enxerga (empresa, módulo, papel e unidade).
//
// A Evolution não devolve pelo webhook o que foi enviado pela API (o evento é
// SEND_MESSAGE, e as instâncias escutam só MESSAGES_UPSERT). Por isso a mensagem
// é gravada aqui mesmo em public.messages, o que já fecha o SLA do Radar pelo
// trigger dele e atualiza a conversa pelo trigger do CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { configDaConta, enviarAnexo, enviarResposta, reiniciarConexao, tipoDoAnexo } from "../_shared/wa-provider.ts";

// Do runtime do Supabase: segura a função viva até a promessa terminar.
declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void };

// 10 MB de arquivo viram cerca de 13,4 MB em base64.
const LIMITE_BASE64 = 14_000_000;
const TIPO_MENSAGEM = { image: "imageMessage", video: "videoMessage", audio: "audioMessage", document: "documentMessage" };

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
      db: { schema: "crm" },
    });
    // Tempo de cada etapa, numa linha de registro por envio (item 3 da reunião de 05/11).
    const tempos: Record<string, number> = {};
    let marca = performance.now();
    const medir = (etapa: string) => {
      const agora = performance.now();
      tempos[etapa] = Math.round(agora - marca);
      marca = agora;
    };

    const { data: { user } } = await comoUsuario.auth.getUser();
    medir("login");
    if (!user) return resposta({ error: "not_authenticated" }, 401);

    // anexo: { base64, mimetype, nome }. Com anexo, o texto vira a legenda
    // (áudio não tem legenda: a tela manda o texto à parte).
    const { conversation_id, texto, anexo } = await req.json();
    const corpo = String(texto ?? "").trim();
    if (!conversation_id || (!corpo && !anexo)) return resposta({ error: "dados_invalidos" }, 400);
    if (corpo.length > 4096) return resposta({ error: "texto_longo" }, 400);
    if (anexo && (typeof anexo.base64 !== "string" || !anexo.base64 || typeof anexo.mimetype !== "string")) {
      return resposta({ error: "dados_invalidos" }, 400);
    }
    if (anexo && anexo.base64.length > LIMITE_BASE64) return resposta({ error: "arquivo_grande" }, 413);
    const tipo = anexo ? tipoDoAnexo(anexo.mimetype) : null;

    const { data: conversa } = await comoUsuario
      .from("conversations")
      .select("id, tenant_id, phone, radar_company_id, radar_lead_id, assigned_to, window_expires_at, wa_accounts(id, unidade, provedor, instancia, phone_number_id, ativo)")
      .eq("id", conversation_id)
      .maybeSingle();
    medir("conversa");
    if (!conversa) return resposta({ error: "sem_acesso" }, 403);

    const conta = (conversa as any).wa_accounts;
    if (!conta?.ativo) return resposta({ error: "numero_inativo" }, 409);

    // Na Cloud API, fora da janela de 24h só template aprovado. Na Evolution não
    // existe janela técnica.
    if (conta.provedor === "cloud") {
      const aberta = conversa.window_expires_at && new Date(conversa.window_expires_at) > new Date();
      if (!aberta) return resposta({ error: "janela_fechada" }, 409);
    }

    const legenda = tipo === "audio" ? null : corpo || null;
    const envio = tipo
      ? await enviarAnexo(configDaConta(conta), conversa.phone, {
          tipo, base64: anexo.base64, mimetype: anexo.mimetype, nome: anexo.nome ?? null, legenda,
        })
      : await enviarResposta(configDaConta(conta), conversa.phone, corpo);
    medir("whatsapp");
    const admin = createClient(supabaseUrl, serviceKey);
    if (!envio.ok && envio.semResposta) {
      // Processamento do número travado na Evolution (Lapa, 03/11: 52 min sem
      // receber nem enviar). Marca o número (a faixa aparece na tela) e reinicia
      // a conexão, no máximo uma vez a cada 10 min (37-saude-do-whatsapp.sql). O
      // reinício roda depois da resposta, para a tela avisar sem esperar.
      console.error("[wa-enviar] sem resposta", conta.instancia);
      const { data: reinicia } = await admin.schema("crm")
        .rpc("wa_marcar_sem_resposta", { _conta: conta.id, _erro: "envio sem resposta da Evolution" });
      if (reinicia) {
        EdgeRuntime.waitUntil(reiniciarConexao(configDaConta(conta)).then((r) =>
          admin.schema("crm").from("wa_conexao_eventos").insert({
            wa_account_id: conta.id, tenant_id: (conversa as any).tenant_id, unidade: conta.unidade ?? null,
            evento: "reiniciou", detalhe: r,
          })
        ));
      }
      return resposta({ error: "whatsapp_sem_resposta" }, 504);
    }
    if (!envio.ok) {
      console.error("[wa-enviar] falha", envio.error);
      return resposta({ error: "falha_envio", detalhe: envio.error }, 502);
    }

    const idProvedor = envio.providerId ?? `crm-${crypto.randomUUID()}`;
    const linha = {
      company_id: conversa.radar_company_id,
      lead_id: conversa.radar_lead_id,
      phone_number: conversa.phone,
      instance_name: conta.instancia,
      evolution_message_id: idProvedor,
      // Como o Radar grava mídia: a legenda, ou "[mídia]" sem legenda.
      body: tipo ? legenda ?? "[mídia]" : corpo,
      message_type: tipo ? TIPO_MENSAGEM[tipo] : "conversation",
      is_from_me: true,
      timestamp_unix: Math.floor(Date.now() / 1000),
      sent_by: user.id,
    };

    const { data: gravada, error: erroGravar } = await admin
      .from("messages")
      .insert(linha)
      .select("id")
      .maybeSingle();

    let registrada = !erroGravar;
    if (erroGravar?.code === "23505") {
      // O classifier chegou antes com a mesma mensagem: só marca quem enviou.
      await admin
        .from("messages")
        .update({ sent_by: user.id })
        .eq("company_id", linha.company_id)
        .eq("evolution_message_id", idProvedor)
        .is("sent_by", null);
      registrada = true;
    } else if (erroGravar) {
      console.error("[wa-enviar] enviada mas nao registrada", erroGravar);
    }

    // Quem responde primeiro assume a conversa, se ninguém tinha assumido. Quem
    // está oculto na empresa (o suporte da Dom) não assume: a conversa ficaria
    // presa num responsável que a equipe não vê, fora de "Sem responsável".
    // Grupo do WhatsApp (46-grupos-do-whatsapp.sql) é da equipe toda: não tem dono.
    const grupo = String(conversa.phone).endsWith("@g.us");
    const { data: papel } = conversa.assigned_to || grupo
      ? { data: null }
      : await admin.schema("crm").from("user_roles").select("oculto")
          .eq("user_id", user.id).eq("tenant_id", (conversa as any).tenant_id).maybeSingle();
    if (!conversa.assigned_to && !grupo && !papel?.oculto) {
      await admin
        .schema("crm")
        .from("conversations")
        .update({ assigned_to: user.id })
        .eq("id", conversa.id)
        .is("assigned_to", null);
    }
    medir("gravar");
    console.log("[wa-enviar] tempos", JSON.stringify({ tipo: tipo ?? "texto", unidade: conta.unidade ?? null, ...tempos }));

    return resposta({ ok: true, registrada, message_id: gravada?.id ?? null });
  } catch (err) {
    console.error("[wa-enviar] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
