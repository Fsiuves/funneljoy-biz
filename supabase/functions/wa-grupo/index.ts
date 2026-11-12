// Mensagens de grupo do WhatsApp da clínica, para o Atendimento (pedido da clínica
// em 12/11/2026: o grupo do time, onde a equipe sempre manda mensagem).
//
// O classificador do n8n só trata conversa individual (nó "Filtra Mensagens
// Válidas"). O que é de grupo (@g.us) ele manda para cá, com o segredo
// WA_GRUPO_SEGREDO no cabeçalho x-grupo-segredo. Publicada com --no-verify-jwt:
// quem chama é o n8n, sem login.
//
// Grava em public.messages como as outras mensagens, com o grupo no lugar do
// telefone e quem escreveu em `autor`. A ponte (crm.on_radar_message) cria a
// conversa; grupo conta como conversa da equipe (crm.telefone_da_equipe em
// 46-grupos-do-whatsapp.sql): sem paciente, sem funil, fora dos avisos e de
// Resultados. Só para os números que estão no CRM (crm.wa_accounts).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { configDaConta, nomeDoGrupo } from "../_shared/wa-provider.ts";

// Os mesmos que a ponte ignora: não são conversa.
const IGNORADOS = new Set([
  "reactionMessage", "protocolMessage", "secretEncryptedMessage", "pinInChatMessage",
  "associatedChildMessage", "encEventResponseMessage", "senderKeyDistributionMessage", "editedMessage",
  "messageContextInfo",
]);

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
function textoDa(m: any): string | null {
  return m?.conversation ?? m?.extendedTextMessage?.text ?? m?.imageMessage?.caption ?? m?.videoMessage?.caption
    ?? m?.documentMessage?.caption ?? m?.documentWithCaptionMessage?.message?.documentMessage?.caption ?? null;
}

Deno.serve(async (req) => {
  const segredo = Deno.env.get("WA_GRUPO_SEGREDO");
  if (!segredo || req.headers.get("x-grupo-segredo") !== segredo) return resposta({ error: "nao_autorizado" }, 401);

  try {
    const corpo = await req.json().catch(() => null);
    const ev = corpo?.body?.data ? corpo.body : corpo; // o n8n manda o corpo do webhook da Evolution
    const d = ev?.data;
    const chave = d?.key;
    const grupo: string | undefined = chave?.remoteJid;
    if (!String(ev?.event ?? "").includes("messages.upsert") || !grupo?.endsWith("@g.us") || !chave?.id) {
      return resposta({ ignorado: "nao_e_mensagem_de_grupo" });
    }
    const tipo: string = d.messageType ?? Object.keys(d.message ?? {})[0] ?? "conversation";
    if (IGNORADOS.has(tipo)) return resposta({ ignorado: tipo });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conta } = await admin.schema("crm").from("wa_accounts")
      .select("id, provedor, instancia, phone_number_id, radar_company_id")
      .eq("instancia", ev.instance).eq("ativo", true).maybeSingle();
    if (!conta?.radar_company_id) return resposta({ ignorado: "numero_fora_do_crm" });

    const texto = textoDa(d.message)?.trim();
    const deMim = chave.fromMe === true;
    // Quem escreveu: o nome no WhatsApp; sem nome, o número. Mensagem nossa pelo
    // celular fica sem autor (a tela mostra "pelo celular").
    const numero = String(chave.participantAlt ?? chave.participantPn ?? chave.participant ?? "").split("@")[0];
    const autor = deMim ? null : (String(d.pushName ?? "").trim() || (numero ? `+${numero}` : null));

    const { error } = await admin.from("messages").insert({
      company_id: conta.radar_company_id,
      lead_id: null,
      phone_number: grupo,
      instance_name: conta.instancia,
      evolution_message_id: chave.id,
      body: texto || "[mídia]",
      message_type: tipo,
      is_from_me: deMim,
      timestamp_unix: Number(d.messageTimestamp) || Math.floor(Date.now() / 1000),
      autor,
    });
    // 23505: a mesma mensagem já chegou (a Evolution às vezes manda de novo).
    if (error && error.code !== "23505") {
      console.error("[wa-grupo] gravar", error.message);
      return resposta({ error: error.message }, 500);
    }

    const { data: conversa } = await admin.schema("crm").from("conversations")
      .select("id, contact_name").eq("wa_account_id", conta.id).eq("phone", grupo).maybeSingle();
    if (conversa && !conversa.contact_name) {
      const nome = await nomeDoGrupo(configDaConta(conta), grupo);
      if (nome) await admin.schema("crm").from("conversations").update({ contact_name: nome }).eq("id", conversa.id);
    }
    return resposta({ ok: true });
  } catch (err) {
    console.error("[wa-grupo] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
