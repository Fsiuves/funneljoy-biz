// Etiquetas do celular no CRM (decisão do Fred em 16/11/2026; supabase/sql/51-etiquetas-do-celular.sql).
//
// Quem chama é o script do servidor da Evolution (/root/evolution-etiquetas/etiquetas.sh,
// fonte em Radar/fase3-inbox/evolution-etiquetas), a cada minuto, com o segredo
// WA_ETIQUETAS_SEGREDO no cabeçalho x-etiquetas-segredo. Publicada com --no-verify-jwt.
//
// GET: os números do CRM que usam a Evolution. O script só lê esses: etiqueta de
//      número de outro cliente do servidor não sai de lá.
// POST { instancias: [{ instancia, etiquetas: [{ id, nome, cor }], marcacoes: [{ telefone, etiquetas: [id] }] }] }
//      grava cada número por crm.sincronizar_etiquetas_whatsapp e devolve o que mudou.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const segredo = Deno.env.get("WA_ETIQUETAS_SEGREDO");
  if (!segredo || req.headers.get("x-etiquetas-segredo") !== segredo) return resposta({ error: "nao_autorizado" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const crm = admin.schema("crm");

  try {
    const { data: contas, error } = await crm.from("wa_accounts")
      .select("instancia").eq("provedor", "evolution").eq("ativo", true).not("unidade", "is", null);
    if (error) throw error;
    const doCrm = new Set((contas ?? []).map((c) => c.instancia).filter(Boolean));

    if (req.method === "GET") return resposta({ instancias: [...doCrm].sort() });
    if (req.method !== "POST") return resposta({ error: "metodo" }, 405);

    const corpo = await req.json().catch(() => null);
    const lista = Array.isArray(corpo?.instancias) ? corpo.instancias : null;
    if (!lista) return resposta({ error: "retrato_invalido" }, 400);

    const resultado: Record<string, unknown> = {};
    for (const n of lista) {
      if (!doCrm.has(n?.instancia)) continue;
      const { data, error: e } = await crm.rpc("sincronizar_etiquetas_whatsapp", {
        _instancia: n.instancia,
        _etiquetas: n.etiquetas ?? [],
        _marcacoes: n.marcacoes ?? [],
      });
      if (e) {
        console.error("[wa-etiquetas]", n.instancia, e.message);
        resultado[n.instancia] = { error: e.message };
      } else {
        resultado[n.instancia] = data;
      }
    }
    return resposta(resultado);
  } catch (err) {
    console.error("[wa-etiquetas] erro", err);
    return resposta({ error: String(err) }, 500);
  }
});
