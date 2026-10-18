import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useEtapas } from '@/hooks/useEmpresa';
import { ETAPA_PEDE_DATA, ETAPA_PEDE_VALOR, lerValor, useMudarEtapa } from '@/hooks/useAgenda';

interface MudarEtapaDialogProps {
  /** O paciente; nulo fecha a janela. */
  lead: { id: string; name: string; stage: string } | null;
  /** Etapa já escolhida (ao arrastar no funil). Sem ela, a janela pergunta. */
  etapa?: string | null;
  onClose: () => void;
}

const AVISO: Record<string, string> = {
  compareceu: 'Fica registrado na Agenda que o paciente veio.',
  faltou: 'Fica registrado na Agenda que o paciente faltou.',
};

/**
 * Mudar a etapa do paciente pelo funil ou pela lista. Passa pela Agenda
 * (crm.mudar_etapa), para os números baterem em todas as telas.
 */
export function MudarEtapaDialog({ lead, etapa: etapaInicial, onClose }: MudarEtapaDialogProps) {
  const { etapas, rotulo } = useEtapas();
  const mudar = useMudarEtapa();
  const [etapa, setEtapa] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [valor, setValor] = useState('');
  const [plano, setPlano] = useState('');
  const [sessoes, setSessoes] = useState('');

  useEffect(() => {
    if (!lead) return;
    setEtapa(etapaInicial ?? '');
    setDia(format(new Date(), 'yyyy-MM-dd'));
    setHora('');
    setValor('');
    setPlano('');
    setSessoes('');
  }, [lead?.id, etapaInicial]);

  const salvar = () => {
    if (!lead || !etapa) return;
    let quando: Date | null = null;
    let v: number | null = null;
    if (etapa === ETAPA_PEDE_DATA) {
      if (!dia || !hora) {
        toast.error('Escolha o dia e a hora');
        return;
      }
      quando = new Date(`${dia}T${hora}`);
    }
    if (etapa === ETAPA_PEDE_VALOR) {
      v = lerValor(valor);
      if (!v) {
        toast.error('Informe o valor do plano');
        return;
      }
    }
    const n = Number(sessoes);
    mudar.mutate(
      {
        leadId: lead.id, etapa, quando, valor: v,
        plano: plano.trim() || null, sessoes: Number.isInteger(n) && n > 0 ? n : null,
      },
      {
        onSuccess: () => {
          toast.success(`${lead.name}: ${rotulo(etapa)}`);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={!!lead} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mudar etapa</DialogTitle>
          <DialogDescription>{lead?.name} · hoje em {lead ? rotulo(lead.stage) : ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!etapaInicial && (
            <div className="space-y-1.5">
              <Label>Nova etapa</Label>
              <Select value={etapa} onValueChange={setEtapa}>
                <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                <SelectContent>
                  {etapas.filter((e) => e.value !== lead?.stage).map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {etapa === ETAPA_PEDE_DATA && (
            <div className="space-y-1.5">
              <Label>Dia e hora da avaliação</Label>
              <div className="flex gap-2">
                <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
                <Input type="time" value={hora} step={300} onChange={(e) => setHora(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Entra na Agenda desse dia.</p>
            </div>
          )}

          {etapa === ETAPA_PEDE_VALOR && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Valor do plano</Label>
                <Input inputMode="decimal" placeholder="Ex.: 1.500,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div className="space-y-1.5">
                  <Label>Plano <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input placeholder="Ex.: Plano de cuidado 26" value={plano} onChange={(e) => setPlano(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sessões</Label>
                  <Input type="number" min={1} value={sessoes} onChange={(e) => setSessoes(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {AVISO[etapa] && <p className="text-sm text-muted-foreground">{AVISO[etapa]}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!etapa || mudar.isPending}>
            {mudar.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
