import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Palette, Check, Upload, X, Loader2, Image, Globe } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AppearanceSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const themes = [
  {
    id: 'blue',
    name: 'Azul Profissional',
    primary: '220 70% 50%',
    accent: '175 70% 42%',
    preview: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'green',
    name: 'Verde Natureza',
    primary: '152 70% 42%',
    accent: '175 70% 42%',
    preview: 'from-green-500 to-emerald-500',
  },
  {
    id: 'purple',
    name: 'Roxo Elegante',
    primary: '280 70% 55%',
    accent: '320 70% 55%',
    preview: 'from-purple-500 to-pink-500',
  },
  {
    id: 'orange',
    name: 'Laranja Energia',
    primary: '25 95% 53%',
    accent: '38 92% 50%',
    preview: 'from-orange-500 to-amber-500',
  },
  {
    id: 'red',
    name: 'Vermelho Impacto',
    primary: '0 72% 51%',
    accent: '330 80% 55%',
    preview: 'from-red-500 to-rose-500',
  },
];

export function AppearanceSettingsModal({ open, onOpenChange }: AppearanceSettingsModalProps) {
  const { tenant, updateTenant, uploadLogo, loading } = useTenant();
  const [selectedTheme, setSelectedTheme] = useState('blue');
  const [systemLogoPreview, setSystemLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [systemLogoFile, setSystemLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  
  const systemLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('crm-theme');
    if (saved) setSelectedTheme(saved);
    
    if (tenant) {
      if (tenant.system_logo_url) setSystemLogoPreview(tenant.system_logo_url);
      if (tenant.favicon_url) setFaviconPreview(tenant.favicon_url);
    }
  }, [tenant]);

  const applyTheme = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    document.documentElement.style.setProperty('--primary', theme.primary);
    document.documentElement.style.setProperty('--accent', theme.accent);
    
    localStorage.setItem('crm-theme', themeId);
    setSelectedTheme(themeId);
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
        toast.error('O favicon deve ter no máximo 500KB');
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

  const applyFavicon = (url: string) => {
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = url;
    document.getElementsByTagName('head')[0].appendChild(link);
  };

  const handleSave = async () => {
    setSaving(true);
    
    let systemLogoUrl = tenant?.system_logo_url || null;
    let faviconUrl = tenant?.favicon_url || null;

    // Upload system logo if new file selected
    if (systemLogoFile) {
      const { url, error } = await uploadLogo(systemLogoFile, 'system');
      if (error) {
        toast.error('Erro ao fazer upload do logo');
        setSaving(false);
        return;
      }
      systemLogoUrl = url;
    }

    // Upload favicon if new file selected
    if (faviconFile) {
      const { url, error } = await uploadLogo(faviconFile, 'favicon');
      if (error) {
        toast.error('Erro ao fazer upload do favicon');
        setSaving(false);
        return;
      }
      faviconUrl = url;
      if (url) applyFavicon(url);
    }

    // Apply theme
    applyTheme(selectedTheme);

    // Save to database if tenant exists
    if (tenant) {
      const { error } = await updateTenant({
        system_logo_url: systemLogoUrl,
        favicon_url: faviconUrl,
      });

      if (error) {
        toast.error('Erro ao salvar configurações');
        setSaving(false);
        return;
      }
    }

    toast.success('Aparência atualizada com sucesso!');
    setSaving(false);
    onOpenChange(false);
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
            <Palette className="w-5 h-5 text-primary" />
            Aparência
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="theme" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="theme">Tema</TabsTrigger>
            <TabsTrigger value="logo">Logo</TabsTrigger>
            <TabsTrigger value="favicon">Favicon</TabsTrigger>
          </TabsList>

          <TabsContent value="theme" className="space-y-4 py-4">
            <Label>Escolha um tema de cores</Label>
            <div className="grid grid-cols-1 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    selectedTheme === theme.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${theme.preview}`} />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{theme.name}</p>
                  </div>
                  {selectedTheme === theme.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="logo" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Logo do Sistema
              </Label>
              <p className="text-sm text-muted-foreground">
                Este logo aparece na sidebar e na tela de login
              </p>
              <div className="flex items-center gap-4 mt-4">
                {systemLogoPreview ? (
                  <div className="relative">
                    <img
                      src={systemLogoPreview}
                      alt="System logo preview"
                      className="w-24 h-24 object-contain rounded-lg border bg-muted p-2"
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
                    className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Upload</span>
                  </div>
                )}
                <input
                  ref={systemLogoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSystemLogoChange}
                  className="hidden"
                />
                <div className="text-sm text-muted-foreground">
                  <p>Formatos: JPG, PNG, SVG</p>
                  <p>Tamanho máximo: 2MB</p>
                  <p>Recomendado: 200x200px</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="favicon" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Favicon
              </Label>
              <p className="text-sm text-muted-foreground">
                Ícone que aparece na aba do navegador
              </p>
              <div className="flex items-center gap-4 mt-4">
                {faviconPreview ? (
                  <div className="relative">
                    <img
                      src={faviconPreview}
                      alt="Favicon preview"
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
                    <span className="text-xs text-muted-foreground mt-1">Upload</span>
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
                  <p>Formatos: ICO, PNG</p>
                  <p>Tamanho máximo: 500KB</p>
                  <p>Recomendado: 32x32px ou 64x64px</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
