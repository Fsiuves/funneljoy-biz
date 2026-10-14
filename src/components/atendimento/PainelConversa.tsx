import { Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  CheckCircle2, RotateCcw, Send, Zap, Loader2, UserPlus, ExternalLink,
  Image as ImageIcon, Mic, Video, FileText, MapPin, Contact, Smile, PhoneOff, CalendarPlus, CalendarCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAgendarAvaliacao, useAvaliacaoAberta } from '@/hooks/useAgenda';
import { useMeuPapel } from '@/hooks/useEmpresa';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  abrirMidia, avisoTelefoneMarcado, momentoMensagem, preencherResposta, useMarcarTelefoneEquipe,
  useAtualizarConversa, useEnviarMensagem, useMensagens, useRespostasProntas,
  type Conversa, type Mensagem, type Pessoa,
} from '@/hooks/useAtendimento';

// ---------------------------------------------------------------- formato

export function formatarTelefone(digitos: string): string {
  const d = (digitos ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length - 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return d ? `+${d}` : '';
}

export function rotuloHora(iso: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (isToday(data)) return format(data, 'HH:mm');
  if (isYesterday(data)) return 'Ontem';
  if (differenceInCalendarDays(new Date(), data) < 7) return format(data, 'EEE', { locale: ptBR });
  return format(data, 'dd/MM');
}

export function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '#';
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function rotuloDia(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

// ---------------------------------------------------------------- mídia

const MIDIAS: Record<string, { rotulo: string; icone: typeof ImageIcon }> = {
  imageMessage: { rotulo: 'Imagem', icone: ImageIcon },
  stickerMessage: { rotulo: 'Figurinha', icone: Smile },
  audioMessage: { rotulo: 'Áudio', icone: Mic },
  videoMessage: { rotulo: 'Vídeo', icone: Video },
  documentMessage: { rotulo: 'Documento', icone: FileText },
  locationMessage: { rotulo: 'Localização', icone: MapPin },
  contactMessage: { rotulo: 'Contato', icone: Contact },
  contactsArrayMessage: { rotulo: 'Contatos', icone: Contact },
};

const BAIXAVEIS = new Set(['imageMessage', 'stickerMessage', 'audioMessage', 'videoMessage', 'documentMessage']);

function MidiaSobDemanda({ m, deMim }: { m: Mensagem; deMim: boolean }) {
  const tipo = MIDIAS[m.message_type ?? ''];
  const [estado, setEstado] = useState<'fechada' | 'carregando' | 'aberta' | 'erro'>('fechada');
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>('');

  if (!tipo) return null;
  const Icone = tipo.icone;

  const abrir = async () => {
    setEstado('carregando');
    const r = await abrirMidia(m.id);
    if (r.erro || !r.url) {
      setEstado('erro');
      return;
    }
    setUrl(r.url);
    setMime(r.mimetype ?? '');
    setEstado('aberta');
  };

  if (estado === 'aberta' && url) {
    if (mime.startsWith('image/'))
      return (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={tipo.rotulo} className="max-h-72 rounded-lg mb-1" />
        </a>
      );
    if (mime.startsWith('audio/')) return <audio controls src={url} className="max-w-[260px] mb-1" />;
    if (mime.startsWith('video/')) return <video controls src={url} className="max-h-72 rounded-lg mb-1" />;
    return (
      <a href={url} download={`arquivo-${m.id.slice(0, 8)}`} className="underline text-sm mb-1 inline-block">
        Baixar {tipo.rotulo.toLowerCase()}
      </a>
    );
  }

  const baixavel = BAIXAVEIS.has(m.message_type ?? '') && !!m.evolution_message_id;
  return (
    <button
      type="button"
      disabled={!baixavel || estado === 'carregando'}
      onClick={abrir}
      className={`flex items-center gap-2 text-sm mb-1 rounded-lg px-2.5 py-1.5 ${
        deMim ? 'bg-primary-foreground/15' : 'bg-muted'
      } ${baixavel ? 'hover:opacity-80' : 'cursor-default'}`}
    >
      {estado === 'carregando' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icone className="w-4 h-4" />}
      <span>
        {estado === 'erro' ? `${tipo.rotulo} indisponível` : baixavel ? `Abrir ${tipo.rotulo.toLowerCase()}` : tipo.rotulo}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- balão

function Balao({ m, autor }: { m: Mensagem; autor: string | null }) {
  const deMim = m.is_from_me;
  const texto = m.body && m.body !== '[mídia]' ? m.body : null;
  const transcricao = m.message_type === 'audioMessage' && texto;
  const reacao = m.message_type === 'reactionMessage';

  if (reacao) return null;

  return (
    <div className={`flex ${deMim ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          deMim
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-card text-foreground border border-border rounded-bl-md'
        }`}
      >
        <MidiaSobDemanda m={m} deMim={deMim} />
        {texto && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {transcricao && <span className="opacity-70 italic">Transcrição: </span>}
            {texto}
          </p>
        )}
        <p className={`text-[11px] mt-1 text-right ${deMim ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
          {autor && <>{autor} · </>}
          {format(new Date(momentoMensagem(m)), 'HH:mm')}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- caixa de texto

function CaixaDeTexto({ conversa, eu }: { conversa: Conversa; eu: Pessoa | undefined }) {
  const [texto, setTexto] = useState('');
  const [listaAberta, setListaAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const enviar = useEnviarMensagem();
  const { data: respostas = [] } = useRespostasProntas();

  // Rascunho some ao trocar de conversa.
  useEffect(() => {
    setTexto('');
    setListaAberta(false);
  }, [conversa.id]);

  const daUnidade = useMemo(
    () => respostas.filter((r) => !r.unidade || r.unidade === conversa.unidade),
    [respostas, conversa.unidade],
  );

  // "/" no começo da caixa abre a lista, e o que vem depois filtra pelo atalho.
  const barra = /^\/(\S*)$/.exec(texto);
  const sugestoes = barra
    ? daUnidade.filter((r) => r.atalho.startsWith(barra[1].toLowerCase()))
    : listaAberta
      ? daUnidade
      : [];

  useEffect(() => setIndice(0), [texto, listaAberta]);

  const escolher = (textoResposta: string) => {
    setTexto(
      preencherResposta(textoResposta, {
        nome: conversa.contact_name,
        unidade: conversa.unidade,
        atendente: eu?.name,
      }),
    );
    setListaAberta(false);
    requestAnimationFrame(() => campo.current?.focus());
  };

  const mandar = () => {
    const corpo = texto.trim();
    if (!corpo || enviar.isPending) return;
    enviar.mutate(
      { conversationId: conversa.id, texto: corpo },
      {
        onSuccess: () => setTexto(''),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Falha ao enviar'),
      },
    );
  };

  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugestoes.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => (i + 1) % sugestoes.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => (i - 1 + sugestoes.length) % sugestoes.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(sugestoes[indice].texto); return; }
      if (e.key === 'Escape') { e.preventDefault(); setListaAberta(false); if (barra) setTexto(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      mandar();
    }
  };

  return (
    <div className="relative border-t border-border bg-card px-4 py-3">
      {sugestoes.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-20">
          <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Respostas prontas
          </p>
          {sugestoes.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); escolher(r.texto); }}
              onMouseEnter={() => setIndice(i)}
              className={`w-full text-left px-3 py-2 ${i === indice ? 'bg-muted' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">/{r.atalho}</span>
                {r.unidade && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">{r.unidade}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.texto}</p>
            </button>
          ))}
        </div>
      )}

      {barra && sugestoes.length === 0 && (
        <p className="absolute bottom-full left-4 mb-2 text-xs text-muted-foreground bg-popover border rounded-lg px-3 py-2 shadow">
          {daUnidade.length === 0
            ? 'Nenhuma resposta pronta cadastrada. Crie em Configurações.'
            : 'Nenhum atalho começa assim.'}
        </p>
      )}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          title="Respostas prontas"
          onClick={() => setListaAberta((v) => !v)}
        >
          <Zap className="w-5 h-5" />
        </Button>
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
          rows={Math.min(6, Math.max(1, texto.split('\n').length))}
          placeholder="Escreva a mensagem. Digite / para as respostas prontas."
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="button" onClick={mandar} disabled={!texto.trim() || enviar.isPending} className="shrink-0 h-10">
          {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Enter envia · Shift+Enter quebra linha · sai pelo WhatsApp da unidade {conversa.unidade}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- painel

const SEM_RESPONSAVEL = '__ninguem__';

interface PainelConversaProps {
  conversa: Conversa;
  equipe: Pessoa[];
  eu: Pessoa | undefined;
}

export function PainelConversa({ conversa, equipe, eu }: PainelConversaProps) {
  const navigate = useNavigate();
  const atualizar = useAtualizarConversa();
  const { data: mensagens = [], isLoading } = useMensagens(conversa);
  const fim = useRef<HTMLDivElement>(null);

  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.name || p.email])), [equipe]);
  const { data: papel } = useMeuPapel();
  const marcarEquipe = useMarcarTelefoneEquipe();

  // Agendar a avaliação sai da própria conversa: o paciente vai para "Agendou"
  // e entra na Agenda do dia (crm.agendar_avaliacao).
  const { data: avaliacaoAberta } = useAvaliacaoAberta(conversa.interna ? null : conversa.lead_id);
  const agendar = useAgendarAvaliacao();
  const [agendaAberta, setAgendaAberta] = useState(false);
  const [diaAv, setDiaAv] = useState('');
  const [horaAv, setHoraAv] = useState('');
  const abrirAgenda = (aberta: boolean) => {
    setAgendaAberta(aberta);
    if (!aberta) return;
    const base = avaliacaoAberta ? new Date(avaliacaoAberta.marcada_para) : null;
    setDiaAv(format(base ?? new Date(), 'yyyy-MM-dd'));
    setHoraAv(base ? format(base, 'HH:mm') : '');
  };
  const salvarAgenda = () => {
    if (!diaAv || !horaAv || !conversa.lead_id) {
      toast.error('Escolha o dia e a hora');
      return;
    }
    const quando = new Date(`${diaAv}T${horaAv}`);
    agendar.mutate(
      { leadId: conversa.lead_id, quando },
      {
        onSuccess: () => {
          toast.success(`Avaliação marcada para ${format(quando, "EEEE, d/MM 'às' HH:mm", { locale: ptBR })}`);
          setAgendaAberta(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  // Na lista, só as atendentes da unidade da conversa: direção, gerente e quem
  // dá suporte não recebem conversa por aqui. Quem já é responsável sem ser
  // atendente (a gerente que clicou em Assumir) continua aparecendo como atual.
  const atendentes = equipe.filter(
    (p) => p.ativo !== false && p.role === 'atendente' && p.unidade === conversa.unidade,
  );
  // Quem não está na equipe visível (suporte oculto) aparece como "Equipe".
  const responsavelDeFora = conversa.assigned_to && !atendentes.some((p) => p.id === conversa.assigned_to)
    ? equipe.find((p) => p.id === conversa.assigned_to)
      ?? { id: conversa.assigned_to, name: 'Equipe', email: '', unidade: null }
    : undefined;
  const podemAssumir = responsavelDeFora ? [...atendentes, responsavelDeFora] : atendentes;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length, conversa.id]);

  const nome = conversa.contact_name || formatarTelefone(conversa.phone);
  const resolvida = conversa.status === 'resolvida';

  const mudar = (campos: Parameters<typeof atualizar.mutate>[0]) =>
    atualizar.mutate(campos, { onError: () => toast.error('Não foi possível salvar') });

  const autorDe = (m: Mensagem): string | null => {
    if (!m.is_from_me) return null;
    if (m.sent_by) return nomes.get(m.sent_by)?.split(' ')[0] ?? 'Equipe';
    return 'pelo celular';
  };

  let diaAnterior = '';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-semibold text-primary">{iniciais(nome)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground truncate">{nome}</p>
            <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
              {conversa.unidade}
            </span>
            {conversa.interna && (
              <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Equipe</span>
            )}
            {resolvida && (
              <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">Resolvida</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatarTelefone(conversa.phone)}</p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={conversa.assigned_to ?? SEM_RESPONSAVEL}
            onValueChange={(v) => mudar({ id: conversa.id, assigned_to: v === SEM_RESPONSAVEL ? null : v })}
          >
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
              {podemAssumir.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Abaixo de 1536px só o ícone: com o texto, o nome da pessoa sumia em "M..." numa tela de 1280. */}
          {eu && conversa.assigned_to !== eu.id && (
            <Button size="sm" variant="outline" title="Assumir" onClick={() => mudar({ id: conversa.id, assigned_to: eu.id })}>
              <UserPlus className="w-4 h-4 2xl:mr-1" />
              <span className="hidden 2xl:inline">Assumir</span>
            </Button>
          )}

          <Button
            size="sm"
            variant={resolvida ? 'outline' : 'default'}
            title={resolvida ? 'Reabrir' : 'Resolver'}
            onClick={() => mudar({ id: conversa.id, status: resolvida ? 'aberta' : 'resolvida', unread_count: 0 })}
          >
            {resolvida
              ? <><RotateCcw className="w-4 h-4 2xl:mr-1" /><span className="hidden 2xl:inline">Reabrir</span></>
              : <><CheckCircle2 className="w-4 h-4 2xl:mr-1" /><span className="hidden 2xl:inline">Resolver</span></>}
          </Button>

          {!conversa.interna && conversa.lead_id && (
            <Popover open={agendaAberta} onOpenChange={abrirAgenda}>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" title={avaliacaoAberta ? 'Remarcar avaliação' : 'Agendar avaliação'}>
                  <CalendarPlus className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <p className="text-sm font-medium text-foreground">{avaliacaoAberta ? 'Remarcar avaliação' : 'Agendar avaliação'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={diaAv} onChange={(e) => setDiaAv(e.target.value)} className="h-9" />
                  <Input type="time" value={horaAv} onChange={(e) => setHoraAv(e.target.value)} step={300} className="h-9" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {nome} vai para "Agendou avaliação" e aparece na Agenda do dia.
                </p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAgendaAberta(false)}>Cancelar</Button>
                  <Button size="sm" onClick={salvarAgenda} disabled={agendar.isPending}>
                    {agendar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {!conversa.interna && (papel === 'admin' || papel === 'manager') && (
            <Button
              size="icon"
              variant="ghost"
              title="É telefone da equipe (não é paciente)"
              disabled={marcarEquipe.isPending}
              onClick={() => {
                if (!confirm(`Marcar ${nome} como telefone da equipe? A conversa ganha a etiqueta Equipe e deixa de contar como paciente.`)) return;
                marcarEquipe.mutate(
                  { telefone: conversa.phone, nome: conversa.contact_name },
                  {
                    onSuccess: (r) => toast.success(avisoTelefoneMarcado(r), { duration: 7000 }),
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            >
              <PhoneOff className="w-4 h-4" />
            </Button>
          )}

          {!conversa.interna && (
            <Button
              size="icon"
              variant="ghost"
              title="Ver no funil"
              onClick={() => navigate(`/leads?q=${encodeURIComponent(conversa.phone.slice(-8))}`)}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Faixa própria: embaixo do nome não cabe em tela de notebook. */}
      {avaliacaoAberta && (
        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-1.5 text-xs font-medium text-primary">
          <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
          Avaliação marcada: {format(new Date(avaliacaoAberta.marcada_para), "EEEE, d/MM 'às' HH:mm", { locale: ptBR })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-muted/30">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && mensagens.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Sem mensagens nesta conversa.</p>
        )}
        {mensagens.map((m) => {
          const ms = momentoMensagem(m);
          const dia = rotuloDia(ms);
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <Fragment key={m.id}>
              {separador && (
                <div className="flex justify-center py-2">
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-card border text-muted-foreground">{dia}</span>
                </div>
              )}
              <Balao m={m} autor={autorDe(m)} />
            </Fragment>
          );
        })}
        <div ref={fim} />
      </div>

      <CaixaDeTexto conversa={conversa} eu={eu} />
    </div>
  );
}
