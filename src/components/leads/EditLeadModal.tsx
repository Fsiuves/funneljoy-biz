import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Lead, LeadSource, LEAD_SOURCES } from '@/types/crm';
import { Button } from '@/components/ui/button';

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
  }) => void;
  isLoading?: boolean;
}

const formatPhone = (v: string) => {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
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
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', source: 'website' as LeadSource, value: '',
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
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-lg w-full max-w-lg mx-4 animate-scale-in">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Editar Lead</h2>
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
              <label className="block text-sm font-medium text-foreground mb-2">E-mail</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Telefone *</label>
              <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} className="input-field" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Empresa</label>
              <input type="text" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input-field" disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Origem *</label>
              <select required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })} className="input-field" disabled={isLoading}>
                {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Valor Estimado (R$)</label>
              <input type="text" inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: formatCurrency(e.target.value) })} className="input-field" placeholder="0,00" disabled={isLoading} />
            </div>
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