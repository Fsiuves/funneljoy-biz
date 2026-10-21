import { useEffect, useRef } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// As tabelas do atendimento não estão nos tipos gerados do Lovable.
const crm = supabase as any;
const radar = (supabase as any).schema('public');

export interface Conversa {
  id: string;
  tenant_id: string;
  wa_account_id: string;
  unidade: string;
  radar_company_id: string;
  radar_lead_id: string | null;
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  assigned_to: string | null;
  status: 'aberta' | 'resolvida';
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from_me: boolean | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  created_at: string;
  updated_at: string;
  /** Telefone da equipe (sócios, recepção): aparece no atendimento, não é paciente. */
  interna?: boolean;
}

export interface Mensagem {
  id: string;
  created_at: string;
  body: string | null;
  message_type: string | null;
  is_from_me: boolean;
  timestamp_unix: number | null;
  sent_by: string | null;
  evolution_message_id: string | null;
  /** Enviada pelo painel e ainda sem resposta do WhatsApp: aparece na hora como "enviando". */
  pendente?: boolean;
}

export interface RespostaPronta {
  id: string;
  unidade: string | null;
  atalho: string;
  texto: string;
  created_by: string | null;
  updated_at: string;
}

export interface Pessoa {
  id: string;
  name: string | null;
  email: string;
  unidade: string | null;
  ativo?: boolean | null;
  role?: string | null;
}

export interface EmpresaAcessivel {
  tenant_id: string;
  name: string;
  role: string;
  atual: boolean;
}

/** Momento da mensagem no WhatsApp; cai no horário de gravação se não vier. */
export function momentoMensagem(m: Mensagem): number {
  return m.timestamp_unix ? m.timestamp_unix * 1000 : Date.parse(m.created_at);
}

const ERROS: Record<string, string> = {
  not_authenticated: 'Sua sessão expirou. Entre de novo.',
  sem_acesso: 'Você não tem acesso a esta conversa.',
  numero_inativo: 'O número desta unidade está desativado.',
  janela_fechada: 'Passaram 24h da última mensagem do paciente. Na conexão oficial, só modelo aprovado.',
  falha_envio: 'O WhatsApp recusou o envio. Confira se o número da unidade está conectado.',
  texto_longo: 'Mensagem longa demais.',
  dados_invalidos: 'Mensagem vazia.',
  midia_indisponivel: 'Não foi possível abrir esta mídia.',
  arquivo_grande: 'Arquivo grande demais: até 10 MB.',
};

async function erroDaFuncao(error: any, data: any): Promise<string> {
  let codigo = data?.error;
  if (!codigo && error?.context?.json) {
    const corpo = await error.context.json().catch(() => null);
    codigo = corpo?.error;
  }
  return ERROS[codigo] ?? codigo ?? error?.message ?? 'Erro inesperado';
}

// ---------------------------------------------------------------- módulos

export function useModulosAtivos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['modulos', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    // Até responder: falha não pode deixar a tela com o padrão da Dom.
    retry: true,
    retryDelay: (tentativa: number) => Math.min(1000 * 2 ** tentativa, 10_000),
    queryFn: async () => {
      const { data, error } = await crm.from('tenant_modules').select('module_key, ativo, expira_em');
      // Falha não é "sem módulos": viraria "Atendimento não contratado" e menu sem itens.
      if (error) throw error;
      const agora = Date.now();
      return new Set<string>(
        (data ?? [])
          .filter((m: any) => m.ativo && (!m.expira_em || Date.parse(m.expira_em) > agora))
          .map((m: any) => m.module_key),
      );
    },
  });
}

// ---------------------------------------------------------------- empresas

export function useMinhasEmpresas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['minhas-empresas', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await crm.rpc('my_tenants');
      if (error) throw error;
      return (data ?? []) as EmpresaAcessivel[];
    },
  });
}

export async function trocarEmpresa(tenantId: string): Promise<string | null> {
  const { data, error } = await crm.rpc('switch_tenant', { _tenant_id: tenantId });
  if (error) return error.message;
  if (!data?.success) {
    return data?.error === 'troca_nao_permitida'
      ? 'Troca de empresa é só para quem enxerga todas as unidades.'
      : 'Sem acesso a essa empresa.';
  }
  return null;
}

// ---------------------------------------------------------------- equipe e eu

export function useEquipe() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['equipe', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      // A função vem de user_roles; o RLS devolve só as da empresa atual.
      const [{ data: pessoas }, { data: papeis }] = await Promise.all([
        crm.from('profiles').select('id, name, email, unidade, ativo').order('name'),
        crm.from('user_roles').select('user_id, role'),
      ]);
      const papel = new Map((papeis ?? []).map((r: any) => [r.user_id, r.role]));
      return (pessoas ?? []).map((p: any) => ({ ...p, role: papel.get(p.id) ?? null })) as Pessoa[];
    },
  });
}

// ---------------------------------------------------------------- conversas

// A lista tem 500 conversas (uns 400 KB). Antes ela vinha inteira a cada
// mensagem que entrava ou saía, em cada CRM aberto, e a mensagem nova só
// aparecia depois desse download e de outro com as 300 da conversa. Agora o
// tempo real troca só a conversa que mudou; a lista inteira vem ao abrir, a
// cada 2 minutos (rede de segurança) e ao voltar para a aba depois de 1 minuto.

const recente = (c: Conversa) => (c.last_message_at ? Date.parse(c.last_message_at) : 0);
const maisRecentePrimeiro = (a: Conversa, b: Conversa) => recente(b) - recente(a);

// Mudanças do tempo real dos últimos 30 s: uma busca da lista que saiu antes
// delas não pode desfazê-las.
const mudancasRecentes = new Map<string, { conversa: Conversa; em: number }>();
const maisNova = (a: Conversa, b: Conversa) => (Date.parse(b.updated_at ?? '') > Date.parse(a.updated_at ?? '') ? b : a);

function comMudancasRecentes(lista: Conversa[]): Conversa[] {
  const agora = Date.now();
  let mudou = false;
  const porId = new Map(lista.map((c) => [c.id, c]));
  for (const [id, { conversa, em }] of mudancasRecentes) {
    if (agora - em > 30_000) {
      mudancasRecentes.delete(id);
      continue;
    }
    const atual = porId.get(id);
    const vale = atual ? maisNova(atual, { ...atual, ...conversa }) : conversa;
    if (vale !== atual) {
      porId.set(id, vale);
      mudou = true;
    }
  }
  return mudou ? [...porId.values()].sort(maisRecentePrimeiro) : lista;
}

export function useConversas(ativo = true) {
  return useQuery({
    queryKey: ['conversas'],
    enabled: ativo,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return comMudancasRecentes((data ?? []) as Conversa[]);
    },
  });
}

/** Aplica um evento do tempo real na lista: só a conversa que mudou é trocada. */
export function aplicarMudancaConversa(
  lista: Conversa[] | undefined,
  evento: { eventType: string; new: Partial<Conversa>; old: Partial<Conversa> },
): Conversa[] | undefined {
  if (!lista) return lista;
  if (evento.eventType === 'DELETE') {
    const id = evento.old?.id;
    return id ? lista.filter((c) => c.id !== id) : lista;
  }
  const nova = evento.new;
  if (!nova?.id) return lista;
  const atual = lista.find((c) => c.id === nova.id);
  const juntada = { ...atual, ...nova } as Conversa;
  mudancasRecentes.set(juntada.id, { conversa: juntada, em: Date.now() });
  return [juntada, ...lista.filter((c) => c.id !== nova.id)].sort(maisRecentePrimeiro);
}

/**
 * Escuta mudanças em crm.conversations. O RLS vale no tempo real também: cada
 * pessoa só recebe o evento das conversas que enxerga. Fica no menu lateral,
 * que está montado em toda página.
 */
export function useConversasTempoReal(ativo: boolean) {
  const qc = useQueryClient();
  const nome = useRef(`crm-conversas-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!ativo) return;
    const canal = supabase
      .channel(nome.current)
      .on('postgres_changes', { event: '*', schema: 'crm', table: 'conversations' }, (evento: any) => {
        qc.setQueryData<Conversa[]>(['conversas'], (lista) => aplicarMudancaConversa(lista, evento));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [ativo, qc]);
}

const CAMPOS_MENSAGEM = 'id, created_at, body, message_type, is_from_me, timestamp_unix, sent_by, evolution_message_id';
const emOrdem = (lista: Mensagem[]) => [...lista].sort((a, b) => momentoMensagem(a) - momentoMensagem(b));

/** Junta mensagens do banco às da tela; a "enviando" some quando a dela chega. */
function juntarMensagens(lista: Mensagem[], novas: Mensagem[]): Mensagem[] {
  const porId = new Map(lista.map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  const reais = novas.filter((m) => m.is_from_me);
  for (const [id, m] of porId) {
    if (m.pendente && reais.some((r) => r.body === m.body && r.message_type === m.message_type
      && Math.abs(Date.parse(r.created_at) - Date.parse(m.created_at)) < 120_000)) porId.delete(id);
  }
  return emOrdem([...porId.values()]);
}

/**
 * Busca só as mensagens recentes da conversa e junta às que já estão na tela.
 * Volta 2 minutos para não perder mensagem gravada fora de ordem.
 */
export async function buscarNovasMensagens(qc: QueryClient, conversa: Conversa) {
  const chave = ['mensagens', conversa.id];
  const atuais = qc.getQueryData<Mensagem[]>(chave);
  if (!atuais) return;
  const reais = atuais.filter((m) => !m.pendente);
  let consulta = radar
    .from('messages')
    .select(CAMPOS_MENSAGEM)
    .eq('company_id', conversa.radar_company_id)
    .eq('phone_number', conversa.phone)
    .order('created_at', { ascending: false })
    .limit(100);
  if (reais.length) {
    const ultima = Math.max(...reais.map((m) => Date.parse(m.created_at)));
    consulta = consulta.gte('created_at', new Date(ultima - 120_000).toISOString());
  }
  const { data, error } = await consulta;
  if (error || !data) return;
  qc.setQueryData<Mensagem[]>(chave, (lista = []) => juntarMensagens(lista, data as Mensagem[]));
}

export function useMensagens(conversa: Conversa | null) {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: ['mensagens', conversa?.id],
    enabled: !!conversa,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await radar
        .from('messages')
        .select(CAMPOS_MENSAGEM)
        .eq('company_id', conversa!.radar_company_id)
        .eq('phone_number', conversa!.phone)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return emOrdem((data ?? []) as Mensagem[]);
    },
  });

  // Mensagem nova na conversa aberta (o tempo real muda o last_message_at):
  // vêm só as recentes, em vez das 300 de novo.
  const ultima = conversa?.last_message_at;
  useEffect(() => {
    if (conversa) void buscarNovasMensagens(qc, conversa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa?.id, ultima]);

  return consulta;
}

// ---------------------------------------------------------------- anúncio de origem

export interface OrigemAnuncio {
  telefone: string;
  chave_telefone: string | null;
  unidade: string | null;
  plataforma: 'meta' | 'google' | string;
  campanha: string | null;
  conjunto: string | null;
  anuncio: string | null;
  chegou_em: string;
}

/** Mesma chave do banco (crm.phone_key): 55 + DDD + 8 últimos dígitos. */
export function chaveTelefone(telefone: string): string {
  let d = (telefone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.startsWith('55') ? '55' + d.slice(2, 4) + d.slice(-8) : d;
}

/** "[CA] [LAPA] [Q] - Lapa Agosto/26" vira "Lapa Agosto/26", como na tela de resultados. */
export const nomeCurtoCampanha = (nome: string) => {
  const i = nome.indexOf(' - ');
  return i > 0 && i < nome.length - 3 ? nome.slice(i + 3) : nome;
};

/**
 * De qual anúncio veio cada contato (crm.anuncio_origem, copiado do Vigia de 2
 * em 2 minutos). Fica o mais recente por unidade e telefone.
 */
export function useAnunciosDeOrigem(ativo = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['anuncio-origem', user?.id],
    enabled: ativo && !!user,
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('anuncio_origem')
        .select('telefone, chave_telefone, unidade, plataforma, campanha, conjunto, anuncio, chegou_em')
        .order('chegou_em', { ascending: false })
        .limit(5000);
      if (error) throw error;
      const mapa = new Map<string, OrigemAnuncio>();
      for (const o of (data ?? []) as OrigemAnuncio[]) {
        const chave = `${o.unidade ?? ''}|${o.chave_telefone ?? chaveTelefone(o.telefone)}`;
        if (!mapa.has(chave)) mapa.set(chave, o);
      }
      return mapa;
    },
  });
}

export function origemDaConversa(mapa: Map<string, OrigemAnuncio> | undefined, c: Pick<Conversa, 'unidade' | 'phone'>) {
  if (!mapa) return undefined;
  const chave = chaveTelefone(c.phone);
  return mapa.get(`${c.unidade}|${chave}`) ?? mapa.get(`|${chave}`);
}

/** "Meta · Avaliação R$159 · Vídeo dor lombar" */
export function descreverOrigem(o: OrigemAnuncio): string {
  const plataforma = o.plataforma === 'google' ? 'Google' : o.plataforma === 'meta' ? 'Meta' : o.plataforma;
  return [plataforma, o.campanha ? nomeCurtoCampanha(o.campanha) : null, o.anuncio].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- envio na hora

let contadorPendente = 0;

/** Põe a mensagem na conversa na hora, como "enviando", antes da resposta do WhatsApp. */
export function adicionarPendente(
  qc: QueryClient,
  conversaId: string,
  m: { body: string | null; message_type: string; sent_by: string | null },
): string {
  const id = `pendente-${Date.now()}-${++contadorPendente}`;
  const agora = new Date();
  qc.setQueryData<Mensagem[]>(['mensagens', conversaId], (lista = []) => [...lista, {
    id, created_at: agora.toISOString(), body: m.body, message_type: m.message_type, is_from_me: true,
    timestamp_unix: Math.floor(agora.getTime() / 1000), sent_by: m.sent_by, evolution_message_id: null, pendente: true,
  }]);
  return id;
}

/** Enviada: a "enviando" vira a mensagem gravada (ou sai, se a gravada já chegou). */
export function confirmarPendente(qc: QueryClient, conversaId: string, idPendente: string, idReal: string | null) {
  qc.setQueryData<Mensagem[]>(['mensagens', conversaId], (lista) => {
    if (!lista) return lista;
    if (idReal && lista.some((m) => m.id === idReal)) return lista.filter((m) => m.id !== idPendente);
    return lista.map((m) => (m.id === idPendente ? { ...m, id: idReal ?? m.id, pendente: false } : m));
  });
}

export function removerPendente(qc: QueryClient, conversaId: string, idPendente: string) {
  qc.setQueryData<Mensagem[]>(['mensagens', conversaId], (lista) => lista?.filter((m) => m.id !== idPendente));
}

/** Arquivo pronto para a wa-enviar: base64 sem o prefixo "data:". */
export interface AnexoEnvio {
  base64: string;
  mimetype: string;
  nome: string;
}

export const LIMITE_ANEXO = 10 * 1024 * 1024;

export function lerAnexo(arquivo: Blob, mimetype: string, nome: string): Promise<AnexoEnvio> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok({ base64: String(leitor.result).split(',')[1] ?? '', mimetype, nome });
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo'));
    leitor.readAsDataURL(arquivo);
  });
}

export function useEnviarMensagem() {
  return useMutation({
    mutationFn: async ({ conversationId, texto, anexo }: { conversationId: string; texto: string; anexo?: AnexoEnvio }) => {
      const { data, error } = await supabase.functions.invoke('wa-enviar', {
        body: { conversation_id: conversationId, texto, anexo },
      });
      if (error || data?.error) throw new Error(await erroDaFuncao(error, data));
      return data as { ok: boolean; registrada: boolean; message_id: string | null };
    },
    // A conversa muda pelo tempo real e as mensagens chegam por buscarNovasMensagens:
    // nada de baixar a lista inteira a cada envio.
  });
}

type CamposConversa = Partial<Pick<Conversa, 'assigned_to' | 'status' | 'unread_count'>>;

export function useAtualizarConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string } & CamposConversa) => {
      const { error } = await crm.from('conversations').update(campos).eq('id', id);
      if (error) throw error;
    },
    // Otimista: marcar como lida ou assumir não pode esperar a volta do banco.
    onMutate: async ({ id, ...campos }) => {
      await qc.cancelQueries({ queryKey: ['conversas'] });
      const anterior = qc.getQueryData<Conversa[]>(['conversas']);
      qc.setQueryData<Conversa[]>(['conversas'], (lista) =>
        lista?.map((c) => (c.id === id ? { ...c, ...campos } : c)),
      );
      return { anterior };
    },
    // Deu certo: o tempo real confirma. Só a falha desfaz e busca a lista de novo.
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(['conversas'], ctx.anterior);
      qc.invalidateQueries({ queryKey: ['conversas'] });
    },
  });
}

export async function abrirMidia(messageId: string): Promise<{ url?: string; mimetype?: string; erro?: string }> {
  const { data, error } = await supabase.functions.invoke('wa-midia', { body: { message_id: messageId } });
  if (error || data?.error) return { erro: await erroDaFuncao(error, data) };
  return { url: `data:${data.mimetype};base64,${data.base64}`, mimetype: data.mimetype };
}

// ---------------------------------------------------------------- telefones da equipe

export interface TelefoneEquipe {
  id: string;
  telefone: string;
  chave: string;
  nome: string | null;
  created_at: string;
}

export function useTelefonesEquipe(ativo = true) {
  return useQuery({
    queryKey: ['telefones-equipe'],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await crm.from('telefones_equipe').select('id, telefone, chave, nome, created_at').order('created_at');
      if (error) throw error;
      return (data ?? []) as TelefoneEquipe[];
    },
  });
}

const ERROS_TELEFONE: Record<string, string> = {
  telefone_invalido: 'Telefone inválido: use DDD e número',
  not_authorized: 'Só a direção e a gerente mexem nos telefones da equipe',
  nao_encontrado: 'Esse telefone já não está na lista',
};

export function useMarcarTelefoneEquipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ telefone, nome }: { telefone: string; nome?: string | null }) => {
      const { data, error } = await crm.rpc('marcar_telefone_equipe', { _telefone: telefone, _nome: nome ?? null });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(ERROS_TELEFONE[data?.error] ?? data?.error ?? 'Não foi possível marcar');
      return data as { conversas: number; pacientes_removidos: number; pacientes_mantidos: number };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['telefones-equipe'] });
      qc.invalidateQueries({ queryKey: ['conversas'] });
    },
  });
}

export function useDesmarcarTelefoneEquipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await crm.rpc('desmarcar_telefone_equipe', { _id: id });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(ERROS_TELEFONE[data?.error] ?? data?.error ?? 'Não foi possível desmarcar');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['telefones-equipe'] });
      qc.invalidateQueries({ queryKey: ['conversas'] });
    },
  });
}

/** Resumo do que mudou ao marcar, para o aviso na tela. */
export function avisoTelefoneMarcado(r: { pacientes_removidos: number; pacientes_mantidos: number }): string {
  const partes = ['Telefone marcado como da equipe'];
  if (r.pacientes_removidos) partes.push(r.pacientes_removidos > 1 ? `${r.pacientes_removidos} pacientes criados por engano saíram do funil` : '1 paciente criado por engano saiu do funil');
  if (r.pacientes_mantidos) partes.push(`${r.pacientes_mantidos} paciente${r.pacientes_mantidos > 1 ? 's' : ''} já trabalhado${r.pacientes_mantidos > 1 ? 's ficaram' : ' ficou'} no funil: apague à mão se não for paciente`);
  return partes.join('. ');
}

// ---------------------------------------------------------------- respostas prontas

export function useRespostasProntas(ativo = true) {
  return useQuery({
    queryKey: ['respostas-prontas'],
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('quick_replies')
        .select('id, unidade, atalho, texto, created_by, updated_at')
        .order('atalho');
      if (error) throw error;
      return (data ?? []) as RespostaPronta[];
    },
  });
}

export function useSalvarRespostaPronta() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: { id?: string; unidade: string | null; atalho: string; texto: string; tenantId: string }) => {
      const linha = { unidade: r.unidade, atalho: r.atalho, texto: r.texto };
      const { error } = r.id
        ? await crm.from('quick_replies').update(linha).eq('id', r.id)
        : await crm.from('quick_replies').insert({ ...linha, tenant_id: r.tenantId, created_by: user?.id });
      if (error) {
        if (error.code === '23505') throw new Error('Já existe uma resposta com esse atalho nessa unidade.');
        if (error.code === '42501') throw new Error('Você não pode mexer nas respostas dessa unidade.');
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['respostas-prontas'] }),
  });
}

export function useApagarRespostaPronta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await crm.from('quick_replies').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['respostas-prontas'] }),
  });
}

/** Troca {nome}, {unidade} e {atendente} pelo valor da conversa aberta. */
export function preencherResposta(
  texto: string,
  vars: { nome?: string | null; unidade?: string | null; atendente?: string | null },
): string {
  const primeiro = (s?: string | null) => (s ?? '').trim().split(/\s+/)[0] ?? '';
  return texto
    .replace(/\{nome\}/gi, primeiro(vars.nome))
    .replace(/\{unidade\}/gi, vars.unidade ?? '')
    .replace(/\{atendente\}/gi, primeiro(vars.atendente));
}

/**
 * Regras do atendimento da empresa (crm.regras_atendimento, 23-ajustes-reuniao.sql):
 * quem fica com a conversa quando outra atendente responde e se a mensagem do
 * painel sai assinada com o nome de quem atende.
 */
export type TrocaDeTurno = 'primeiro' | 'ausente' | 'ultimo';
export interface RegrasAtendimento {
  troca_turno: TrocaDeTurno;
  assinar: boolean;
}

export function useRegrasAtendimento() {
  return useQuery({
    queryKey: ['regras-atendimento'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await crm.rpc('regras_atendimento');
      if (error) throw error;
      return (data ?? { troca_turno: 'primeiro', assinar: false }) as RegrasAtendimento;
    },
  });
}

export function useSalvarRegrasAtendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: RegrasAtendimento) => {
      const { data, error } = await crm.rpc('salvar_regras_atendimento', { _troca_turno: r.troca_turno, _assinar: r.assinar });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error === 'not_authorized' ? 'Só a direção e a gerente mudam as regras' : 'Não foi possível salvar');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regras-atendimento'] }),
  });
}

/** A assinatura que vai na primeira linha, em negrito: "*Mariana:*". */
export function assinarMensagem(texto: string, nome: string | null | undefined) {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  return primeiro ? `*${primeiro}:*\n${texto}` : texto;
}
