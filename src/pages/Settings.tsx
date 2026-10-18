import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Building2, Users, Bell, Palette, Shield, Database, MessageSquareText, PhoneOff, BellRing, Shuffle } from 'lucide-react';
import { CompanySettingsModal } from '@/components/settings/CompanySettingsModal';
import { AppearanceSettingsModal } from '@/components/settings/AppearanceSettingsModal';
import { TeamSettingsModal } from '@/components/settings/TeamSettingsModal';
import { IntegrationSettingsModal } from '@/components/settings/IntegrationSettingsModal';
import { QuickRepliesModal } from '@/components/settings/QuickRepliesModal';
import { TelefonesEquipeModal } from '@/components/settings/TelefonesEquipeModal';
import { AvisosModal } from '@/components/settings/AvisosModal';
import { RegrasAtendimentoModal } from '@/components/settings/RegrasAtendimentoModal';
import { useModulosAtivos } from '@/hooks/useAtendimento';
import { useMeuPapel } from '@/hooks/useEmpresa';
import { useMarca } from '@/hooks/useMarca';

type ModalType = 'company' | 'team' | 'appearance' | 'integrations' | 'quickreplies' | 'internos' | 'avisos' | 'regras' | null;

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
    id: 'integrations' as const,
    icon: Database,
    title: 'Integrações',
    description: 'Conecte suas ferramentas',
    items: ['WhatsApp', 'E-mail', 'Calendário', 'API'],
    enabled: true,
  },
  {
    id: 'quickreplies' as const,
    icon: MessageSquareText,
    title: 'Respostas prontas',
    description: 'Textos do atendimento, chamados com /atalho',
    items: ['Endereço', 'Valores', 'Horários', 'Por unidade'],
    enabled: true,
    modulo: 'atendimento',
  },
  {
    id: 'internos' as const,
    icon: PhoneOff,
    title: 'Telefones da equipe',
    description: 'Números dos sócios e da equipe: não viram paciente',
    items: ['Sócios', 'Equipe', 'Recepção'],
    enabled: true,
    modulo: 'atendimento',
  },
  {
    id: 'regras' as const,
    icon: Shuffle,
    title: 'Regras do atendimento',
    description: 'Troca de turno e assinatura com o nome da atendente',
    items: ['Troca de turno', 'Assinatura'],
    enabled: true,
    modulo: 'atendimento',
  },
  {
    id: 'avisos' as const,
    icon: BellRing,
    title: 'Avisos no WhatsApp',
    description: 'Paciente esperando, CRM fechado e o resumo do dia',
    items: ['Espera', 'CRM fechado', 'Resumo do dia'],
    enabled: true,
    modulo: 'atendimento',
  },
];

export default function Settings() {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const { data: modulos } = useModulosAtivos();
  const { data: papel } = useMeuPapel();
  const { marca } = useMarca();
  // Empresa, equipe e aparência só a direção altera (o banco recusa o resto);
  // para as outras funções ficam o número da unidade e as respostas prontas.
  const DO_DIA_A_DIA = ['integrations', 'quickreplies'];
  const secoes = settingsSections.filter(
    (s) =>
      (!('modulo' in s) || modulos?.has((s as { modulo: string }).modulo)) &&
      (papel === 'admin' ||
        (papel === 'manager' && (s.id === 'team' || s.id === 'internos' || s.id === 'avisos' || s.id === 'regras')) ||
        (s.id !== null && DO_DIA_A_DIA.includes(s.id))),
  );

  return (
    <MainLayout>
      <Header 
        title="Configurações" 
        subtitle="Gerencie seu CRM"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {secoes.map((section, index) => (
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

      {/* White Label Notice: no endereço de uma empresa a marca já é dela, e o aviso vira propaganda para a equipe. */}
      {!marca && (
        <div className="mt-8 bg-primary/5 border border-primary/20 rounded-xl p-6 animate-fade-in">
          <h3 className="font-semibold text-foreground mb-2">🏷️ White Label</h3>
          <p className="text-muted-foreground">
            Este CRM é totalmente personalizável. Você pode adicionar sua marca, cores e domínio próprio
            para oferecer uma experiência única aos seus clientes.
          </p>
        </div>
      )}

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
      <QuickRepliesModal
        open={openModal === 'quickreplies'}
        onOpenChange={(open) => setOpenModal(open ? 'quickreplies' : null)}
      />
      <TelefonesEquipeModal
        open={openModal === 'internos'}
        onOpenChange={(open) => setOpenModal(open ? 'internos' : null)}
      />
      <RegrasAtendimentoModal
        open={openModal === 'regras'}
        onOpenChange={(open) => setOpenModal(open ? 'regras' : null)}
      />
      <AvisosModal
        open={openModal === 'avisos'}
        onOpenChange={(open) => setOpenModal(open ? 'avisos' : null)}
      />
      <IntegrationSettingsModal
        open={openModal === 'integrations'}
        onOpenChange={(open) => setOpenModal(open ? 'integrations' : null)}
      />
    </MainLayout>
  );
}
