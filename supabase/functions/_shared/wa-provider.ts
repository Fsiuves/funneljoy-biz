// Camada de provedor de WhatsApp do CRM.
//
// Veio do wa-provider.ts do ColenSystem (enviarResposta e parseWebhook para
// Evolution e Cloud API). O que mudou aqui:
//   • o nome da instância vai codificado na URL, porque as da clínica têm espaço
//     ("Coluna Ajustada Lapa");
//   • entrou baixarMidia(), para a tela abrir foto, áudio e documento sob demanda;
//   • saiu o que era do ColenSystem (alertas por template, ata em PDF).
//
// Trocar Evolution por Cloud API é trocar wa_accounts.provedor. Nada fora deste
// arquivo precisa mudar.

export interface WaConfig {
  provedor: 'evolution' | 'cloud'
  // Evolution
  evolution_url?: string | null
  evolution_instance?: string | null
  evolution_apikey?: string | null
  // Meta Cloud API
  cloud_phone_number_id?: string | null
  cloud_token?: string | null
}

export interface SendResult {
  ok: boolean
  providerId?: string
  error?: string
}

export interface Midia {
  ok: boolean
  base64?: string
  mimetype?: string
  error?: string
}

// Monta a config a partir da linha de crm.wa_accounts. Credencial não mora no
// banco, porque wa_accounts é legível pelo tenant: vem dos secrets da função.
export function configDaConta(conta: {
  provedor: string
  instancia?: string | null
  phone_number_id?: string | null
}): WaConfig {
  if (conta.provedor === 'cloud')
    return {
      provedor: 'cloud',
      cloud_phone_number_id: conta.phone_number_id ?? null,
      cloud_token: Deno.env.get('WA_CLOUD_TOKEN') ?? null,
    }
  return {
    provedor: 'evolution',
    evolution_url: Deno.env.get('EVOLUTION_URL') ?? null,
    evolution_instance: conta.instancia ?? null,
    evolution_apikey: Deno.env.get('EVOLUTION_APIKEY') ?? null,
  }
}

// Mantém só dígitos; adiciona DDI 55 (BR) quando necessário.
export function normalizarTelefone(p: string): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.length <= 11) d = '55' + d
  return d
}

// Resposta dentro da conversa. Na Cloud API só vale com a janela de 24h aberta;
// quem chama confere a janela antes.
export async function enviarResposta(
  cfg: WaConfig,
  telefone: string,
  mensagem: string,
): Promise<SendResult> {
  const phone = normalizarTelefone(telefone)
  try {
    if (cfg.provedor === 'cloud') return await enviarCloudTexto(cfg, phone, mensagem)
    return await enviarEvolutionTexto(cfg, phone, mensagem)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function baixarMidia(cfg: WaConfig, providerMessageId: string): Promise<Midia> {
  try {
    if (cfg.provedor === 'cloud') return await baixarCloudMidia(cfg, providerMessageId)
    return await baixarEvolutionMidia(cfg, providerMessageId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─── Evolution API ───────────────────────────────────────────────────────────
function evolutionBase(cfg: WaConfig): string | null {
  if (!cfg.evolution_url || !cfg.evolution_instance || !cfg.evolution_apikey) return null
  return cfg.evolution_url.replace(/\/$/, '')
}

// POST {url}/message/sendText/{instance}  header apikey  body { number, text }
async function enviarEvolutionTexto(cfg: WaConfig, phone: string, texto: string): Promise<SendResult> {
  const base = evolutionBase(cfg)
  if (!base) return { ok: false, error: 'Config Evolution incompleta (url/instance/apikey).' }

  const url = `${base}/message/sendText/${encodeURIComponent(cfg.evolution_instance!)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.evolution_apikey! },
    body: JSON.stringify({ number: phone, text: texto }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${JSON.stringify(data)}` }
  return { ok: true, providerId: data?.key?.id ?? data?.id ?? undefined }
}

// POST {url}/chat/getBase64FromMediaMessage/{instance}  body { message: { key: { id } } }
// É a mesma chamada que o classifier usa para transcrever áudio.
async function baixarEvolutionMidia(cfg: WaConfig, id: string): Promise<Midia> {
  const base = evolutionBase(cfg)
  if (!base) return { ok: false, error: 'Config Evolution incompleta (url/instance/apikey).' }

  const url = `${base}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.evolution_instance!)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.evolution_apikey! },
    body: JSON.stringify({ message: { key: { id } }, convertToMp4: false }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.base64) return { ok: false, error: `Evolution ${res.status}: ${JSON.stringify(data).slice(0, 300)}` }
  return { ok: true, base64: data.base64, mimetype: data.mimetype ?? 'application/octet-stream' }
}

// ─── Meta Cloud API ──────────────────────────────────────────────────────────
async function enviarCloudTexto(cfg: WaConfig, phone: string, mensagem: string): Promise<SendResult> {
  if (!cfg.cloud_phone_number_id || !cfg.cloud_token)
    return { ok: false, error: 'Config Cloud API incompleta (phone_number_id/token).' }

  const url = `https://graph.facebook.com/v21.0/${cfg.cloud_phone_number_id}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.cloud_token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: mensagem },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Cloud (texto) ${res.status}: ${JSON.stringify(data)}` }
  return { ok: true, providerId: data?.messages?.[0]?.id ?? undefined }
}

// Na Cloud API o id da mídia vem no webhook; aqui recebe esse id.
// 1) GET /{media_id} devolve a URL temporária  2) GET na URL com o token.
async function baixarCloudMidia(cfg: WaConfig, mediaId: string): Promise<Midia> {
  if (!cfg.cloud_token) return { ok: false, error: 'Config Cloud API incompleta (token).' }
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.cloud_token}` },
  })
  const info = await meta.json().catch(() => ({}))
  if (!meta.ok || !info?.url) return { ok: false, error: `Cloud (mídia) ${meta.status}` }
  const arq = await fetch(info.url, { headers: { Authorization: `Bearer ${cfg.cloud_token}` } })
  if (!arq.ok) return { ok: false, error: `Cloud (download) ${arq.status}` }
  const bytes = new Uint8Array(await arq.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return { ok: true, base64: btoa(bin), mimetype: info.mime_type ?? 'application/octet-stream' }
}

// ─── Parse de webhook de entrada ────────────────────────────────────────────
// Hoje a entrada passa pelo classifier do Radar no n8n. Fica aqui para o dia
// em que a Cloud API mandar webhook direto para o CRM.
export function parseWebhook(
  provedor: 'evolution' | 'cloud',
  body: any,
): { telefone: string; texto: string } | null {
  try {
    if (provedor === 'cloud') {
      const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
      if (!msg) return null
      return { telefone: msg.from, texto: msg.text?.body ?? '' }
    }
    const d = body?.data ?? body
    const jid: string = d?.key?.remoteJid ?? d?.remoteJid ?? ''
    const telefone = jid.split('@')[0]
    const texto =
      d?.message?.conversation ??
      d?.message?.extendedTextMessage?.text ??
      d?.text ??
      ''
    if (!telefone) return null
    return { telefone, texto }
  } catch {
    return null
  }
}
