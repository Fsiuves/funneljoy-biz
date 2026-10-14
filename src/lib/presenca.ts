import { supabase } from '@/integrations/supabase/client';

// Quem está com o CRM aberto e qual conversa está na tela. A resposta que sai
// pelo celular ou pelo WhatsApp Web não diz quem respondeu; com isto o banco
// passa a conversa sem responsável para a atendente logada da unidade
// (crm.atendente_logada, em 18-assumir-automatico.sql).
const crm = supabase as any;
let conversaAberta: string | null = null;

const chamar = (args: Record<string, unknown>) =>
  crm.rpc('marcar_presenca', args).then(() => undefined, () => undefined);

export const avisarPresenca = () => chamar({ _conversa: conversaAberta });

export function avisarConversaAberta(id: string | null) {
  if (id === conversaAberta) return;
  conversaAberta = id;
  void avisarPresenca();
}

export function sairDaPresenca() {
  conversaAberta = null;
  return chamar({ _online: false });
}
