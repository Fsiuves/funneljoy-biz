import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Consulta que falhou não é lista vazia. As telas mostravam "Nenhum paciente",
 * "Nenhum horário" ou números zerados quando a conexão falhava, e a recepção
 * tirava a conclusão errada (auditoria de 30/10). O React Query tenta de novo
 * sozinho; o botão tenta na hora.
 */
export function ErroAoCarregar({ oQue, tentar, tentando }: { oQue: string; tentar: () => void; tentando?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
      <p>Não foi possível carregar {oQue}.</p>
      <Button size="sm" variant="outline" disabled={tentando} onClick={tentar}>
        {tentando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tentar de novo'}
      </Button>
    </div>
  );
}
