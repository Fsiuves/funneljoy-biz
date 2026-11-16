// Etiquetas nas conversas, como no WhatsApp (pedido da clínica em 16/11/2026;
// supabase/sql/50-etiquetas.sql). Duas origens:
// - 'crm': criada no CRM; a equipe cria, edita, apaga, põe e tira aqui;
// - 'whatsapp': vem do celular da unidade pela sincronização; aqui só aparece.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTudo } from '@/lib/buscarTudo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const crm = supabase as any;

export interface Etiqueta {
  id: string;
  unidade: string | null;
  nome: string;
  cor: string;
  origem: 'crm' | 'whatsapp';
}

export interface Marcacao {
  conversation_id: string;
  etiqueta_id: string;
  origem: 'crm' | 'whatsapp';
}

/** Cores para as etiquetas criadas no CRM. */
export const CORES_ETIQUETA = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#a16207', '#64748b',
];

export function useEtiquetas(ativo = true) {
  return useQuery({
    queryKey: ['etiquetas'],
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await crm
        .from('etiquetas')
        .select('id, unidade, nome, cor, origem')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as Etiqueta[];
    },
  });
}

/** Todas as marcações que a pessoa enxerga (as do celular mudam pela sincronização). */
export function useMarcacoes(ativo = true) {
  return useQuery({
    queryKey: ['etiquetas', 'marcacoes'],
    enabled: ativo,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () =>
      buscarTudo<Marcacao>((de, ate) =>
        crm
          .from('conversa_etiquetas')
          .select('conversation_id, etiqueta_id, origem')
          .order('conversation_id')
          .order('etiqueta_id')
          .range(de, ate),
      ),
  });
}

/** Põe ou tira uma etiqueta do CRM numa conversa. */
export function useMarcarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversaId, etiquetaId, marcar }: { conversaId: string; etiquetaId: string; marcar: boolean }) => {
      const { error } = marcar
        ? await crm.from('conversa_etiquetas').insert({ conversation_id: conversaId, etiqueta_id: etiquetaId })
        : await crm.from('conversa_etiquetas').delete().eq('conversation_id', conversaId).eq('etiqueta_id', etiquetaId);
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    // Na hora, sem esperar a volta do banco; se falhar, busca de novo.
    onMutate: async ({ conversaId, etiquetaId, marcar }) => {
      await qc.cancelQueries({ queryKey: ['etiquetas', 'marcacoes'] });
      qc.setQueryData<Marcacao[]>(['etiquetas', 'marcacoes'], (lista = []) =>
        marcar
          ? [...lista, { conversation_id: conversaId, etiqueta_id: etiquetaId, origem: 'crm' }]
          : lista.filter((m) => !(m.conversation_id === conversaId && m.etiqueta_id === etiquetaId)),
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['etiquetas', 'marcacoes'] }),
  });
}

export function useSalvarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { id?: string; nome: string; cor: string; unidade: string | null; tenantId: string }) => {
      const linha = { nome: e.nome.trim(), cor: e.cor, unidade: e.unidade };
      const { error } = e.id
        ? await crm.from('etiquetas').update(linha).eq('id', e.id)
        : await crm.from('etiquetas').insert({ ...linha, tenant_id: e.tenantId });
      if (error) {
        if (error.code === '23505') throw new Error('Já existe uma etiqueta com esse nome nessa unidade.');
        if (error.code === '42501') throw new Error('Você não pode mexer nas etiquetas dessa unidade.');
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['etiquetas'] }),
  });
}

export function useApagarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await crm.from('etiquetas').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['etiquetas'] }),
  });
}
