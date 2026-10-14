import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import {
  useApagarRespostaPronta, useEquipe, useRespostasProntas, useSalvarRespostaPronta,
  type RespostaPronta,
} from '@/hooks/useAtendimento';

const TODAS = '__todas__';

interface QuickRepliesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Rascunho {
  id?: string;
  atalho: string;
  unidade: string;
  texto: string;
}

/** Atalho vira só minúscula, número, hífen e sublinhado: é o que o banco aceita. */
function limparAtalho(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\//, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);
}

export function QuickRepliesModal({ open, onOpenChange }: QuickRepliesModalProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { data: respostas = [], isLoading } = useRespostasProntas(open);
  const { data: equipe = [] } = useEquipe();
  const salvar = useSalvarRespostaPronta();
  const apagar = useApagarRespostaPronta();
  const [unidades, setUnidades] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  const minhaUnidade = equipe.find((p) => p.id === user?.id)?.unidade ?? null;

  useEffect(() => {
    if (!open) return;
    (supabase as any)
      .from('wa_accounts')
      .select('unidade')
      .eq('ativo', true)
      .order('unidade')
      .then(({ data }: { data: { unidade: string }[] | null }) =>
        setUnidades((data ?? []).map((u) => u.unidade)),
      );
  }, [open]);

  useEffect(() => {
    if (!open) setRascunho(null);
  }, [open]);

  const nova = () =>
    setRascunho({ atalho: '', unidade: minhaUnidade ?? TODAS, texto: '' });

  const editar = (r: RespostaPronta) =>
    setRascunho({ id: r.id, atalho: r.atalho, unidade: r.unidade ?? TODAS, texto: r.texto });

  const gravar = () => {
    if (!rascunho || !tenant) return;
    if (rascunho.atalho.length < 2) {
      toast.error('O atalho precisa de pelo menos 2 letras.');
      return;
    }
    if (!rascunho.texto.trim()) {
      toast.error('Escreva o texto da resposta.');
      return;
    }
    salvar.mutate(
      {
        id: rascunho.id,
        atalho: rascunho.atalho,
        unidade: rascunho.unidade === TODAS ? null : rascunho.unidade,
        texto: rascunho.texto.trim(),
        tenantId: tenant.id,
      },
      {
        onSuccess: () => {
          toast.success('Resposta salva');
          setRascunho(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    );
  };

  const remover = (r: RespostaPronta) => {
    if (!confirm(`Apagar a resposta /${r.atalho}?`)) return;
    apagar.mutate(r.id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao apagar'),
    });
  };

  // Atendente com unidade só cria para a unidade dela; o banco recusa o resto.
  const opcoesUnidade = minhaUnidade ? [minhaUnidade] : [TODAS, ...unidades];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-primary" />
            Respostas prontas
          </DialogTitle>
          <DialogDescription>
            Textos que a equipe usa no atendimento digitando <strong>/atalho</strong>. Uma resposta pode valer para
            todas as unidades ou só para uma: o endereço, por exemplo, é um por unidade.
          </DialogDescription>
        </DialogHeader>

        {rascunho ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="atalho">Atalho</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                  <Input
                    id="atalho"
                    value={rascunho.atalho}
                    onChange={(e) => setRascunho({ ...rascunho, atalho: limparAtalho(e.target.value) })}
                    placeholder="endereco"
                    className="pl-6"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Vale para</Label>
                <Select
                  value={rascunho.unidade}
                  onValueChange={(v) => setRascunho({ ...rascunho, unidade: v })}
                  disabled={opcoesUnidade.length === 1}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opcoesUnidade.map((u) => (
                      <SelectItem key={u} value={u}>{u === TODAS ? 'Todas as unidades' : u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="texto">Texto</Label>
              <textarea
                id="texto"
                value={rascunho.texto}
                onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
                rows={6}
                placeholder="Olá {nome}! A unidade {unidade} fica na Rua ..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                <code>{'{nome}'}</code> vira o primeiro nome do paciente, <code>{'{unidade}'}</code> a unidade da conversa
                e <code>{'{atendente}'}</code> o seu primeiro nome.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRascunho(null)}>Cancelar</Button>
              <Button onClick={gravar} disabled={salvar.isPending}>
                {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {respostas.length} {respostas.length === 1 ? 'resposta' : 'respostas'}
              </p>
              <Button size="sm" onClick={nova}>
                <Plus className="w-4 h-4 mr-1" />
                Nova resposta
              </Button>
            </div>

            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {!isLoading && respostas.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma resposta ainda. Comece pelas perguntas que mais chegam: endereço de cada unidade,
                valor da avaliação, horários e como confirmar a consulta.
              </div>
            )}

            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {respostas.map((r) => (
                <div key={r.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-foreground">/{r.atalho}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                        {r.unidade ?? 'Todas as unidades'}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editar(r)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => remover(r)}
                        title="Apagar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{r.texto}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
