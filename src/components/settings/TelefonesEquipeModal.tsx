import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PhoneOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  avisoTelefoneMarcado, useDesmarcarTelefoneEquipe, useMarcarTelefoneEquipe, useTelefonesEquipe,
} from '@/hooks/useAtendimento';

interface TelefonesEquipeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Números dos sócios e da equipe. A conversa deles aparece no atendimento com a
 * etiqueta Equipe, mas não vira paciente nem conta nos números.
 */
export function TelefonesEquipeModal({ open, onOpenChange }: TelefonesEquipeModalProps) {
  const { data: telefones = [], isLoading } = useTelefonesEquipe(open);
  const marcar = useMarcarTelefoneEquipe();
  const desmarcar = useDesmarcarTelefoneEquipe();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const adicionar = () => {
    marcar.mutate(
      { telefone, nome },
      {
        onSuccess: (r) => {
          toast.success(avisoTelefoneMarcado(r), { duration: 7000 });
          setNome('');
          setTelefone('');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const remover = (id: string, rotulo: string) => {
    if (!confirm(`Tirar ${rotulo} dos telefones da equipe? As próximas mensagens desse número voltam a virar paciente.`)) return;
    desmarcar.mutate(id, { onError: (e) => toast.error(e.message) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneOff className="w-5 h-5 text-primary" />
            Telefones da equipe
          </DialogTitle>
          <DialogDescription>
            Números dos sócios e da equipe que escrevem para a clínica. A conversa aparece no atendimento com a
            etiqueta Equipe, mas não vira paciente e não conta nos números.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-1">
          {isLoading && (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          )}
          {!isLoading && telefones.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum telefone ainda.</p>
          )}
          {telefones.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{t.nome || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{t.telefone}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                title="Tirar da lista"
                disabled={desmarcar.isPending}
                onClick={() => remover(t.id, t.nome || t.telefone)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tel-nome" className="text-xs">Nome</Label>
              <Input id="tel-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana (sócia)" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel-numero" className="text-xs">Telefone com DDD</Label>
              <Input id="tel-numero" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="11 99999-9999" inputMode="tel" className="h-9" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se esse número já escreveu, a conversa passa a ter a etiqueta Equipe, e o paciente que foi criado sozinho
            sai do funil.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={adicionar} disabled={marcar.isPending || telefone.replace(/\D/g, '').length < 10}>
              {marcar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
