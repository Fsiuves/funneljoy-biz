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
      const { data } = await crm
        .from('avaliacoes')
        .select('id, marcada_para')
        .eq('lead_id', leadId)
        .eq('status', 'agendada')
        .order('marcada_para', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as { id: string; marcada_para: string } | null;
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
    },
  });
}

export const useAgendarAvaliacao = () =>
  useRegistro(({ leadId, quando }: { leadId: string; quando: Date }) =>
    chamar('agendar_avaliacao', { _lead_id: leadId, _quando: quando.toISOString() }));

export const useRegistrarPresenca = () =>
  useRegistro(({ id, compareceu }: { id: string; compareceu: boolean }) =>
    chamar('registrar_presenca', { _avaliacao_id: id, _compareceu: compareceu }));

export const useRegistrarFechamento = () =>
  useRegistro(({ id, fechou, valor }: { id: string; fechou: boolean; valor?: number | null }) =>
    chamar('registrar_fechamento', { _avaliacao_id: id, _fechou: fechou, _valor: valor ?? null }));

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.500,00", "1500" e "1500.5" viram número. */
export function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}
