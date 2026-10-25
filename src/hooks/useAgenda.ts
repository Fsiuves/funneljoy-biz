import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// A tabela de avaliações não está nos tipos gerados do Lovable.
const crm = supabase as any;

export type StatusAvaliacao = 'agendada' | 'compareceu' | 'faltou' | 'cancelada';

export interface Avaliacao {
  id: string;
  lead_id: string;
  unidade: string | null;
  marcada_para: string;
  status: StatusAvaliacao;
  fechou_plano: boolean | null;
  valor_plano: number | null;
  agendada_em: string;
  leads?: { name: string | null; phone: string | null } | null;
}

const CAMPOS = 'id, lead_id, unidade, marcada_para, status, fechou_plano, valor_plano, agendada_em, leads(name, phone)';

/** Avaliações com dia marcado de "de" até antes de "ate", sem as canceladas. */
export function useAvaliacoes(de: Date, ate: Date) {
  return useQuery({
    queryKey: ['avaliacoes', de.toISOString(), ate.toISOString()],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('avaliacoes')
        .select(CAMPOS)
        .neq('status', 'cancelada')
        .gte('marcada_para', de.toISOString())
        .lt('marcada_para', ate.toISOString())
        .order('marcada_para');
      if (error) throw error;
      return (data ?? []) as Avaliacao[];
    },
  });
}

/** A avaliação em aberto do paciente, para o topo da conversa. */
export function useAvaliacaoAberta(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['avaliacao-aberta', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await crm
        .from('avaliacoes')
        .select('id, marcada_para, unidade')
        .eq('lead_id', leadId)
        .eq('status', 'agendada')
        .order('marcada_para', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; marcada_para: string; unidade: string | null } | null;
    },
  });
}

const ERROS: Record<string, string> = {
  outra_unidade: 'Esse paciente é de outra unidade',
  not_authorized: 'Você não tem permissão para isso',
  nao_encontrado: 'Avaliação não encontrada',
  precisa_comparecer: 'Marque primeiro que o paciente compareceu',
  valor_invalido: 'Informe o valor do plano',
  data_invalida: 'Escolha o dia e a hora',
  etapa_invalida: 'Essa etapa não existe no funil',
  unidade_invalida: 'Essa unidade não existe',
};

async function chamar(fn: string, args: Record<string, unknown>) {
  const { data, error } = await crm.rpc(fn, args);
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(ERROS[data?.error] ?? data?.error ?? 'Não foi possível salvar');
  return data;
}

function useRegistro<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['avaliacoes'] });
      qc.invalidateQueries({ queryKey: ['avaliacao-aberta'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['unidade-do-paciente'] });
    },
  });
}

/**
 * Unidade em branco: a do paciente. Em outra unidade, o paciente passa para ela
 * (crm.agendar_avaliacao), para a recepção de lá ver na Agenda e marcar presença.
 */
export const useAgendarAvaliacao = () =>
  useRegistro(({ leadId, quando, unidade }: { leadId: string; quando: Date; unidade?: string | null }) =>
    chamar('agendar_avaliacao', { _lead_id: leadId, _quando: quando.toISOString(), _unidade: unidade || null }));

/** As unidades da empresa, para escolher onde é a avaliação (crm.unidades_da_empresa). */
export function useUnidadesDaEmpresa() {
  return useQuery({
    queryKey: ['unidades-da-empresa'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await crm.rpc('unidades_da_empresa');
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
}

/** A unidade do paciente, para a conversa saber onde ele está. */
export function useUnidadeDoPaciente(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['unidade-do-paciente', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await crm.from('leads').select('unidade').eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data?.unidade ?? null) as string | null;
    },
  });
}

export const useRegistrarPresenca = () =>
  useRegistro(({ id, compareceu }: { id: string; compareceu: boolean }) =>
    chamar('registrar_presenca', { _avaliacao_id: id, _compareceu: compareceu }));

export const useRegistrarFechamento = () =>
  useRegistro(({ id, fechou, valor, plano, sessoes }: {
    id: string; fechou: boolean; valor?: number | null; plano?: string | null; sessoes?: number | null;
  }) =>
    chamar('registrar_fechamento', {
      _avaliacao_id: id, _fechou: fechou, _valor: valor ?? null, _plano: plano ?? null, _sessoes: sessoes ?? null,
    }));

/**
 * Muda a etapa do paciente passando pela Agenda (crm.mudar_etapa): agendou pede
 * dia e hora, compareceu e faltou registram a presença, fechou plano pede o
 * valor. Assim funil, Agenda e Resultados contam a mesma coisa.
 */
export const useMudarEtapa = () =>
  useRegistro(({ leadId, etapa, quando, valor, plano, sessoes, unidade }: {
    leadId: string; etapa: string; quando?: Date | null; valor?: number | null; plano?: string | null; sessoes?: number | null;
    unidade?: string | null;
  }) =>
    chamar('mudar_etapa', {
      _lead_id: leadId, _etapa: etapa, _quando: quando ? quando.toISOString() : null,
      _valor: valor ?? null, _plano: plano ?? null, _sessoes: sessoes ?? null, _unidade: unidade || null,
    }));

/** Etapas que pedem algo antes de mudar. */
export const ETAPA_PEDE_DATA = 'agendou';
export const ETAPA_PEDE_VALOR = 'fechou_plano';

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.500,00", "1500" e "1500.5" viram número. */
export function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface PlanoFechado {
  id: string;
  lead_id: string;
  unidade: string | null;
  valor_plano: number | null;
  plano: string | null;
  sessoes: number | null;
  fechamento_em: string | null;
  fechamento_por: string | null;
  leads?: { name: string | null; phone: string | null } | null;
}

/** Quem fechou plano, do mais recente para o mais antigo (aba Planos). */
export function usePlanos() {
  return useQuery({
    queryKey: ['avaliacoes', 'planos'],
    queryFn: async () => {
      const { data, error } = await crm
        .from('avaliacoes')
        .select('id, lead_id, unidade, valor_plano, plano, sessoes, fechamento_em, fechamento_por, leads(name, phone)')
        .eq('fechou_plano', true)
        .neq('status', 'cancelada')
        .order('fechamento_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlanoFechado[];
    },
  });
}
