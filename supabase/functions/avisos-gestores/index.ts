// Envia os avisos automáticos aos gestores pelo WhatsApp da Dom (a instância
// da Evolution que manda os alertas do Vigia). O que sai, quando e para quem
// está em crm.avisos_pendentes (21-avisos.sql); aqui só se envia e registra.
//
// Dois jeitos de chamar:
//  - o pg_cron, a cada 10 minutos, com o cabeçalho x-avisos-segredo: envia o
//    que estiver pendente em todas as empresas;
//  - direção ou gerente, pela tela de Configurações: { acao: "teste" } manda uma
//    mensagem de teste para os destinatários; { acao: "previa" } devolve o que
//    sairia agora, sem enviar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Destinatario { nome: string | null; telefone: string }

async function enviar(numero: string, texto: string) {
  const url = `${Deno.env.get("EVOLUTION_URL")}/message/sendText/${Deno.env.get("EVOLUTION_INSTANCIA")}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { apikey: Deno.env.get("EVOLUTION_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    if (r.ok) return { numero, ok: true };
    return { numero, ok: false, erro: `${r.status} ${(await r.text()).slice(0, 200)}` };
  } catch (e) {
    return { numero, ok: false, erro: String(e) };
  }
}

async function enviarParaTodos(destinatarios: Destinatario[], texto: string) {
  const envios = [];
  for (const d of destinatarios) envios.push(await enviar(d.telefone, texto));
  return envios;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const crm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      db: { schema: "crm" },
    });

    // ---------------------------------------------------- pg_cron
    const segredo = req.headers.get("x-avisos-segredo");
    if (segredo) {
      if (segredo !== Deno.env.get("AVISOS_SEGREDO")) return resposta({ error: "not_authorized" }, 401);
      const { data: pendentes, error } = await crm.rpc("avisos_pendentes");
      if (error) throw new Error(error.message);
      const feitos = [];
      for (const a of pendentes ?? []) {
        const envios = await enviarParaTodos(a.destinatarios ?? [], a.texto);
        await crm.from("avisos_enviados").insert({
          tenant_id: a.tenant_id, tipo: a.tipo, unidade: a.unidade, chave: a.chave,
          texto: a.texto, destinatarios: a.destinatarios, resultado: { envios },
        });
        feitos.push({ tipo: a.tipo, unidade: a.unidade, ok: envios.filter((e) => e.ok).length, falhas: envios.filter((e) => !e.ok).length });
      }
      return resposta({ ok: true, avisos: feitos });
    }

    // ---------------------------------------------------- pela tela
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return resposta({ error: "not_authenticated" }, 401);
    const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return resposta({ error: "not_authenticated" }, 401);
    const { data: tenant } = await crm.rpc("get_user_tenant_id", { _user_id: user.id });
    const { data: papel } = tenant ? await crm.rpc("get_user_role", { _user_id: user.id, _tenant_id: tenant }) : { data: null };
    if (!tenant || !["admin", "manager"].includes(papel)) return resposta({ error: "not_authorized" }, 403);

    const { acao } = await req.json().catch(() => ({}));
    if (acao === "previa") {
      const { data, error } = await crm.rpc("avisos_pendentes", { _so_tenant: tenant });
      if (error) throw new Error(error.message);
      return resposta({ ok: true, avisos: (data ?? []).map((a: any) => ({ tipo: a.tipo, unidade: a.unidade, texto: a.texto })) });
    }
    if (acao === "teste") {
      const { data: cfg } = await crm.rpc("avisos_config_de", { _tenant: tenant });
      const { data: empresa } = await crm.from("tenants").select("name").eq("id", tenant).single();
      const destinatarios: Destinatario[] = cfg?.destinatarios ?? [];
      if (!destinatarios.length) return resposta({ ok: false, error: "sem_destinatarios" });
      const texto = `*${empresa?.name ?? "CRM"}*\nTeste dos avisos do CRM. Se esta mensagem chegou, os avisos vão chegar neste número.`;
      const envios = await enviarParaTodos(destinatarios, texto);
      await crm.from("avisos_enviados").insert({
        tenant_id: tenant, tipo: "teste", chave: `teste:${new Date().toISOString()}`,
        texto, destinatarios, resultado: { envios, por: user.id },
      });
      return resposta({ ok: envios.every((e) => e.ok), envios });
    }
    return resposta({ error: "acao_invalida" }, 400);
  } catch (err) {
    console.error("[avisos-gestores] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
