import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/hooks/useTenant';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface CompanySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanySettingsModal({ open, onOpenChange }: CompanySettingsModalProps) {
  const { tenant, updateTenant, loading } = useTenant();
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name);
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    setSaving(true);
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    const { error } = await updateTenant({ 
      name: companyName,
      slug,
    });

    if (error) {
      toast.error('Erro ao salvar configurações');
    } else {
      toast.success('Configurações salvas com sucesso!');
      onOpenChange(false);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Configurações da Empresa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome da Empresa</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Digite o nome da empresa"
            />
          </div>

          <div className="space-y-2">
            <Label>Slug (URL)</Label>
            <Input
              value={companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Gerado automaticamente a partir do nome
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
