import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Building2, Users, Bell, Palette, Shield, Database } from 'lucide-react';

const settingsSections = [
  {
    icon: Building2,
    title: 'Empresa',
    description: 'Configure os dados da sua empresa',
    items: ['Nome da empresa', 'Logo', 'Endereço', 'CNPJ'],
  },
  {
    icon: Users,
    title: 'Equipe',
    description: 'Gerencie usuários e permissões',
    items: ['Adicionar usuário', 'Permissões', 'Funções'],
  },
  {
    icon: Bell,
    title: 'Notificações',
    description: 'Configure alertas e lembretes',
    items: ['E-mail', 'Push', 'SMS', 'WhatsApp'],
  },
  {
    icon: Palette,
    title: 'Aparência',
    description: 'Personalize a interface',
    items: ['Tema', 'Cores', 'Logo', 'Favicon'],
  },
  {
    icon: Shield,
    title: 'Segurança',
    description: 'Configurações de segurança',
    items: ['Senhas', '2FA', 'Logs de acesso'],
  },
  {
    icon: Database,
    title: 'Integrações',
    description: 'Conecte suas ferramentas',
    items: ['WhatsApp', 'E-mail', 'Calendário', 'API'],
  },
];

export default function Settings() {
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
            className="bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 cursor-pointer group animate-slide-up"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <section.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {section.title}
                </h3>
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
    </MainLayout>
  );
}
