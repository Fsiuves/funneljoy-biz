import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { LeadSource, LEAD_SOURCES } from '@/types/crm';
import { Button } from '@/components/ui/button';

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (lead: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    source: LeadSource;
    value?: number;
  }) => void;
  isLoading?: boolean;
}

export function AddLeadModal({ isOpen, onClose, onAdd, isLoading }: AddLeadModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'website' as LeadSource,
    value: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...formData,
      company: formData.company || undefined,
      value: formData.value ? parseFloat(formData.value) : undefined,
    });
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      source: 'website',
      value: '',
    });
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
                Nome *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="Nome completo"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                E-mail *
              </label>
              <input
                type="email"
                required
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
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="input-field"
                placeholder="0,00"
                min="0"
                step="0.01"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Adicionar Lead'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
