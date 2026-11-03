import { useQuery } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const crm = supabase as any;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Aviso no menu quando o WhatsApp de uma unidade para de responder (03/11, Lapa:
 * 52 min sem receber nem enviar, e a tela não dizia nada). Quem marca é o envio
 * que a Evolution não respondeu (wa-enviar, que também reinicia a conexão); some
 * quando chega mensagem em dia por aquele número (37-saude-do-whatsapp.sql).
 * Cada um vê só as unidades que enxerga; número desativado não conta.
 */
export function AvisoWhatsapp() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['wa-conexao', user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await crm.from('wa_conexao')
        .select('unidade, fora_desde, wa_accounts!inner(ativo)')
        .eq('estado', 'sem_resposta')
        .eq('wa_accounts.ativo', true);
      if (error) throw error;
      return (data ?? []) as { unidade: string | null; fora_desde: string | null }[];
    },
  });

  if (!data?.length) return null;
  return (
    <div className="px-4 pt-4">
      <div role="alert" className="flex gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
        <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          {data.map((c) => (
            <p key={c.unidade ?? '-'} className="font-semibold">
              WhatsApp{c.unidade ? ` da ${c.unidade}` : ''} sem resposta{c.fora_desde ? ` desde ${hora(c.fora_desde)}` : ''}.
            </p>
          ))}
          <p>Mensagens novas podem chegar atrasadas e os envios podem não sair. Atenda pelo celular até voltar; o sistema já está reconectando.</p>
        </div>
      </div>
    </div>
  );
}
