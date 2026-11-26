import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MessageCircle, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { formatarTelefone } from '@/components/atendimento/PainelConversa';
import { ehGrupo, useBuscaConversas, useModulosAtivos } from '@/hooks/useAtendimento';
import { useMenu, useVocabulario } from '@/hooks/useEmpresa';
import { EVENTO_BUSCAR, campoDeTexto, janelaAberta } from '@/lib/atalhos';

// leads não está nos tipos gerados do Lovable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const crm = supabase as any;

interface PacienteAchado { id: string; name: string | null; phone: string | null; unidade: string | null }

/** O termo só vai ao servidor quando a pessoa para de digitar. */
function useParouDeDigitar(texto: string, ms = 250) {
  const [valor, setValor] = useState(texto);
  useEffect(() => {
    const t = setTimeout(() => setValor(texto), ms);
    return () => clearTimeout(t);
  }, [texto, ms]);
  return valor;
}

const Tecla = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-6 justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{children}</kbd>
);

/**
 * Ctrl+K (⌘K no Mac) acha paciente ou conversa de qualquer tela, e "?" mostra os
 * atalhos (pacote 2 das telas, 26/11/2026). A conversa abre no Atendimento; o
 * paciente, na lista de Pacientes já filtrada.
 */
export function BuscaRapida() {
  const navigate = useNavigate();
  const v = useVocabulario();
  const menu = useMenu();
  const { data: modulos } = useModulosAtivos();
  const temAtendimento = !!modulos?.has('atendimento') && menu.permitido('/atendimento');
  const vePacientes = menu.permitido('/leads');
  const [aberta, setAberta] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [texto, setTexto] = useState('');
  const termo = useParouDeDigitar(texto).trim();
  const buscar = aberta && termo.length >= 3;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberta((a) => !a);
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !campoDeTexto(e.target) && !janelaAberta()) {
        e.preventDefault();
        setAtalhos(true);
      }
    };
    const peloMenu = () => setAberta(true);
    window.addEventListener('keydown', aoTeclar);
    window.addEventListener(EVENTO_BUSCAR, peloMenu);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener(EVENTO_BUSCAR, peloMenu);
    };
  }, []);

  const { data: conversas = [], isFetching: buscandoConversas } = useBuscaConversas(termo, buscar && temAtendimento);
  const { data: pacientes = [], isFetching: buscandoPacientes } = useQuery({
    queryKey: ['leads', 'busca-rapida', termo],
    enabled: buscar && vePacientes,
    staleTime: 30_000,
    queryFn: async () => {
      const digitos = termo.replace(/\D/g, '');
      const base = crm.from('leads').select('id, name, phone, unidade').order('updated_at', { ascending: false }).limit(8);
      const { data, error } = digitos.length >= 4
        ? await base.like('phone', `%${digitos.slice(-8)}%`)
        : await base.ilike('name', `%${termo.replace(/[%_]/g, '')}%`);
      if (error) throw error;
      return (data ?? []) as PacienteAchado[];
    },
  });
  const buscando = buscandoConversas || buscandoPacientes;
  const deConversa = conversas.filter((c) => !ehGrupo(c.phone)).slice(0, 8);

  const ir = (caminho: string) => {
    setAberta(false);
    setTexto('');
    navigate(caminho);
  };

  return (
    <>
      <Dialog open={aberta} onOpenChange={(a) => { setAberta(a); if (!a) setTexto(''); }}>
        <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-xl">
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <DialogDescription className="sr-only">Nome ou telefone do paciente</DialogDescription>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
            <CommandInput value={texto} onValueChange={setTexto} placeholder="Nome ou telefone do paciente" />
            <CommandList className="max-h-[60vh]">
              {termo.length < 3 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Digite pelo menos 3 letras ou números.</p>
              ) : buscando && deConversa.length === 0 && pacientes.length === 0 ? (
                <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : (
                <CommandEmpty>Nada encontrado para "{termo}".</CommandEmpty>
              )}
              {termo.length >= 3 && deConversa.length > 0 && (
                <CommandGroup heading="Conversas">
                  {deConversa.map((c) => (
                    <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => ir(`/atendimento?conversa=${c.id}`)}>
                      <MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="flex-1 min-w-0 truncate">{c.contact_name || formatarTelefone(c.phone)}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {formatarTelefone(c.phone)}{c.unidade ? ` · ${c.unidade}` : ''}{c.status === 'resolvida' ? ' · resolvida' : ''}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {termo.length >= 3 && pacientes.length > 0 && (
                <CommandGroup heading={v.Leads}>
                  {pacientes.map((p) => {
                    const fim = (p.phone ?? '').replace(/\D/g, '').slice(-8);
                    return (
                      <CommandItem
                        key={p.id}
                        value={`p-${p.id}`}
                        onSelect={() => ir(`/leads?q=${encodeURIComponent(fim.length === 8 ? fim : (p.name ?? termo))}`)}
                      >
                        <User className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="flex-1 min-w-0 truncate">{p.name || formatarTelefone(p.phone ?? '')}</span>
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {p.phone ? formatarTelefone(p.phone) : ''}{p.unidade ? ` · ${p.unidade}` : ''}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={atalhos} onOpenChange={setAtalhos}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atalhos do teclado</DialogTitle>
            <DialogDescription>Valem fora dos campos de texto, menos o Ctrl+K, que vale em qualquer lugar.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
            <dt><Tecla>Ctrl</Tecla> <Tecla>K</Tecla></dt><dd>Buscar paciente ou conversa, de qualquer tela (no Mac, <Tecla>⌘</Tecla> <Tecla>K</Tecla>)</dd>
            {temAtendimento && (
              <>
                <dt><Tecla>J</Tecla> <Tecla>K</Tecla></dt><dd>Próxima e anterior conversa da lista</dd>
                <dt><Tecla>↓</Tecla> <Tecla>↑</Tecla></dt><dd>O mesmo, com a lista de conversas selecionada</dd>
                <dt><Tecla>Esc</Tecla></dt><dd>Fecha a conversa (o rascunho fica guardado)</dd>
                <dt><Tecla>/</Tecla></dt><dd>Respostas prontas, na caixa de mensagem</dd>
                <dt><Tecla>Enter</Tecla></dt><dd>Envia a mensagem (<Tecla>Shift</Tecla> <Tecla>Enter</Tecla> pula linha)</dd>
                <dt><Tecla>Ctrl</Tecla> <Tecla>V</Tecla></dt><dd>Cola um print na conversa</dd>
              </>
            )}
            <dt><Tecla>?</Tecla></dt><dd>Mostra esta lista</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
