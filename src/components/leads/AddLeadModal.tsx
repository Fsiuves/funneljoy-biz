import { useState, useMemo } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Lead, LeadSource, LEAD_SOURCES } from '@/types/crm';
import { Button } from '@/components/ui/button';

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (lead: {
    name: string;
    email?: string;
    phone: string;
    company?: string;
    source: LeadSource;
    value?: number;
  }) => void;
  isLoading?: boolean;
  existingLeads?: Lead[];
}

// Format phone as (00) 00000-0000
const formatPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
};

// Format value as Brazilian Real (1.234,56)
const formatCurrency = (value: string): string => {
  // Remove everything except digits
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  
  // Convert to number (cents)
  const cents = parseInt(numbers, 10);
  
  // Format with Brazilian locale
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

// Parse formatted currency back to number
const parseCurrency = (formatted: string): number => {
  if (!formatted) return 0;
  // Remove dots (thousands) and replace comma with dot (decimal)
  const normalized = formatted.replace(/\./g, '').replace(',', '.');
  return parseFloat(normalized) || 0;
};

export function AddLeadModal({ isOpen, onClose, onAdd, isLoading, existingLeads = [] }: AddLeadModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'website' as LeadSource,
    value: '',
  });
  const [forceCreate, setForceCreate] = useState(false);

  const norm = (s: string) => s.trim().toLowerCase();
  const phoneDigits = formData.phone.replace(/\D/g, '');

  const phoneDuplicate = useMemo(
    () => (phoneDigits.length >= 8
      ? existingLeads.find((l) => l.phone.replace(/\D/g, '') === phoneDigits)
      : undefined),
    [existingLeads, phoneDigits]
  );

  const nameCompanyMatches = useMemo(() => {
    const n = norm(formData.name);
    const c = norm(formData.company);
    if (n.length < 3 && c.length < 3) return [];
    return existingLeads
      .filter((l) => {
        const ln = norm(l.name || '');
        const lc = norm(l.company || '');
        return (n.length >= 3 && ln.includes(n)) || (c.length >= 3 && lc.includes(c));
      })
      .slice(0, 5);
  }, [existingLeads, formData.name, formData.company]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDuplicate && !forceCreate) return;
    const numericValue = formData.value ? parseCurrency(formData.value) : undefined;
    onAdd({
      ...formData,
      name: formData.name || 'Sem nome',
      email: formData.email || undefined,
      phone: formData.phone.replace(/\D/g, ''), // Send only numbers
      company: formData.company || undefined,
      value: numericValue,
    });
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      source: 'website',
      value: '',
    });
    setForceCreate(false);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, phone: formatPhone(e.target.value) });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, value: formatCurrency(e.target.value) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-lg w-full max-w-lg mx-4 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">Novo Lead</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">
                Nome
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="Nome completo"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                E-mail
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                placeholder="email@exemplo.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Telefone *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={handlePhoneChange}
                className="input-field"
                placeholder="(00) 00000-0000"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Empresa
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="input-field"
                placeholder="Nome da empresa"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Origem *
              </label>
              <select
                required
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as LeadSource })}
                className="input-field"
                disabled={isLoading}
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">
                Valor Estimado (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.value}
                onChange={handleValueChange}
                className="input-field"
                placeholder="0,00"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Duplicate detection */}
          {phoneDuplicate && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-destructive font-medium">
                  Já existe um lead com este telefone: {phoneDuplicate.name}
                  {phoneDuplicate.company ? ` (${phoneDuplicate.company})` : ''}
                </p>
                <label className="flex items-center gap-2 mt-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={forceCreate}
                    onChange={(e) => setForceCreate(e.target.checked)}
                  />
                  Cadastrar mesmo assim
                </label>
              </div>
            </div>
          )}

          {!phoneDuplicate && nameCompanyMatches.length > 0 && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
              <p className="text-foreground font-medium mb-1">
                Possíveis leads já cadastrados:
              </p>
              <ul className="space-y-1">
                {nameCompanyMatches.map((l) => (
                  <li key={l.id} className="text-muted-foreground">
                    • {l.name}{l.company ? ` — ${l.company}` : ''} · {l.phone}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 btn-primary" disabled={isLoading || (!!phoneDuplicate && !forceCreate)}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Adicionar Lead'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
