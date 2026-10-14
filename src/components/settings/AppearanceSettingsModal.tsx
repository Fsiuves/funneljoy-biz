import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Palette, Check, Upload, X, Loader2, Image, Globe } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { aplicarMarcaDaEmpresa, aplicarTema } from '@/lib/marca';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AppearanceSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Cores gravadas na empresa, em hex. Nulo nas duas é o padrão do sistema.
const TEMAS: { id: string; nome: string; primaria: string | null; destaque: string | null; amostra: [string, string] }[] = [
  { id: 'padrao', nome: 'Padrão (azul e verde-água)', primaria: null, destaque: null, amostra: ['#2662D9', '#20B6AA'] },
  { id: 'preto-amarelo', nome: 'Preto e amarelo', primaria: '#111111', destaque: '#E5E900', amostra: ['#111111', '#E5E900'] },
  { id: 'verde', nome: 'Verde natureza', primaria: '#20B670', destaque: '#20B6AA', amostra: ['#20B670', '#20B6AA'] },
  { id: 'roxo', nome: 'Roxo elegante', primaria: '#A73CDD', destaque: '#DD3CA7', amostra: ['#A73CDD', '#DD3CA7'] },
  { id: 'laranja', nome: 'Laranja energia', primaria: '#F97415', destaque: '#F59F0A', amostra: ['#F97415', '#F59F0A'] },
  { id: 'vermelho', nome: 'Vermelho impacto', primaria: '#DC2828', destaque: '#E8308C', amostra: ['#DC2828', '#E8308C'] },
];

const igual = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').toUpperCase() === (b ?? '').toUpperCase();

export function AppearanceSettingsModal({ open, onOpenChange }: AppearanceSettingsModalProps) {
  const { tenant, updateTenant, uploadLogo, loading } = useTenant();
  const [primaria, setPrimaria] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [systemLogoPreview, setSystemLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [systemLogoFile, setSystemLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const systemLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenant || !open) return;
    setPrimaria(tenant.primary_color ?? null);
    setDestaque(tenant.secondary_color ?? null);
    setSystemLogoPreview(tenant.system_logo_url ?? null);
    setFaviconPreview(tenant.favicon_url ?? null);
    setSystemLogoFile(null);
    setFaviconFile(null);
  }, [tenant, open]);

  const temaEscolhido = TEMAS.find((t) => igual(t.primaria, primaria) && igual(t.destaque, destaque));

  // Prévia na hora; fechar sem salvar volta ao que está gravado.
  const escolher = (p: string | null, d: string | null) => {
    setPrimaria(p);
    setDestaque(d);
    aplicarTema(p || d ? { primaria: p, destaque: d } : null);
  };

  const fechar = (aberto: boolean) => {
    if (!aberto && tenant) aplicarMarcaDaEmpresa(tenant);
    onOpenChange(aberto);
  };

  const handleSystemLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 2MB');
        return;
      }
      setSystemLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSystemLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        toast.error('O ícone deve ter no máximo 500KB');
        return;
      }
      setFaviconFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaviconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeSystemLogo = () => {
    setSystemLogoFile(null);
    setSystemLogoPreview(null);
    if (systemLogoInputRef.current) {
      systemLogoInputRef.current.value = '';
    }
  };

  const removeFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview(null);
    if (faviconInputRef.current) {
      faviconInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);

    let systemLogoUrl = systemLogoPreview ? tenant.system_logo_url || null : null;
    let faviconUrl = faviconPreview ? tenant.favicon_url || null : null;

    if (systemLogoFile) {
      const { url, error } = await uploadLogo(systemLogoFile, 'system');
      if (error) {
        toast.error('Erro ao enviar o logo');
        setSaving(false);
        return;
      }
      systemLogoUrl = url;
    }

    if (faviconFile) {
      const { url, error } = await uploadLogo(faviconFile, 'favicon');
      if (error) {
        toast.error('Erro ao enviar o ícone');
        setSaving(false);
        return;
      }
      faviconUrl = url;
    }

    const mudancas = {
      primary_color: primaria,
      secondary_color: destaque,
      system_logo_url: systemLogoUrl,
      favicon_url: faviconUrl,
    };
    const { error } = await updateTenant(mudancas);

    if (error) {
      toast.error('Só a direção pode mudar a aparência da empresa');
      aplicarMarcaDaEmpresa(tenant);
      setSaving(false);
      return;
    }

    aplicarMarcaDaEmpresa({ ...tenant, ...mudancas });
    toast.success('Aparência atualizada para toda a equipe');
    setSaving(false);
    onOpenChange(false);
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={fechar}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Aparência
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="theme" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="theme">Cores</TabsTrigger>
            <TabsTrigger value="logo">Logo</TabsTrigger>
            <TabsTrigger value="favicon">Ícone</TabsTrigger>
          </TabsList>

          <TabsContent value="theme" className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Vale para toda a equipe. A principal pinta botões e, quando é escura, o menu lateral; o destaque
              marca o item ativo e os avisos.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {TEMAS.map((t) => {
                const ativo = temaEscolhido?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => escolher(t.primaria, t.destaque)}
                    className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${
                      ativo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex shrink-0 overflow-hidden rounded-lg">
                      <span className="w-6 h-10" style={{ background: t.amostra[0] }} />
                      <span className="w-6 h-10" style={{ background: t.amostra[1] }} />
                    </div>
                    <p className="flex-1 text-left font-medium text-foreground">{t.nome}</p>
                    {ativo && <Check className="w-5 h-5 text-primary" />}
                  </button>
                );
              })}
            </div>

            <div
              className={`rounded-xl border-2 p-3 ${
                temaEscolhido ? 'border-border' : 'border-primary bg-primary/5'
              }`}
            >
              <p className="font-medium text-foreground mb-3">Cores próprias</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={primaria ?? '#2662D9'}
                    onChange={(e) => escolher(e.target.value.toUpperCase(), destaque ?? '#20B6AA')}
                    className="h-9 w-12 cursor-pointer rounded border"
                  />
                  Principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={destaque ?? '#20B6AA'}
                    onChange={(e) => escolher(primaria ?? '#2662D9', e.target.value.toUpperCase())}
                    className="h-9 w-12 cursor-pointer rounded border"
                  />
                  Destaque
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logo" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Logo da empresa
              </Label>
              <p className="text-sm text-muted-foreground">
                Aparece no menu lateral e na tela de login. Use a versão clara, com fundo transparente: o
                menu é escuro.
              </p>
              <div className="flex items-center gap-4 mt-4">
                {systemLogoPreview ? (
                  <div className="relative">
                    <img
                      src={systemLogoPreview}
                      alt="Prévia do logo"
                      className="w-32 h-24 object-contain rounded-lg border bg-sidebar p-2"
                    />
                    <button
                      onClick={removeSystemLogo}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => systemLogoInputRef.current?.click()}
                    className="w-32 h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Enviar</span>
                  </div>
                )}
                <input
                  ref={systemLogoInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg"
                  onChange={handleSystemLogoChange}
                  className="hidden"
                />
                <div className="text-sm text-muted-foreground">
                  <p>PNG ou SVG transparente</p>
                  <p>Até 2MB</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="favicon" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Ícone da aba
              </Label>
              <p className="text-sm text-muted-foreground">
                Aparece na aba do navegador
              </p>
              <div className="flex items-center gap-4 mt-4">
                {faviconPreview ? (
                  <div className="relative">
                    <img
                      src={faviconPreview}
                      alt="Prévia do ícone"
                      className="w-16 h-16 object-contain rounded-lg border bg-muted p-2"
                    />
                    <button
                      onClick={removeFavicon}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => faviconInputRef.current?.click()}
                    className="w-16 h-16 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  >
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Enviar</span>
                  </div>
                )}
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/x-icon,image/png,image/ico,.ico"
                  onChange={handleFaviconChange}
                  className="hidden"
                />
                <div className="text-sm text-muted-foreground">
                  <p>ICO ou PNG quadrado</p>
                  <p>Até 500KB</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => fechar(false)}>
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
