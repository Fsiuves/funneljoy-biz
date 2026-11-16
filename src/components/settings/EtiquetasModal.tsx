// Criar, editar e apagar as etiquetas do CRM (supabase/sql/50-etiquetas.sql). As do
// celular aparecem à parte, só para ver: mudam pelo WhatsApp do celular.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Plus, Smartphone, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useEquipe } from '@/hooks/useAtendimento';
import {
  CORES_ETIQUETA, useApagarEtiqueta, useEtiquetas, useMarcacoes, useSalvarEtiqueta, type Etiqueta,
} from '@/hooks/useEtiquetas';

const TODAS = '__todas__';

interface Rascunho {
  id?: string;
  nome: string;
  cor: string;
  unidade: string;
}

export function EtiquetasModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { data: etiquetas = [], isLoading } = useEtiquetas(open);
  const { data: marcacoes = [] } = useMarcacoes(open);
  const { data: equipe = [] } = useEquipe();
  const salvar = useSalvarEtiqueta();
  const apagar = useApagarEtiqueta();
  const [unidades, setUnidades] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const minhaUnidade = equipe.find((p) => p.id === user?.id)?.unidade ?? null;

  useEffect(() => {
    if (!open) {
      setRascunho(null);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('wa_accounts').select('unidade').eq('ativo', true).order('unidade')
      .then(({ data }: { data: { unidade: string }[] | null }) => setUnidades((data ?? []).map((u) => u.unidade)));
  }, [open]);

  // Atendente com unidade só cria para a unidade dela; o banco recusa o resto.
  const opcoesUnidade = minhaUnidade ? [minhaUnidade] : [TODAS, ...unidades];
  const usos = (id: string) => marcacoes.filter((m) => m.etiqueta_id === id).length;
  const doCrm = etiquetas.filter((e) => e.origem === 'crm');
  const doCelular = etiquetas.filter((e) => e.origem === 'whatsapp');

  const gravar = () => {
    if (!rascunho || !tenant) return;
    if (!rascunho.nome.trim()) {
      toast.error('Escreva o nome da etiqueta.');
      return;
    }
    salvar.mutate(
      { id: rascunho.id, nome: rascunho.nome, cor: rascunho.cor, unidade: rascunho.unidade === TODAS ? null : rascunho.unidade, tenantId: tenant.id },
      {
        onSuccess: () => {
          toast.success('Etiqueta salva');
          setRascunho(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    );
  };

  const remover = (e: Etiqueta) => {
    const n = usos(e.id);
    if (!confirm(n ? `Apagar a etiqueta "${e.nome}"? Ela sai de ${n} conversa${n > 1 ? 's' : ''}.` : `Apagar a etiqueta "${e.nome}"?`)) return;
    apagar.mutate(e.id, { onError: (erro) => toast.error(erro instanceof Error ? erro.message : 'Erro ao apagar') });
  };

  const linha = (e: Etiqueta, editavel: boolean) => (
    <div key={e.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <span className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
      <span className="flex-1 truncate text-sm font-medium">{e.nome}</span>
      <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">{e.unidade ?? 'Todas as unidades'}</span>
      <span className="text-[11px] text-muted-foreground w-20 text-right">{usos(e.id)} conversa{usos(e.id) === 1 ? '' : 's'}</span>
      {editavel ? (
        <>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar"
            onClick={() => setRascunho({ id: e.id, nome: e.nome, cor: e.cor, unidade: e.unidade ?? TODAS })}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Apagar" onClick={() => remover(e)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <Smartphone className="w-4 h-4 text-muted-foreground mx-2" aria-label="Do celular" />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary" />
            Etiquetas
          </DialogTitle>
          <DialogDescription>
            Para organizar as conversas, como no WhatsApp: marque pelo botão de etiqueta no topo da conversa e filtre a
            lista por etiqueta. As do celular vêm do WhatsApp da unidade e mudam por lá.
          </DialogDescription>
        </DialogHeader>

        {rascunho ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nome-etiqueta">Nome</Label>
                <Input id="nome-etiqueta" value={rascunho.nome} maxLength={40} autoFocus placeholder="Agendaram"
                  onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Vale para</Label>
                <Select value={rascunho.unidade} onValueChange={(v) => setRascunho({ ...rascunho, unidade: v })} disabled={opcoesUnidade.length === 1}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opcoesUnidade.map((u) => <SelectItem key={u} value={u}>{u === TODAS ? 'Todas as unidades' : u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {CORES_ETIQUETA.map((cor) => (
                  <button key={cor} type="button" title={cor} onClick={() => setRascunho({ ...rascunho, cor })}
                    className={`h-7 w-7 rounded-full border-2 ${rascunho.cor === cor ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: cor }} />
                ))}
              </div>
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
              <p className="text-sm text-muted-foreground">{doCrm.length} do CRM · {doCelular.length} do celular</p>
              <Button size="sm" onClick={() => setRascunho({ nome: '', cor: CORES_ETIQUETA[0], unidade: minhaUnidade ?? TODAS })}>
                <Plus className="w-4 h-4 mr-1" />
                Nova etiqueta
              </Button>
            </div>
            {isLoading && (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            )}
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {doCrm.map((e) => linha(e, true))}
              {doCelular.length > 0 && (
                <p className="pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Do celular (para mudar, edite no WhatsApp da unidade)
                </p>
              )}
              {doCelular.map((e) => linha(e, false))}
              {!isLoading && etiquetas.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma etiqueta ainda. Comece pelas que vocês já usam no celular: Agendaram, Não fecharam plano,
                  Cancelamento, Influencer.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
