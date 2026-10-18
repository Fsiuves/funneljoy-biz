import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRegrasAtendimento, useSalvarRegrasAtendimento, type RegrasAtendimento, type TrocaDeTurno,
} from '@/hooks/useAtendimento';

const OPCOES: { valor: TrocaDeTurno; titulo: string; texto: string }[] = [
  {
    valor: 'primeiro',
    titulo: 'Fica com quem respondeu primeiro',
    texto: 'A conversa não muda de dona sozinha. Para passar adiante, troque no campo Responsável.',
  },
  {
    valor: 'ausente',
    titulo: 'Passa para quem responder, se a responsável não estiver logada',
    texto: 'Bom para turnos: a da manhã clica em Sair ao ir embora, e o que a da tarde responder fica com ela. Com a responsável logada, nada muda.',
  },
  {
    valor: 'ultimo',
    titulo: 'Passa sempre para quem respondeu por último',
    texto: 'A conversa é de quem falou com o paciente por último, mesmo com a outra logada.',
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Regras do atendimento: troca de turno e assinatura com o nome da atendente. */
export function RegrasAtendimentoModal({ open, onOpenChange }: Props) {
  const { data: salvas, isLoading } = useRegrasAtendimento();
  const salvar = useSalvarRegrasAtendimento();
  const [regras, setRegras] = useState<RegrasAtendimento | null>(null);
  useEffect(() => { if (open && salvas) setRegras(salvas); }, [open, salvas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-primary" />
            Regras do atendimento
          </DialogTitle>
          <DialogDescription>Quem fica com a conversa e como a mensagem sai.</DialogDescription>
        </DialogHeader>

        {!regras ? (
          <div className="py-8 flex justify-center">{isLoading && <Loader2 className="w-6 h-6 animate-spin text-primary" />}</div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <Label>Quando outra atendente responde uma conversa que já tem responsável</Label>
              {OPCOES.map((o) => (
                <label key={o.valor}
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${regras.troca_turno === o.valor ? 'border-primary bg-primary/5' : ''}`}>
                  <input type="radio" name="troca_turno" className="mt-1" checked={regras.troca_turno === o.valor}
                    onChange={() => setRegras({ ...regras, troca_turno: o.valor })} />
                  <span>
                    <span className="block text-sm font-medium">{o.titulo}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{o.texto}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Gerente e direção nunca tomam a conversa de uma atendente ao responder. Conversa sem responsável fica com quem responde.
              </p>
            </section>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Assinar com o nome da atendente</p>
                <p className="text-xs text-muted-foreground">
                  A mensagem enviada pelo painel sai com o nome de quem atende na primeira linha, em negrito (ex.: *Mariana:*).
                  O que sai pelo celular não muda.
                </p>
              </div>
              <Switch checked={regras.assinar} onCheckedChange={(v) => setRegras({ ...regras, assinar: v })} />
            </div>

            <div className="flex justify-end">
              <Button
                disabled={salvar.isPending || JSON.stringify(regras) === JSON.stringify(salvas)}
                onClick={() => salvar.mutate(regras, {
                  onSuccess: () => { toast.success('Regras salvas'); onOpenChange(false); },
                  onError: (e) => toast.error(e.message),
                })}
              >
                {salvar.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
