import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    queryFn: async () => {
      const { data } = await crm.from('tenant_modules').select('module_key, ativo, expira_em');
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

export function useConversas(ativo = true) {
  return useQuery({
    queryKey: ['conversas'],
    enabled: ativo,
    // Rede de segurança: se o tempo real cair, a lista ainda anda.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });
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
      .on('postgres_changes', { event: '*', schema: 'crm', table: 'conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['conversas'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [ativo, qc]);
}

export function useMensagens(conversa: Conversa | null) {
  return useQuery({
    // last_message_at na chave: mensagem nova na conversa aberta recarrega o histórico.
    queryKey: ['mensagens', conversa?.id, conversa?.last_message_at],
    enabled: !!conversa,
    placeholderData: (anterior, consulta) =>
      consulta?.queryKey[1] === conversa?.id ? anterior : undefined,
    queryFn: async () => {
      const { data, error } = await radar
        .from('messages')
        .select('id, created_at, body, message_type, is_from_me, timestamp_unix, sent_by, evolution_message_id')
        .eq('company_id', conversa!.radar_company_id)
        .eq('phone_number', conversa!.phone)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as Mensagem[]).sort((a, b) => momentoMensagem(a) - momentoMensagem(b));
    },
  });
}

export function useEnviarMensagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, texto }: { conversationId: string; texto: string }) => {
      const { data, error } = await supabase.functions.invoke('wa-enviar', {
        body: { conversation_id: conversationId, texto },
      });
      if (error || data?.error) throw new Error(await erroDaFuncao(error, data));
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['conversas'] });
      qc.invalidateQueries({ queryKey: ['mensagens'] });
    },
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
    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(['conversas'], ctx.anterior);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['conversas'] }),
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
