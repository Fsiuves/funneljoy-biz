import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { BellRing, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// As funções de avisos não estão nos tipos gerados do Lovable. Ver 21-avisos.sql.
const crm = supabase as any;

interface Config {
  ativo: boolean;
  destinatarios: { nome: string | null; telefone: string }[];
  inicio: string;
  fim: string;
  dias: number[];
  espera_minutos: number;
  resumo_hora: string;
  espera: boolean;
  crm_fechado: boolean;
  resumo: boolean;
}

const DIAS = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom'],
] as const;

const ERROS: Record<string, string> = {
  telefone_invalido: 'Telefone inválido: use DDD e número',
  horario_invalido: 'Confira o horário: o início precisa ser antes do fim',
  espera_invalida: 'A espera precisa ficar entre 5 e 240 minutos',
  not_authorized: 'Só a direção e a gerente mudam os avisos',
  sem_destinatarios: 'Cadastre e salve pelo menos um número antes do teste',
};

const telefoneLegivel = (t: string) => {
  const d = t.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : t;
};

interface AvisosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Avisos no WhatsApp de quem cuida da clínica: paciente esperando demais, CRM
 * fechado com mensagem chegando e o resumo do fim do dia. Saem pelo número da
 * Dom, o mesmo dos alertas do Vigia.
 */
export function AvisosModal({ open, onOpenChange }: AvisosModalProps) {
  const qc = useQueryClient();
  const { data: salvo, isLoading } = useQuery({
    queryKey: ['avisos-config'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await crm.rpc('avisos_config');
      if (error) throw error;
      return data as Config;
    },
  });
  const { data: historico = [] } = useQuery({
    queryKey: ['avisos-historico'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await crm.rpc('avisos_historico');
      if (error) throw error;
      return (data ?? []) as { tipo: string; unidade: string | null; texto: string; enviado_em: string; resultado: any }[];
    },
  });

  const [cfg, setCfg] = useState<Config | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  useEffect(() => { if (salvo) setCfg(salvo); }, [salvo]);

  const salvar = useMutation({
    mutationFn: async (c: Config) => {
      const { data, error } = await crm.rpc('salvar_avisos', { _config: c });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(ERROS[data?.error] ?? data?.error ?? 'Não foi possível salvar');
      return data.config as Config;
    },
    onSuccess: (c) => {
      setCfg(c);
      qc.setQueryData(['avisos-config'], c);
      toast.success(c.ativo ? 'Avisos salvos e ligados' : 'Avisos salvos (desligados)');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('avisos-gestores', { body: { acao: 'teste' } });
      if (error) throw new Error('Não foi possível enviar o teste agora');
      if (data?.error) throw new Error(ERROS[data.error] ?? data.error);
      return data as { ok: boolean; envios: { numero: string; ok: boolean }[] };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['avisos-historico'] });
      if (r.ok) toast.success('Teste enviado. Confira no WhatsApp.');
      else toast.error(`Não chegou em: ${r.envios.filter((e) => !e.ok).map((e) => telefoneLegivel(e.numero)).join(', ')}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!cfg) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <div className="py-10 flex justify-center">{isLoading && <Loader2 className="w-6 h-6 animate-spin text-primary" />}</div>
        </DialogContent>
      </Dialog>
    );
  }

  const mudar = (parte: Partial<Config>) => setCfg({ ...cfg, ...parte });
  const adicionar = () => {
    if (telefone.replace(/\D/g, '').length < 10) {
      toast.error(ERROS.telefone_invalido);
      return;
    }
    mudar({ destinatarios: [...cfg.destinatarios, { nome: nome.trim() || null, telefone }] });
    setNome('');
    setTelefone('');
  };
  const alterado = JSON.stringify(cfg) !== JSON.stringify(salvo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            Avisos no WhatsApp
          </DialogTitle>
          <DialogDescription>
            Para quem cuida da clínica saber na hora quando algo sai do esperado. Os avisos saem por um número à
            parte, não pelo WhatsApp das unidades.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="font-medium text-sm">Avisos ligados</p>
            <p className="text-xs text-muted-foreground">{cfg.ativo ? 'Ligado: os avisos saem como está abaixo.' : 'Desligado: nada é enviado.'}</p>
          </div>
          <Switch checked={cfg.ativo} onCheckedChange={(v) => mudar({ ativo: v })} />
        </div>

        <section className="space-y-2">
          <Label>Quem recebe</Label>
          {cfg.destinatarios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum número ainda.</p>}
          {cfg.destinatarios.map((d, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="flex-1">{d.nome || 'Sem nome'}</span>
              <span className="text-muted-foreground tabular-nums">{telefoneLegivel(d.telefone)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Tirar"
                onClick={() => mudar({ destinatarios: cfg.destinatarios.filter((_, j) => j !== i) })}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="Nome (ex.: Marcello)" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Input placeholder="WhatsApp com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
            <Button variant="outline" onClick={adicionar}><Plus className="w-4 h-4" /></Button>
          </div>
        </section>

        <section className="space-y-3">
          <Label>O que avisar</Label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={cfg.espera} onCheckedChange={(v) => mudar({ espera: !!v })} className="mt-0.5" />
            <span className="flex-1">
              Paciente esperando resposta há mais de
              <Input type="number" min={5} max={240} value={cfg.espera_minutos}
                onChange={(e) => mudar({ espera_minutos: Number(e.target.value) })}
                className="inline-block h-8 w-20 mx-2" />
              minutos <span className="text-muted-foreground">(no máximo um aviso por unidade a cada hora)</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={cfg.crm_fechado} onCheckedChange={(v) => mudar({ crm_fechado: !!v })} className="mt-0.5" />
            <span>Mensagem de paciente chegando e ninguém da recepção com o CRM aberto <span className="text-muted-foreground">(no máximo um a cada duas horas)</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={cfg.resumo} onCheckedChange={(v) => mudar({ resumo: !!v })} className="mt-0.5" />
            <span>
              Resumo do dia às
              <Input type="time" value={cfg.resumo_hora} onChange={(e) => mudar({ resumo_hora: e.target.value })}
                className="inline-block h-8 w-28 mx-2" />
              <span className="text-muted-foreground">: conversas, tempo de resposta, fila, Agenda e quem abriu o CRM</span>
            </span>
          </label>
        </section>

        <section className="space-y-2">
          <Label>Horário de atendimento</Label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            das <Input type="time" value={cfg.inicio} onChange={(e) => mudar({ inicio: e.target.value })} className="h-8 w-28" />
            às <Input type="time" value={cfg.fim} onChange={(e) => mudar({ fim: e.target.value })} className="h-8 w-28" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map(([n, rotulo]) => {
              const ligado = cfg.dias.includes(n);
              return (
                <button key={n} type="button"
                  onClick={() => mudar({ dias: ligado ? cfg.dias.filter((d) => d !== n) : [...cfg.dias, n].sort() })}
                  className={`px-3 py-1 rounded-md text-xs font-medium border ${ligado ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>
                  {rotulo}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Os avisos de espera e de CRM fechado só saem nesse horário; o resumo sai nos dias marcados.
          </p>
        </section>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" disabled={testar.isPending || alterado || !salvo?.destinatarios.length}
            title={alterado ? 'Salve antes de testar' : undefined} onClick={() => testar.mutate()}>
            {testar.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar teste
          </Button>
          <Button disabled={!alterado || salvar.isPending} onClick={() => salvar.mutate(cfg)}>
            {salvar.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </div>

        {historico.length > 0 && (
          <section className="space-y-2 border-t pt-4">
            <Label>Últimos avisos</Label>
            {historico.slice(0, 8).map((h, i) => {
              const falhas = (h.resultado?.envios ?? []).filter((e: any) => !e.ok).length;
              return (
                <div key={i} className="rounded-md border px-3 py-2 text-xs">
                  <div className="flex gap-2 text-muted-foreground mb-1">
                    <span>{format(new Date(h.enviado_em), "dd/MM 'às' HH:mm")}</span>
                    {falhas > 0 && <span className="text-destructive">não chegou em {falhas}</span>}
                  </div>
                  <p className="whitespace-pre-line line-clamp-4">{h.texto.replace(/\*/g, '')}</p>
                </div>
              );
            })}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
