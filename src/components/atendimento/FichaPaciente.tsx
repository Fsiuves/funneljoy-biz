import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ExternalLink, Loader2, PhoneOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { MudarEtapaDialog } from '@/components/leads/MudarEtapaDialog';
import { useEtapas, useMeuPapel, useVocabulario } from '@/hooks/useEmpresa';
import { FORMAS, ROTULO_TIPO, reais, useAvaliacaoAberta, type FormaFechamento } from '@/hooks/useAgenda';
import { avisoTelefoneMarcado, useMarcarTelefoneEquipe, type Conversa } from '@/hooks/useAtendimento';

// leads, avaliacoes e renovacoes não estão nos tipos gerados do Lovable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const crm = supabase as any;

const CHAVE = 'crm.ficha-aberta';

/**
 * Ficha aberta ou fechada, lembrada neste navegador. Sem escolha guardada, abre em
 * tela larga (1440 px ou mais): em notebook, a conversa ficaria apertada.
 */
export function useFichaAberta(): [boolean, () => void] {
  const [aberta, setAberta] = useState(() => {
    try {
      const guardada = localStorage.getItem(CHAVE);
      if (guardada !== null) return guardada === '1';
    } catch { /* navegador sem armazenamento: vale a largura */ }
    return window.innerWidth >= 1440;
  });
  const alternar = () => setAberta((a) => {
    try { localStorage.setItem(CHAVE, a ? '0' : '1'); } catch { /* sem armazenamento: só nesta tela */ }
    return !a;
  });
  return [aberta, alternar];
}

interface Paciente { id: string; name: string | null; phone: string | null; stage: string; unidade: string | null }
interface Plano { plano: string | null; sessoes: number | null; valor: number | null; quando: string | null; forma: FormaFechamento | null; renovacao: boolean }
interface OutraConversa { id: string; unidade: string | null; status: string; last_message_at: string | null }

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{titulo}</p>
      {children}
    </section>
  );
}

/**
 * Ficha do paciente ao lado da conversa (pacote 2 das telas, 26/11/2026): etapa com
 * "Mudar etapa", próximo horário, plano, as outras conversas da mesma pessoa e as
 * ações que saíram do topo da conversa (ver em Pacientes, telefone da equipe).
 */
export function FichaPaciente({ conversa, nome }: { conversa: Conversa; nome: string }) {
  const navigate = useNavigate();
  const { rotulo, cor } = useEtapas();
  const { data: papel } = useMeuPapel();
  const v = useVocabulario();
  const marcarEquipe = useMarcarTelefoneEquipe();
  const [mudando, setMudando] = useState(false);
  const leadId = conversa.lead_id;
  const fim = conversa.phone.replace(/\D/g, '').slice(-8);

  // Chaves debaixo de "leads" e "avaliacoes": mudar etapa, agendar e fechar plano já
  // invalidam esses prefixos, e a ficha se atualiza sozinha.
  const { data: paciente, isLoading } = useQuery({
    queryKey: ['leads', 'ficha', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await crm.from('leads').select('id, name, phone, stage, unidade').eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Paciente | null;
    },
  });
  const { data: horario } = useAvaliacaoAberta(leadId);
  const { data: plano } = useQuery({
    queryKey: ['avaliacoes', 'ficha-plano', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<Plano | null> => {
      const [fechou, renovou] = await Promise.all([
        crm.from('avaliacoes').select('plano, sessoes, valor_plano, fechamento_em, forma_fechamento')
          .eq('lead_id', leadId).eq('fechou_plano', true).neq('status', 'cancelada')
          .order('fechamento_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
        crm.from('renovacoes').select('plano, sessoes, valor, registrada_em')
          .eq('lead_id', leadId).order('registrada_em', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (fechou.error) throw fechou.error;
      if (renovou.error) throw renovou.error;
      const f = fechou.data ? {
        plano: fechou.data.plano, sessoes: fechou.data.sessoes, valor: fechou.data.valor_plano,
        quando: fechou.data.fechamento_em, forma: fechou.data.forma_fechamento, renovacao: false,
      } : null;
      const r = renovou.data ? {
        plano: renovou.data.plano, sessoes: renovou.data.sessoes, valor: renovou.data.valor,
        quando: renovou.data.registrada_em, forma: null, renovacao: true,
      } : null;
      if (f && r) return (r.quando ?? '') > (f.quando ?? '') ? r : f;
      return f ?? r;
    },
  });
  // A mesma pessoa em outra conversa: pelo cadastro e pelo fim do telefone (com ou sem o 9).
  const { data: outras = [] } = useQuery({
    queryKey: ['conversas', 'ficha-outras', conversa.id, leadId],
    queryFn: async () => {
      const base = () => crm.from('conversations').select('id, unidade, status, last_message_at')
        .neq('id', conversa.id).eq('interna', false)
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(5);
      const [porCadastro, porTelefone] = await Promise.all([
        leadId ? base().eq('lead_id', leadId) : Promise.resolve({ data: [], error: null }),
        fim.length === 8 ? base().like('phone', `%${fim}`) : Promise.resolve({ data: [], error: null }),
      ]);
      if (porCadastro.error) throw porCadastro.error;
      if (porTelefone.error) throw porTelefone.error;
      const juntas = new Map<string, OutraConversa>();
      for (const c of [...porCadastro.data, ...porTelefone.data] as OutraConversa[]) juntas.set(c.id, c);
      return [...juntas.values()].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
    },
  });

  const podeMarcarEquipe = papel === 'admin' || papel === 'manager';
  const marcarComoEquipe = () => {
    if (!confirm(`Marcar ${nome} como telefone da equipe? A conversa ganha a etiqueta Equipe e deixa de contar como paciente.`)) return;
    marcarEquipe.mutate(
      { telefone: conversa.phone, nome: conversa.contact_name },
      {
        onSuccess: (r) => toast.success(avisoTelefoneMarcado(r), { duration: 7000 }),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="p-4 space-y-5 text-sm">
        {!leadId ? (
          <p className="text-muted-foreground">
            Este contato não está no funil. Para agendar e acompanhar, use "Colocar no funil" no topo da conversa.
          </p>
        ) : isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
        ) : paciente ? (
          <>
            <Secao titulo="Etapa">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor(paciente.stage) }} />
                <span className="flex-1 min-w-0 truncate font-medium text-foreground">{rotulo(paciente.stage)}</span>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setMudando(true)}>
                  Mudar etapa
                </Button>
              </div>
              {paciente.unidade && <p className="mt-1 text-xs text-muted-foreground">Unidade {paciente.unidade}</p>}
            </Secao>

            <Secao titulo="Próximo horário">
              {horario ? (
                <p className="text-foreground">
                  {ROTULO_TIPO[horario.tipo ?? 'avaliacao']}: {format(new Date(horario.marcada_para), "EEEE, d/MM 'às' HH:mm", { locale: ptBR })}
                  {horario.unidade && <span className="text-muted-foreground"> · {horario.unidade}</span>}
                </p>
              ) : (
                <p className="text-muted-foreground">Nenhum horário marcado.</p>
              )}
            </Secao>

            <Secao titulo="Plano">
              {plano ? (
                <div className="text-foreground">
                  <p className="font-medium">
                    {plano.renovacao ? 'Renovação' : FORMAS[plano.forma ?? 'plano']?.rotulo ?? 'Plano'}
                    {plano.plano && `: ${plano.plano}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      plano.sessoes ? `${plano.sessoes} sessões` : null,
                      plano.valor ? reais(Number(plano.valor)) : null,
                      plano.quando ? `em ${format(new Date(plano.quando), 'dd/MM/yyyy')}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum plano fechado.</p>
              )}
            </Secao>
          </>
        ) : (
          <p className="text-muted-foreground">Cadastro do paciente não encontrado.</p>
        )}

        <Secao titulo="Outras conversas">
          {outras.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma outra conversa com este número.</p>
          ) : (
            <div className="-mx-2">
              {outras.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/atendimento?conversa=${c.id}`)}
                  className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="flex-1 min-w-0 truncate text-foreground">Unidade {c.unidade ?? '-'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.status === 'resolvida' ? 'Resolvida' : 'Aberta'}
                    {c.last_message_at && ` · ${format(new Date(c.last_message_at), 'dd/MM')}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Secao>

        <Secao titulo="Ações">
          <div className="flex flex-col gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="justify-start"
              onClick={() => navigate(`/leads?q=${encodeURIComponent(conversa.phone.slice(-8))}`)}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver em {v.Leads}
            </Button>
            {podeMarcarEquipe && (
              <Button
                size="sm"
                variant="outline"
                className="justify-start"
                disabled={marcarEquipe.isPending}
                onClick={marcarComoEquipe}
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                É telefone da equipe
              </Button>
            )}
          </div>
        </Secao>
      </div>

      <MudarEtapaDialog
        lead={mudando && paciente ? { id: paciente.id, name: paciente.name || nome, stage: paciente.stage, unidade: paciente.unidade } : null}
        onClose={() => setMudando(false)}
      />
    </aside>
  );
}
