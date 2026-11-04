import { useEffect, useState } from 'react';
import { useConfig, useOrigens, useVocabulario } from '@/hooks/useEmpresa';
import { X, Loader2 } from 'lucide-react';
import { Lead, LeadSource } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { cpfValido, formatarCpf } from '@/lib/cpf';

interface EditLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onSave: (data: {
    id: string;
    name: string;
    email?: string | null;
    phone: string;
    company?: string | null;
    source: LeadSource;
    value?: number | null;
    cpf?: string | null;
    endereco?: string | null;
  }) => void;
  isLoading?: boolean;
}

// Celular com o 55 na frente (o que vem do WhatsApp) mantém o 55: cortar em 11
// dígitos estragava o número ao editar o paciente.
const formatPhone = (v: string) => {
  let n = v.replace(/\D/g, '');
  const ddi = n.length > 11 && n.startsWith('55') ? '+55 ' : '';
  if (ddi) n = n.slice(2);
  n = n.slice(0, 11);
  if (n.length <= 2) return ddi + n;
  if (n.length <= 7) return `${ddi}(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `${ddi}(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};
const formatCurrency = (v: string) => {
  const n = v.replace(/\D/g, '');
  if (!n) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseInt(n, 10) / 100);
};
const parseCurrency = (v: string) => {
  if (!v) return 0;
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
};
const currencyFromNumber = (n?: number) =>
  n ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '';

export function EditLeadModal({ isOpen, onClose, lead, onSave, isLoading }: EditLeadModalProps) {
  const v = useVocabulario();
  // Escondidos na clínica; o que já estava gravado continua salvo ao editar.
  const campos = useConfig().config.formulario;
  const comEmpresa = campos?.empresa !== false;
  const comValor = campos?.valor !== false;
  const comCpf = campos?.cpf === true;
  const comEndereco = campos?.endereco === true;
  const origens = useOrigens();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', source: 'website' as LeadSource, value: '', cpf: '', endereco: '',
  });

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name || '',
        email: lead.email || '',
        phone: formatPhone(lead.phone || ''),
        company: lead.company || '',
        source: lead.source,
        value: currencyFromNumber(lead.value),
        cpf: formatarCpf(lead.cpf || ''),
        endereco: lead.endereco || '',
      });
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: lead.id,
      name: form.name || 'Sem nome',
      email: form.email || null,
      phone: form.phone.replace(/\D/g, ''),
      company: form.company || null,
      source: form.source,
      value: form.value ? parseCurrency(form.value) : null,
      ...(comCpf ? { cpf: form.cpf.replace(/\D/g, '') || null } : {}),
      ...(comEndereco ? { endereco: form.endereco.trim() || null } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-lg w-full max-w-lg mx-4 animate-scale-in">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Editar {v.lead}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Nome</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Telefone *</label>
              <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} className="input-field" disabled={isLoading} />
            </div>
            {comCpf && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">CPF <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input type="text" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })} className="input-field" placeholder="000.000.000-00" disabled={isLoading} />
              {form.cpf && !cpfValido(form.cpf) && <p className="mt-1 text-xs text-amber-700">CPF a conferir: os números não fecham.</p>}
            </div>
            )}
            {comEndereco && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Endereço <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input type="text" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="input-field" placeholder="Rua, número, bairro" disabled={isLoading} />
            </div>
            )}
            {comEmpresa && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Empresa</label>
              <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input-field" disabled={isLoading} />
            </div>
            )}
            <div className={comEmpresa ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium text-foreground mb-2">Origem *</label>
              <select required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })} className="input-field" disabled={isLoading}>
                {origens.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {comValor && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Valor Estimado (R$)</label>
              <input type="text" inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: formatCurrency(e.target.value) })} className="input-field" placeholder="0,00" disabled={isLoading} />
            </div>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isLoading}>Cancelar</Button>
            <Button type="submit" className="flex-1 btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}