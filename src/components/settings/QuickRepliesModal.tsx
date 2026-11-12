import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageSquareText, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import {
  useApagarRespostaPronta, useEquipe, useRespostasProntas, useSalvarRespostaPronta, baixarAnexoResposta,
  rotuloDoAnexo, LIMITE_ANEXO, type AnexoResposta, type RespostaPronta,
} from '@/hooks/useAtendimento';

const TODAS = '__todas__';

interface QuickRepliesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arquivo de uma conversa ("Salvar como resposta pronta"): abre direto numa resposta nova com ele. */
  inicial?: AnexoResposta | null;
}

interface Rascunho {
  id?: string;
  atalho: string;
  unidade: string;
  texto: string;
  /** Arquivo novo; null tira o que a resposta tinha; sem valor, fica o que tinha. */
  anexo?: AnexoResposta | null;
  /** O arquivo que a resposta já tinha ao abrir para editar. */
  anexoAtual: { caminho: string; nome: string; mimetype: string } | null;
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

export function QuickRepliesModal({ open, onOpenChange, inicial }: QuickRepliesModalProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { data: respostas = [], isLoading } = useRespostasProntas(open);
  const { data: equipe = [] } = useEquipe();
  const salvar = useSalvarRespostaPronta();
  const apagar = useApagarRespostaPronta();
  const [unidades, setUnidades] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);

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

  const nova = (anexo?: AnexoResposta) =>
    setRascunho({ atalho: '', unidade: minhaUnidade ?? TODAS, texto: '', anexo, anexoAtual: null });

  useEffect(() => {
    if (!open) setRascunho(null);
    else if (inicial) nova(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inicial]);

  const editar = (r: RespostaPronta) =>
    setRascunho({
      id: r.id, atalho: r.atalho, unidade: r.unidade ?? TODAS, texto: r.texto,
      anexoAtual: r.anexo_caminho
        ? { caminho: r.anexo_caminho, nome: r.anexo_nome ?? 'arquivo', mimetype: r.anexo_mimetype ?? '' }
        : null,
    });

  // O que aparece no rascunho: o arquivo novo ou, sem troca, o que a resposta já tinha.
  const anexoMostrado = rascunho ? (rascunho.anexo !== undefined ? rascunho.anexo : rascunho.anexoAtual) : null;

  // Prévia para ouvir ou ver antes de salvar. O arquivo que já estava guardado é baixado.
  useEffect(() => {
    setPrevia(null);
    if (!rascunho) return;
    let url: string | null = null;
    let viva = true;
    if (rascunho.anexo) {
      url = URL.createObjectURL(rascunho.anexo.arquivo);
      setPrevia(url);
    } else if (rascunho.anexo === undefined && rascunho.anexoAtual) {
      baixarAnexoResposta(rascunho.anexoAtual.caminho)
        .then((b) => {
          if (!viva) return;
          url = URL.createObjectURL(b);
          setPrevia(url);
        })
        .catch(() => undefined);
    }
    return () => {
      viva = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho?.anexo, rascunho?.anexoAtual?.caminho]);

  const escolherArquivo = (arq: File) => {
    if (arq.size > LIMITE_ANEXO) {
      toast.error('Arquivo grande demais: até 10 MB.');
      return;
    }
    setRascunho((r) => r && { ...r, anexo: { arquivo: arq, nome: arq.name, mimetype: arq.type || 'application/octet-stream' } });
  };

  // Vindo de uma conversa, cancelar ou salvar volta para a conversa.
  const fechar = () => (inicial ? onOpenChange(false) : setRascunho(null));

  const gravar = () => {
    if (!rascunho || !tenant) return;
    if (rascunho.atalho.length < 2) {
      toast.error('O atalho precisa de pelo menos 2 letras.');
      return;
    }
    if (!rascunho.texto.trim() && !anexoMostrado) {
      toast.error('Escreva o texto ou escolha um arquivo.');
      return;
    }
    salvar.mutate(
      {
        id: rascunho.id,
        atalho: rascunho.atalho,
        unidade: rascunho.unidade === TODAS ? null : rascunho.unidade,
        texto: rascunho.texto.trim(),
        tenantId: tenant.id,
        anexo: rascunho.anexo,
        anexoAnterior: rascunho.anexoAtual?.caminho ?? null,
      },
      {
        onSuccess: () => {
          toast.success('Resposta salva');
          fechar();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    );
  };

  const remover = (r: RespostaPronta) => {
    if (!confirm(`Apagar a resposta /${r.atalho}?`)) return;
    apagar.mutate(r, {
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
            Textos, áudios e arquivos que a equipe usa no atendimento digitando <strong>/atalho</strong>. Uma resposta pode valer para
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
                e <code>{'{atendente}'}</code> o seu primeiro nome. Com arquivo, o texto pode ficar vazio.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Áudio ou arquivo (opcional)</Label>
              {anexoMostrado ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-2">
                  {anexoMostrado.mimetype.startsWith('audio/') && previa ? (
                    <audio controls src={previa} className="h-10 max-w-[300px]" />
                  ) : anexoMostrado.mimetype.startsWith('image/') && previa ? (
                    <img src={previa} alt={anexoMostrado.nome} className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <span className="text-sm font-medium">{rotuloDoAnexo(anexoMostrado.mimetype)}</span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">{anexoMostrado.nome}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Tirar arquivo"
                    onClick={() => setRascunho((r) => r && { ...r, anexo: null })}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => seletor.current?.click()}>
                  <Paperclip className="w-4 h-4 mr-1.5" />
                  Escolher arquivo
                </Button>
              )}
              <input
                ref={seletor}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const arq = e.target.files?.[0];
                  if (arq) escolherArquivo(arq);
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-muted-foreground">
                Áudio sai como mensagem de voz, e o texto, se tiver, vai logo depois. Foto, vídeo e documento levam o
                texto como legenda. Até 10 MB. Um áudio que já está numa conversa pode ser salvo de lá: abra o áudio e
                clique em <strong>Salvar como resposta pronta</strong>.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
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
              <Button size="sm" onClick={() => nova()}>
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
                      {r.anexo_mimetype && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {rotuloDoAnexo(r.anexo_mimetype)}
                        </span>
                      )}
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
                  {r.texto && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{r.texto}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
