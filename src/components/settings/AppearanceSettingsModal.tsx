import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Palette, Check } from 'lucide-react';

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
  const [selectedTheme, setSelectedTheme] = useState('blue');

  useEffect(() => {
    const saved = localStorage.getItem('crm-theme');
    if (saved) setSelectedTheme(saved);
  }, []);

  const applyTheme = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    document.documentElement.style.setProperty('--primary', theme.primary);
    document.documentElement.style.setProperty('--accent', theme.accent);
    
    localStorage.setItem('crm-theme', themeId);
    setSelectedTheme(themeId);
  };

  const handleSave = () => {
    applyTheme(selectedTheme);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Aparência
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Aplicar Tema
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
