import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { conexao } from '@/lib/conexao';

const assinarRede = (ouvir: () => void) => {
  window.addEventListener('online', ouvir);
  window.addEventListener('offline', ouvir);
  return () => {
    window.removeEventListener('online', ouvir);
    window.removeEventListener('offline', ouvir);
  };
};

/**
 * Faixa no rodapé enquanto a conexão com o servidor está ruim (src/lib/conexao.ts):
 * sem ela a tela parecia travada. Quando o login é renovado, o que deu erro
 * nesse meio tempo carrega de novo sozinho.
 */
export function AvisoConexao() {
  const qc = useQueryClient();
  const ruim = useSyncExternalStore(conexao.assinar, conexao.ruim);
  const semRede = !useSyncExternalStore(assinarRede, () => navigator.onLine);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento !== 'TOKEN_REFRESHED' && evento !== 'SIGNED_IN') return;
      // Fora do aviso do supabase-js: consultar dentro dele prende a sessão.
      setTimeout(() => {
        conexao.voltou();
        void qc.refetchQueries({ predicate: (q) => q.state.status === 'error' });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  if (!ruim && !semRede) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-lg">
      <Loader2 className="w-4 h-4 animate-spin" />
      {semRede ? 'Sem internet. Assim que voltar, o CRM atualiza sozinho.' : 'Conexão instável. Reconectando…'}
    </div>
  );
}
