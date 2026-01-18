import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTenant } from '@/hooks/useTenant';
import { Loader2, Building2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface CompanySettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Função para formatar CNPJ
const formatCNPJ = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  return numbers
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
};

export function CompanySettingsModal({ open, onOpenChange }: CompanySettingsModalProps) {
  const { tenant, updateTenant, uploadLogo, loading } = useTenant();
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name);
      setCnpj(tenant.cnpj || '');
      setAddress(tenant.address || '');
      setLogoUrl(tenant.logo_url || null);
      setLogoPreview(tenant.logo_url || null);
    }
  }, [tenant]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 2MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    setSaving(true);
    
    let finalLogoUrl = logoUrl;

    // Upload logo if new file selected
    if (logoFile) {
      const { url, error } = await uploadLogo(logoFile, 'company');
      if (error) {
        toast.error('Erro ao fazer upload do logo');
        setSaving(false);
        return;
      }
      finalLogoUrl = url;
    }

    const slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    const { error } = await updateTenant({ 
      name: companyName,
      slug,
      cnpj: cnpj || null,
      address: address || null,
      logo_url: finalLogoUrl,
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Configurações da Empresa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Logo */}
          <div className="space-y-2">
            <Label>Logo da Empresa</Label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-20 h-20 object-contain rounded-lg border bg-muted"
                  />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground mt-1">Upload</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
              <div className="text-sm text-muted-foreground">
                <p>Formatos: JPG, PNG, SVG</p>
                <p>Tamanho máximo: 2MB</p>
              </div>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome da Empresa</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Digite o nome da empresa"
            />
          </div>

          {/* CNPJ */}
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade - UF"
              rows={3}
            />
          </div>

          {/* Slug */}
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
