import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTudo } from '@/lib/buscarTudo';

// A tabela de avaliações não está nos tipos gerados do Lovable.
const crm = supabase as any;

export type StatusAvaliacao = 'agendada' | 'compareceu' | 'faltou' | 'cancelada';
/** Avaliação (R1) e os retornos R2 e R3: na clínica o fechamento sai no R2 ou no R3. */
export type TipoHorario = 'avaliacao' | 'r2' | 'r3';
/**
 * Como o paciente segue: plano fechado, mensalidade, pagamento por sessão ou
 * pelo TotalPass (benefício da empresa dele; a clínica recebe o repasse por visita).
 */
export type FormaFechamento = 'plano' | 'mes_a_mes' | 'avulso' | 'totalpass';

export const ROTULO_TIPO: Record<TipoHorario, string> = { avaliacao: 'Avaliação', r2: 'R2', r3: 'R3' };
/** semValor: registra direto, sem pedir valor (o TotalPass paga por visita). */
export const FORMAS: Record<FormaFechamento, { rotulo: string; valor: string; semValor?: boolean }> = {
  plano: { rotulo: 'Fechou plano', valor: 'Valor do plano' },
  mes_a_mes: { rotulo: 'Mês a mês', valor: 'Valor da mensalidade' },
  avulso: { rotulo: 'Avulso', valor: 'Valor da sessão' },
  totalpass: { rotulo: 'Segue pelo TotalPass', valor: 'Valor do repasse', semValor: true },
};

export interface Avaliacao {
  id: string;
  lead_id: string;
  unidade: string | null;
  marcada_para: string;
  status: StatusAvaliacao;
  fechou_plano: boolean | null;
  valor_plano: number | null;
  agendada_em: string;
  tipo: TipoHorario;
  forma_fechamento: FormaFechamento | null;
  /** Com os horários do paciente, para saber se ele já marcou o R2 ou o R3. */
  leads?: { name: string | null; phone: string | null; avaliacoes?: { tipo: TipoHorario; status: StatusAvaliacao }[] } | null;
}

const CAMPOS = 'id, lead_id, unidade, marcada_para, status, fechou_plano, valor_plano, agendada_em, tipo, forma_fechamento, '
  + 'leads(name, phone, avaliacoes(tipo, status))';

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
        .select('id, marcada_para, unidade, tipo')
        .eq('lead_id', leadId)
        .eq('status', 'agendada')
        .order('marcada_para', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; marcada_para: string; unidade: string | null; tipo: TipoHorario } | null;
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
  tipo_invalido: 'Tipo de horário inválido',
  forma_invalida: 'Forma de fechamento inválida',
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
  useRegistro(({ leadId, quando, unidade, tipo }: { leadId: string; quando: Date; unidade?: string | null; tipo?: TipoHorario }) =>
    chamar('agendar_avaliacao', {
      _lead_id: leadId, _quando: quando.toISOString(), _unidade: unidade || null, _tipo: tipo ?? 'avaliacao',
    }));

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
  useRegistro(({ id, fechou, valor, plano, sessoes, forma }: {
    id: string; fechou: boolean; valor?: number | null; plano?: string | null; sessoes?: number | null;
    forma?: FormaFechamento | null;
  }) =>
    chamar('registrar_fechamento', {
      _avaliacao_id: id, _fechou: fechou, _valor: valor ?? null, _plano: plano ?? null, _sessoes: sessoes ?? null,
      _forma: fechou ? forma ?? 'plano' : null,
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

/** Etapas que marcam horário na Agenda (pedem dia e hora), com o tipo do horário. */
export const TIPO_DA_ETAPA: Record<string, TipoHorario> = { agendou: 'avaliacao', agendou_r2: 'r2', agendou_r3: 'r3' };
/** Etapas de fechamento (pedem o valor), com a forma gravada na Agenda. */
export const FORMA_DA_ETAPA: Record<string, FormaFechamento> = {
  fechou_plano: 'plano', mes_a_mes: 'mes_a_mes', avulso: 'avulso', totalpass: 'totalpass',
};
export const pedeData = (etapa: string) => Object.prototype.hasOwnProperty.call(TIPO_DA_ETAPA, etapa);
export const pedeValor = (etapa: string) =>
  Object.prototype.hasOwnProperty.call(FORMA_DA_ETAPA, etapa) && !FORMAS[FORMA_DA_ETAPA[etapa]].semValor;

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
  forma_fechamento: FormaFechamento | null;
  leads?: { name: string | null; phone: string | null } | null;
}

/** Quem fechou (plano, mês a mês ou avulso), do mais recente para o mais antigo (aba Planos). */
export function usePlanos() {
  return useQuery({
    queryKey: ['avaliacoes', 'planos'],
    queryFn: async () => {
      return buscarTudo<PlanoFechado>((de, ate) => crm
        .from('avaliacoes')
        .select('id, lead_id, unidade, valor_plano, plano, sessoes, fechamento_em, fechamento_por, forma_fechamento, leads(name, phone)')
        .eq('fechou_plano', true)
        .neq('status', 'cancelada')
        .order('fechamento_em', { ascending: false })
        .order('id')
        .range(de, ate));
    },
  });
}
