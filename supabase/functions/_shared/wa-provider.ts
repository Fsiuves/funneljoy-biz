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
  // A Evolution não respondeu no prazo: a mensagem pode sair quando a conexão
  // voltar (03/11, Lapa: saiu às 10:22 e só foi confirmada às 10:52).
  semResposta?: boolean
}

// Texto leva 1 a 3 s; foto, áudio e documento sobem o arquivo.
const PRAZO_TEXTO_MS = 25_000
const PRAZO_ANEXO_MS = 90_000

function falhaDeEnvio(e: unknown): SendResult {
  const nome = (e as Error)?.name
  if (nome === 'TimeoutError' || nome === 'AbortError') return { ok: false, semResposta: true, error: 'sem resposta da Evolution' }
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
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

// Mantém só dígitos. O telefone da conversa já vem completo, com o código do país:
// do próprio WhatsApp, ou da wa-iniciar, que pergunta o número real. Até 11/11/2026
// somava 55 a número de até 11 dígitos, e a resposta para número de fora com 11
// dígitos (+1 980..., +41 7..., +27 7...) ia para um número brasileiro que não existe.
export function normalizarTelefone(p: string): string {
  // Grupo vai com o id inteiro (120363...@g.us): só os dígitos virariam um telefone
  // que não existe (46-grupos-do-whatsapp.sql, 12/11/2026).
  if ((p || '').endsWith('@g.us')) return p
  return (p || '').replace(/\D/g, '')
}

// Nome do grupo (assunto). A mensagem do grupo não traz; a wa-grupo pede uma vez,
// quando a conversa nasce sem nome. GET {url}/group/findGroupInfos/{instance}?groupJid=
export async function nomeDoGrupo(cfg: WaConfig, grupo: string): Promise<string | null> {
  const base = evolutionBase(cfg)
  if (!base) return null
  try {
    const url = `${base}/group/findGroupInfos/${encodeURIComponent(cfg.evolution_instance!)}?groupJid=${encodeURIComponent(grupo)}`
    const res = await fetch(url, { headers: { apikey: cfg.evolution_apikey! }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const j = await res.json()
    const nome = String(j?.subject ?? '').trim()
    return nome || null
  } catch {
    return null
  }
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
    return falhaDeEnvio(e)
  }
}

export interface Anexo {
  tipo: 'image' | 'video' | 'audio' | 'document'
  base64: string
  mimetype: string
  nome?: string | null
  legenda?: string | null
}

// Tipo do WhatsApp pelo mimetype. Imagem e vídeo em formato que o WhatsApp não
// mostra na conversa vão como documento. Áudio sai como mensagem de voz.
export function tipoDoAnexo(mimetype: string): Anexo['tipo'] {
  if (/^image\/(jpeg|png|webp)$/.test(mimetype)) return 'image'
  if (/^video\/(mp4|3gpp)$/.test(mimetype)) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  return 'document'
}

// Foto, vídeo, áudio ou documento dentro da conversa. Mesma regra de janela do
// texto na Cloud API.
export async function enviarAnexo(cfg: WaConfig, telefone: string, anexo: Anexo): Promise<SendResult> {
  const phone = normalizarTelefone(telefone)
  try {
    if (cfg.provedor === 'cloud') return await enviarCloudAnexo(cfg, phone, anexo)
    return await enviarEvolutionAnexo(cfg, phone, anexo)
  } catch (e) {
    return falhaDeEnvio(e)
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
    signal: AbortSignal.timeout(PRAZO_TEXTO_MS),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${JSON.stringify(data)}` }
  return { ok: true, providerId: data?.key?.id ?? data?.id ?? undefined }
}

// Evolution v2. Áudio: POST {url}/message/sendWhatsAppAudio/{instance} body
// { number, audio } (a Evolution converte para mensagem de voz). O resto:
// POST {url}/message/sendMedia/{instance} body { number, mediatype, mimetype,
// caption, media, fileName }. Base64 puro, sem o prefixo "data:".
async function enviarEvolutionAnexo(cfg: WaConfig, phone: string, anexo: Anexo): Promise<SendResult> {
  const base = evolutionBase(cfg)
  if (!base) return { ok: false, error: 'Config Evolution incompleta (url/instance/apikey).' }

  const instancia = encodeURIComponent(cfg.evolution_instance!)
  const [url, body] = anexo.tipo === 'audio'
    ? [`${base}/message/sendWhatsAppAudio/${instancia}`, { number: phone, audio: anexo.base64 }]
    : [`${base}/message/sendMedia/${instancia}`, {
        number: phone,
        mediatype: anexo.tipo,
        mimetype: anexo.mimetype,
        caption: anexo.legenda ?? '',
        media: anexo.base64,
        fileName: anexo.nome ?? 'arquivo',
      }]
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.evolution_apikey! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PRAZO_ANEXO_MS),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${JSON.stringify(data).slice(0, 300)}` }
  return { ok: true, providerId: data?.key?.id ?? data?.id ?? undefined }
}

// POST {url}/chat/whatsappNumbers/{instance}  body { numbers: [...] }
// Diz se o número tem WhatsApp e qual é o número real (com ou sem o nono dígito).
export async function verificarNumero(
  cfg: WaConfig,
  numero: string,
): Promise<{ ok: boolean; numero?: string; semResposta?: boolean; error?: string }> {
  const base = evolutionBase(cfg)
  if (cfg.provedor !== 'evolution' || !base) return { ok: false, error: 'Config Evolution incompleta (url/instance/apikey).' }
  try {
    const res = await fetch(`${base}/chat/whatsappNumbers/${encodeURIComponent(cfg.evolution_instance!)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.evolution_apikey! },
      body: JSON.stringify({ numbers: [numero] }),
      signal: AbortSignal.timeout(PRAZO_TEXTO_MS),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: `Evolution ${res.status}: ${JSON.stringify(data).slice(0, 300)}` }
    const achado = Array.isArray(data) ? data[0] : null
    const real = String(achado?.jid ?? '').split('@')[0]
    return { ok: true, numero: achado?.exists && /^\d+$/.test(real) ? real : undefined }
  } catch (e) {
    const falha = falhaDeEnvio(e)
    return { ok: false, semResposta: falha.semResposta, error: falha.error }
  }
}

// Fecha a conexão do número e reconecta com a sessão guardada: não desconecta o
// WhatsApp nem pede QR code. É o que destrava o processamento das mensagens
// quando ele para (Lapa, 03/11). O código da Evolution 2.3.7 usa POST; a
// documentação da v2 diz PUT.
export async function reiniciarConexao(cfg: WaConfig): Promise<string> {
  const base = evolutionBase(cfg)
  if (cfg.provedor !== 'evolution' || !base) return 'sem Evolution configurada'
  for (const method of ['POST', 'PUT']) {
    try {
      const res = await fetch(`${base}/instance/restart/${encodeURIComponent(cfg.evolution_instance!)}`, {
        method,
        headers: { apikey: cfg.evolution_apikey! },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status !== 404 && res.status !== 405) return `${method} ${res.status} ${(await res.text()).slice(0, 120)}`
    } catch (e) {
      return `${method} ${e instanceof Error ? e.message : String(e)}`
    }
  }
  return 'rota de reinício não encontrada'
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

// 1) POST /{phone_number_id}/media sobe o arquivo e devolve o id  2) envia com
// esse id. Na Cloud API áudio só em aac, mp4, mpeg, amr ou ogg (opus); o webm
// gravado no Chrome volta com erro. O id gravado é o da mensagem, não o da
// mídia, então a mídia enviada não reabre pela tela.
async function enviarCloudAnexo(cfg: WaConfig, phone: string, anexo: Anexo): Promise<SendResult> {
  if (!cfg.cloud_phone_number_id || !cfg.cloud_token)
    return { ok: false, error: 'Config Cloud API incompleta (phone_number_id/token).' }

  const bytes = Uint8Array.from(atob(anexo.base64), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', anexo.mimetype)
  form.append('file', new Blob([bytes], { type: anexo.mimetype }), anexo.nome ?? 'arquivo')
  const up = await fetch(`https://graph.facebook.com/v21.0/${cfg.cloud_phone_number_id}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.cloud_token}` },
    body: form,
  })
  const subido = await up.json().catch(() => ({}))
  if (!up.ok || !subido?.id) return { ok: false, error: `Cloud (upload) ${up.status}: ${JSON.stringify(subido)}` }

  const midia: Record<string, string> = { id: subido.id }
  if (anexo.legenda && anexo.tipo !== 'audio') midia.caption = anexo.legenda
  if (anexo.tipo === 'document') midia.filename = anexo.nome ?? 'arquivo'
  const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.cloud_phone_number_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.cloud_token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: anexo.tipo, [anexo.tipo]: midia }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: `Cloud (${anexo.tipo}) ${res.status}: ${JSON.stringify(data)}` }
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
