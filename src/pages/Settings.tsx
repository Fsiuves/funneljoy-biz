import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Building2, Users, Bell, Palette, Shield, Database } from 'lucide-react';
import { CompanySettingsModal } from '@/components/settings/CompanySettingsModal';
import { AppearanceSettingsModal } from '@/components/settings/AppearanceSettingsModal';
import { TeamSettingsModal } from '@/components/settings/TeamSettingsModal';

type ModalType = 'company' | 'team' | 'appearance' | null;

const settingsSections = [
  {
    id: 'company' as const,
    icon: Building2,
    title: 'Empresa',
    description: 'Configure os dados da sua empresa',
    items: ['Nome da empresa', 'Logo', 'Endereço', 'CNPJ'],
    enabled: true,
  },
  {
    id: 'team' as const,
    icon: Users,
    title: 'Equipe',
    description: 'Gerencie usuários e permissões',
    items: ['Adicionar usuário', 'Permissões', 'Funções'],
    enabled: true,
  },
  {
    id: null,
    icon: Bell,
    title: 'Notificações',
    description: 'Configure alertas e lembretes',
    items: ['E-mail', 'Push', 'SMS', 'WhatsApp'],
    enabled: false,
  },
  {
    id: 'appearance' as const,
    icon: Palette,
    title: 'Aparência',
    description: 'Personalize a interface',
    items: ['Tema', 'Cores', 'Logo', 'Favicon'],
    enabled: true,
  },
  {
    id: null,
    icon: Shield,
    title: 'Segurança',
    description: 'Configurações de segurança',
    items: ['Senhas', '2FA', 'Logs de acesso'],
    enabled: false,
  },
  {
    id: null,
    icon: Database,
    title: 'Integrações',
    description: 'Conecte suas ferramentas',
    items: ['WhatsApp', 'E-mail', 'Calendário', 'API'],
    enabled: false,
  },
];

export default function Settings() {
  const [openModal, setOpenModal] = useState<ModalType>(null);

  return (
    <MainLayout>
      <Header 
        title="Configurações" 
        subtitle="Gerencie seu CRM"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingsSections.map((section, index) => (
          <div
            key={section.title}
            onClick={() => section.enabled && section.id && setOpenModal(section.id)}
            className={`bg-card rounded-xl p-6 shadow-card transition-all duration-300 group animate-slide-up ${
              section.enabled 
                ? 'hover:shadow-card-hover cursor-pointer' 
                : 'opacity-60 cursor-not-allowed'
            }`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                section.enabled
                  ? 'bg-primary/10 group-hover:bg-primary/20'
                  : 'bg-muted'
              }`}>
                <section.icon className={`w-6 h-6 ${section.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold transition-colors ${
                    section.enabled 
                      ? 'text-foreground group-hover:text-primary' 
                      : 'text-muted-foreground'
                  }`}>
                    {section.title}
                  </h3>
                  {!section.enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Em breve
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {section.items.map(item => (
                    <span key={item} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* White Label Notice */}
      <div className="mt-8 bg-primary/5 border border-primary/20 rounded-xl p-6 animate-fade-in">
        <h3 className="font-semibold text-foreground mb-2">🏷️ White Label</h3>
        <p className="text-muted-foreground">
          Este CRM é totalmente personalizável. Você pode adicionar sua marca, cores e domínio próprio 
          para oferecer uma experiência única aos seus clientes.
        </p>
      </div>

      {/* Modais */}
      <CompanySettingsModal 
        open={openModal === 'company'} 
        onOpenChange={(open) => setOpenModal(open ? 'company' : null)} 
      />
      <AppearanceSettingsModal 
        open={openModal === 'appearance'} 
        onOpenChange={(open) => setOpenModal(open ? 'appearance' : null)} 
      />
      <TeamSettingsModal 
        open={openModal === 'team'} 
        onOpenChange={(open) => setOpenModal(open ? 'team' : null)} 
      />
    </MainLayout>
  );
}
