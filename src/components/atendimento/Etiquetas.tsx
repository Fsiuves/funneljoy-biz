// Etiquetas na conversa (supabase/sql/50-etiquetas.sql): o selo e o botão que põe
// e tira. Etiqueta do celular aparece com o ícone de celular e só muda pelo celular.
import { useMemo, useState } from 'react';
import { Smartphone, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EtiquetasModal } from '@/components/settings/EtiquetasModal';
import {
  useEtiquetas, useMarcacoes, useMarcarEtiqueta, type Etiqueta,
} from '@/hooks/useEtiquetas';

export function ChipEtiqueta({ e, celular }: { e: Etiqueta; celular?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground max-w-[140px]"
      title={celular ? `${e.nome} (marcada no celular)` : e.nome}
    >
      <span className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
      <span className="truncate">{e.nome}</span>
      {celular && <Smartphone className="w-3 h-3 shrink-0" />}
    </span>
  );
}

/** Selos da conversa e o botão para pôr e tirar as etiquetas do CRM. */
export function EtiquetasDaConversa({ conversaId, unidade }: { conversaId: string; unidade: string }) {
  const { data: etiquetas = [] } = useEtiquetas();
  const { data: marcacoes = [] } = useMarcacoes();
  const marcar = useMarcarEtiqueta();
  const [gerir, setGerir] = useState(false);

  const daUnidade = useMemo(
    () => etiquetas.filter((e) => !e.unidade || e.unidade === unidade),
    [etiquetas, unidade],
  );
  const naConversa = useMemo(
    () => new Map(marcacoes.filter((m) => m.conversation_id === conversaId).map((m) => [m.etiqueta_id, m.origem])),
    [marcacoes, conversaId],
  );
  const marcadas = daUnidade.filter((e) => naConversa.has(e.id));

  const alternar = (e: Etiqueta) => {
    marcar.mutate(
      { conversaId, etiquetaId: e.id, marcar: !naConversa.has(e.id) },
      { onError: (erro) => toast.error(erro instanceof Error ? erro.message : 'Não foi possível salvar') },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {marcadas.map((e) => <ChipEtiqueta key={e.id} e={e} celular={naConversa.get(e.id) === 'whatsapp'} />)}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" title="Etiquetas">
            <Tag className="w-3.5 h-3.5" />
            {marcadas.length === 0 && 'Etiquetas'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Etiquetas</p>
          <div className="max-h-64 overflow-y-auto">
            {daUnidade.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">Nenhuma etiqueta ainda.</p>
            )}
            {daUnidade.map((e) => {
              const doCelular = e.origem === 'whatsapp';
              return (
                <label
                  key={e.id}
                  className={`flex items-center gap-2 rounded px-1 py-1.5 text-sm ${doCelular ? 'opacity-70' : 'cursor-pointer hover:bg-muted'}`}
                  title={doCelular ? 'Etiqueta do celular: marque e tire pelo WhatsApp do celular' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={naConversa.has(e.id)}
                    disabled={doCelular || marcar.isPending}
                    onChange={() => alternar(e)}
                  />
                  <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
                  <span className="flex-1 truncate">{e.nome}</span>
                  {doCelular && <Smartphone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                </label>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="mt-1 w-full justify-start text-xs" onClick={() => setGerir(true)}>
            Criar e editar etiquetas
          </Button>
        </PopoverContent>
      </Popover>
      <EtiquetasModal open={gerir} onOpenChange={setGerir} />
    </div>
  );
}
