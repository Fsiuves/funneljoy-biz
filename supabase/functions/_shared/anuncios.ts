// O núcleo da sincronização de anúncios, usado pela função anuncios-sincronizar
// (que confere quem pede) e por uma carga manual com a service role.
// Ver o comentário em anuncios-sincronizar/index.ts.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const VIGIA_URL = "https://jhucmbxuyflurzbubegw.supabase.co/rest/v1";
const META_API = "https://graph.facebook.com/v21.0";
const GOOGLE_API = "https://googleads.googleapis.com/v22";
const CONVERSA_META = "onsite_conversion.messaging_conversation_started_7d";

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A unidade cujo nome aparece no nome da campanha; nenhuma ou duas, null. */
function unidadePeloNome(nome: string | null | undefined, unidades: string[]) {
  const n = semAcento(nome ?? "");
  const achadas = unidades.filter((u) => n.includes(semAcento(u)));
  return achadas.length === 1 ? achadas[0] : null;
}

const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

async function vigia(caminho: string) {
  const chave = Deno.env.get("VIGIA_SERVICE_KEY")!;
  const r = await fetch(`${VIGIA_URL}/${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Accept-Profile": "public" },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`vigia ${caminho.split("?")[0]}: ${j?.message ?? r.status}`);
  return j as any[];
}

async function gastoMeta(conta: string, token: string, de: string, ate: string) {
  let url: string | null = `${META_API}/${conta}/insights?` + new URLSearchParams({
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since: de, until: ate }),
    fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions",
    limit: "500",
    access_token: token,
  });
  const linhas: any[] = [];
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(`meta: ${j.error.message}`);
    linhas.push(...(j.data ?? []));
    url = j.paging?.next ?? null;
  }
  return linhas;
}

async function gastoGoogle(conta: string, token: string, de: string, ate: string) {
  const cliente = conta.replace(/\D/g, "");
  const query = "SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, " +
    `metrics.clicks FROM campaign WHERE segments.date BETWEEN '${de}' AND '${ate}' AND metrics.impressions > 0`;
  const linhas: any[] = [];
  let pageToken: string | undefined;
  do {
    const r = await fetch(`${GOOGLE_API}/customers/${cliente}/googleAds:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!,
        "login-customer-id": Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, pageToken }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`google: ${j.error.message}`);
    linhas.push(...(j.results ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return linhas;
}

/** Lê o Vigia, a Meta e o Google e grava em crm.anuncio_gasto e crm.anuncio_origem. */
/**
 * soOrigens: só de qual anúncio veio cada contato, dos últimos 2 dias (o relógio
 * de 2 em 2 minutos). Sem ele, também o gasto, e a data da última sincronização
 * que a tela de resultados mostra.
 */
export async function sincronizarAnuncios(
  crm: SupabaseClient<any, any, any>, tenant: string, workspaces: string[], opcoes: { soOrigens?: boolean } = {},
) {
  const agora = Date.now();
  const { data: numeros } = await crm.from("wa_accounts").select("instancia, unidade").eq("tenant_id", tenant);
  const unidades = [...new Set((numeros ?? []).map((n) => n.unidade).filter(Boolean))] as string[];
  const unidadeDaInstancia = new Map((numeros ?? []).map((n) => [n.instancia, n.unidade]));

  const { count: jaTem } = await crm.from("anuncio_gasto").select("*", { count: "exact", head: true }).eq("tenant_id", tenant);
  const ate = diaSP(new Date());
  const de = diaSP(new Date(agora - (opcoes.soOrigens ? 2 : jaTem ? 40 : 120) * 86_400_000));

  const lista = `in.(${workspaces.join(",")})`;
  const conexoes = opcoes.soOrigens ? [] : await vigia(`ad_connections?workspace_id=${lista}&status=eq.active&select=provider,account_id,access_token,token_expires_at,updated_at&order=updated_at.desc`);
  const avisos: string[] = [];
  const detalhe: Record<string, unknown> = { de, ate };

  // Uma conta pode estar em mais de um cadastro do Vigia: lê uma vez só.
  const contas = new Map<string, any>();
  for (const c of conexoes) {
    const k = `${c.provider}:${c.account_id}`;
    if (!contas.has(k) && c.access_token) contas.set(k, c);
  }

  for (const c of contas.values()) {
    const plataforma = c.provider === "meta_ads" ? "meta" : c.provider === "google_ads" ? "google" : null;
    if (!plataforma) continue;
    try {
      let linhas: Record<string, unknown>[] = [];
      if (plataforma === "meta") {
        linhas = (await gastoMeta(c.account_id, c.access_token.trim(), de, ate)).map((r) => ({
          tenant_id: tenant, plataforma, conta: c.account_id, chave: r.ad_id, dia: r.date_start,
          unidade: unidadePeloNome(r.campaign_name, unidades),
          campanha_id: r.campaign_id, campanha: r.campaign_name, conjunto_id: r.adset_id, conjunto: r.adset_name,
          anuncio_id: r.ad_id, anuncio: r.ad_name,
          gasto: Number(r.spend ?? 0), impressoes: Number(r.impressions ?? 0), cliques: Number(r.clicks ?? 0),
          conversas_plataforma: Number((r.actions ?? []).find((a: any) => a.action_type === CONVERSA_META)?.value ?? 0),
          atualizado_em: new Date().toISOString(),
        }));
      } else {
        if (c.token_expires_at && new Date(c.token_expires_at).getTime() < agora + 60_000) {
          avisos.push("google: acesso vencido no Vigia, que renova a cada hora; fica para a próxima");
          continue;
        }
        linhas = (await gastoGoogle(c.account_id, c.access_token.trim(), de, ate)).map((r) => ({
          tenant_id: tenant, plataforma, conta: c.account_id, chave: String(r.campaign.id), dia: r.segments.date,
          unidade: unidadePeloNome(r.campaign.name, unidades),
          campanha_id: String(r.campaign.id), campanha: r.campaign.name,
          gasto: Number(r.metrics.costMicros ?? 0) / 1_000_000,
          impressoes: Number(r.metrics.impressions ?? 0), cliques: Number(r.metrics.clicks ?? 0),
          atualizado_em: new Date().toISOString(),
        }));
      }
      // A plataforma ainda corrige dias passados: o período lido é trocado inteiro.
      const { error: erroApagar } = await crm.from("anuncio_gasto").delete()
        .eq("tenant_id", tenant).eq("plataforma", plataforma).eq("conta", c.account_id).gte("dia", de).lte("dia", ate);
      if (erroApagar) throw new Error(erroApagar.message);
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await crm.from("anuncio_gasto").insert(linhas.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      detalhe[`${plataforma}:${c.account_id}`] = {
        linhas: linhas.length,
        gasto: Math.round(linhas.reduce((s, l) => s + Number(l.gasto), 0) * 100) / 100,
      };
    } catch (e) {
      avisos.push(String(e instanceof Error ? e.message : e));
    }
  }

  // De qual anúncio veio cada contato.
  try {
    const ws = await vigia(`workspaces?id=${lista}&select=id,whatsapp_instance_name`);
    const unidadeDoWs = new Map(ws.map((w) => [w.id, unidadeDaInstancia.get(w.whatsapp_instance_name) ?? null]));
    const leads = await vigia(`ad_leads?workspace_id=${lista}&created_at=gte.${de}&phone=not.is.null&select=id,workspace_id,provider,phone,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,created_at&order=created_at&limit=20000`);
    const origens = leads.map((l) => ({
      tenant_id: tenant, vigia_id: l.id,
      unidade: unidadeDoWs.get(l.workspace_id) ?? unidadePeloNome(l.campaign_name, unidades),
      telefone: String(l.phone), plataforma: l.provider === "google" ? "google" : "meta",
      campanha_id: l.campaign_id, campanha: l.campaign_name, conjunto_id: l.adset_id, conjunto: l.adset_name,
      anuncio_id: l.ad_id, anuncio: l.ad_name, chegou_em: l.created_at, atualizado_em: new Date().toISOString(),
    }));
    for (let i = 0; i < origens.length; i += 500) {
      const { error } = await crm.from("anuncio_origem").upsert(origens.slice(i, i + 500), { onConflict: "vigia_id" });
      if (error) throw new Error(error.message);
    }
    detalhe.origens = origens.length;
  } catch (e) {
    avisos.push(String(e instanceof Error ? e.message : e));
  }

  detalhe.avisos = avisos;
  const ok = !avisos.some((a) => !a.startsWith("google: acesso vencido"));
  if (opcoes.soOrigens) return { ok, detalhe };
  await crm.from("anuncio_sync").upsert({
    tenant_id: tenant, concluido_em: new Date().toISOString(), ok, detalhe,
  });
  return { ok, detalhe };
}
