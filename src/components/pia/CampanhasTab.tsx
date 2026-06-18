import { useState, useEffect } from 'react';
import { Plus, Pause, Play, Trash2, Target, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_PIA_URL = 'https://sjspfkzxyfipuamvbswd.supabase.co';
const SUPABASE_PIA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc3Bma3p4eWZpcHVhbXZic3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODE4MzUsImV4cCI6MjA4NDI1NzgzNX0.UtQNcAlgxuVndCfeay2nRQW9xi4MbblzKGXwXED5xpQ';

const NICHOS_SUGERIDOS = [
  'Clínica odontológica', 'Academia de musculação', 'Salão de beleza',
  'Restaurante', 'Barbearia', 'Clínica estética', 'Pet shop',
  'Farmácia', 'Imobiliária', 'Escritório de advocacia',
  'Clínica veterinária', 'Escola de idiomas', 'Auto elétrica',
  'Oficina mecânica', 'Padaria', 'Clínica de fisioterapia', 'Contabilidade',
];

const CIDADES_BR = [
  'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Salvador',
  'Fortaleza', 'Curitiba', 'Manaus', 'Recife', 'Porto Alegre',
  'Goiânia', 'Campinas', 'São Luís', 'Maceió', 'Natal',
  'Teresina', 'Campo Grande', 'João Pessoa', 'Florianópolis',
];

interface Campanha {
  id: string;
  nicho: string;
  cidade: string;
  status: 'ativo' | 'pausado' | 'concluido';
  data_criacao: string;
}

const piaFetch = async (path: string, opts: RequestInit = {}) => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_PIA_KEY,
    Authorization: `Bearer ${SUPABASE_PIA_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const res = await fetch(`${SUPABASE_PIA_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers as Record<string, string> || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

export function CampanhasTab() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nicho, setNicho] = useState('');
  const [cidade, setCidade] = useState('');
  const [nichoInput, setNichoInput] = useState('');
  const [cidadeInput, setCidadeInput] = useState('');
  const [showNichoList, setShowNichoList] = useState(false);
  const [showCidadeList, setShowCidadeList] = useState(false);
  const { toast } = useToast();

  const carregarCampanhas = async () => {
    try {
      const data = await piaFetch('/campanhas?select=*&order=data_criacao.desc');
      const arr: Campanha[] = data || [];
      setCampanhas(arr);
      await carregarContagens(arr);
    } catch {
      toast({ title: 'Erro ao carregar campanhas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const carregarContagens = async (arr: Campanha[]) => {
    if (!arr.length) { setContagens({}); return; }
    const uniqNichos = Array.from(new Set(arr.map(c => c.nicho)));
    const uniqCidades = Array.from(new Set(arr.map(c => c.cidade)));
    const enc = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
    try {
      const data = await piaFetch(
        `/prospects?select=nicho,cidade&nicho=in.(${uniqNichos.map(enc).join(',')})&cidade=in.(${uniqCidades.map(enc).join(',')})`
      );
      const map: Record<string, number> = {};
      (data || []).forEach((p: { nicho: string; cidade: string }) => {
        const k = `${p.nicho}|${p.cidade}`;
        map[k] = (map[k] || 0) + 1;
      });
      setContagens(map);
    } catch {
      setContagens({});
    }
  };

  useEffect(() => { carregarCampanhas(); }, []);

  const salvar = async () => {
    const n = nicho || nichoInput.trim();
    const c = cidade || cidadeInput.trim();
    if (!n || !c) return toast({ title: 'Preencha nicho e cidade', variant: 'destructive' });
    setSaving(true);
    try {
      await piaFetch('/campanhas', {
        method: 'POST',
        body: JSON.stringify({ nicho: n, cidade: c, status: 'ativo' }),
      });
      toast({ title: `Campanha "${n} — ${c}" criada!` });
      setShowForm(false);
      setNicho(''); setCidade(''); setNichoInput(''); setCidadeInput('');
      carregarCampanhas();
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const alterarStatus = async (id: string, novoStatus: string) => {
    try {
      await piaFetch(`/campanhas?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: novoStatus }),
        headers: { Prefer: 'return=minimal' } as any,
      });
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, status: novoStatus as any } : c));
    } catch {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    }
  };

  const deletar = async (id: string) => {
    if (!confirm('Remover esta campanha?')) return;
    try {
      await piaFetch(`/campanhas?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' } as any,
      });
      setCampanhas(prev => prev.filter(c => c.id !== id));
      toast({ title: 'Campanha removida' });
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const filteredNichos = NICHOS_SUGERIDOS.filter(n =>
    n.toLowerCase().includes(nichoInput.toLowerCase()) && nichoInput.length > 0
  );
  const filteredCidades = CIDADES_BR.filter(c =>
    c.toLowerCase().includes(cidadeInput.toLowerCase()) && cidadeInput.length > 0
  );

  const statusConfig = {
    ativo: { label: 'Ativo', bg: 'bg-success/10 text-success', dot: 'bg-success animate-pulse' },
    pausado: { label: 'Pausado', bg: 'bg-warning/10 text-warning', dot: 'bg-warning' },
    concluido: { label: 'Concluído', bg: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Campanhas de Prospecção</h2>
          <p className="text-sm text-muted-foreground">O P.I.A. busca automaticamente todo dia às 7h</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-card rounded-xl p-8 w-full max-w-md shadow-card-hover">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground">Nova Campanha</h3>
                <p className="text-sm text-muted-foreground">O P.I.A. vai prospectar automaticamente</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground">✕</button>
            </div>

            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-foreground mb-2">Nicho / Segmento</label>
              <input
                value={nichoInput}
                onChange={e => { setNichoInput(e.target.value); setNicho(''); setShowNichoList(true); }}
                onFocus={() => setShowNichoList(true)}
                onBlur={() => setTimeout(() => setShowNichoList(false), 150)}
                placeholder="ex: clínica odontológica, academia..."
                className="input-field w-full"
              />
              {showNichoList && filteredNichos.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg z-10 mt-1 max-h-48 overflow-y-auto shadow-card">
                  {filteredNichos.map(n => (
                    <button key={n}
                      onMouseDown={() => { setNichoInput(n); setNicho(n); setShowNichoList(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6 relative">
              <label className="block text-sm font-medium text-foreground mb-2">Cidade</label>
              <input
                value={cidadeInput}
                onChange={e => { setCidadeInput(e.target.value); setCidade(''); setShowCidadeList(true); }}
                onFocus={() => setShowCidadeList(true)}
                onBlur={() => setTimeout(() => setShowCidadeList(false), 150)}
                placeholder="ex: São Paulo, Belo Horizonte..."
                className="input-field w-full"
              />
              {showCidadeList && filteredCidades.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg z-10 mt-1 max-h-48 overflow-y-auto shadow-card">
                  {filteredCidades.map(c => (
                    <button key={c}
                      onMouseDown={() => { setCidadeInput(c); setCidade(c); setShowCidadeList(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(nicho || nichoInput) && (cidade || cidadeInput) && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-6">
                <p className="text-xs text-primary font-medium mb-1">BUSCA QUE SERÁ EXECUTADA</p>
                <p className="text-sm text-foreground">
                  Google Maps → <strong>"{nicho || nichoInput}"</strong> em <strong>"{cidade || cidadeInput}"</strong>
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <Button onClick={salvar} disabled={saving} className="flex-1 btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓ Criar Campanha'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : campanhas.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma campanha cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1">Crie sua primeira campanha para começar a prospecção</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-primary hover:underline text-sm">
              + Criar primeira campanha
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Nicho</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Cidade</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Prospects</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Criada em</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map(camp => {
                const sc = statusConfig[camp.status] || statusConfig.ativo;
                const count = contagens[`${camp.nicho}|${camp.cidade}`] || 0;
                return (
                  <tr key={camp.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Target className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">{camp.nicho}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        {camp.cidade}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-foreground">
                        {count > 0 ? count : <span className="text-muted-foreground font-normal">—</span>}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${sc.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(camp.data_criacao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => alterarStatus(camp.id, camp.status === 'ativo' ? 'pausado' : 'ativo')}
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title={camp.status === 'ativo' ? 'Pausar' : 'Ativar'}
                        >
                          {camp.status === 'ativo' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deletar(camp.id)}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
