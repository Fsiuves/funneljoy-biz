import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovaVersao } from '@/hooks/useNovaVersao';

const RECARREGOU_PARA = 'recarregou-para-versao';

/**
 * Aviso no rodapé quando sai versão nova com a aba aberta. O Painel da recepção
 * fica numa TV, sem ninguém para clicar: ali recarrega sozinho, uma vez por versão
 * publicada, para não entrar em laço se o servidor ainda entregar o código antigo.
 */
export function AvisoNovaVersao() {
  const novo = useNovaVersao();
  const naTv = window.location.pathname.startsWith('/painel');
  let jaRecarregou = false;
  try { jaRecarregou = sessionStorage.getItem(RECARREGOU_PARA) === novo; } catch { /* sem sessionStorage */ }
  const recarregarSozinho = !!novo && naTv && !jaRecarregou;

  useEffect(() => {
    if (!recarregarSozinho || !novo) return;
    try { sessionStorage.setItem(RECARREGOU_PARA, novo); } catch { /* segue sem a trava */ }
    window.location.reload();
  }, [recarregarSozinho, novo]);

  if (!novo || naTv) return null;
  return (
    <div className="fixed top-3 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
      <RefreshCw className="w-4 h-4 text-primary" />
      <span className="text-sm text-foreground">Nova versão do sistema disponível.</span>
      <Button size="sm" onClick={() => window.location.reload()}>Atualizar</Button>
    </div>
  );
}
