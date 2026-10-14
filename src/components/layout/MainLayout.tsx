import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TrocarSenhaDialog } from '@/components/auth/TrocarSenhaDialog';
import { useAuth } from '@/hooks/useAuth';
import { avisarPresenca } from '@/lib/presenca';

interface MainLayoutProps {
  children: ReactNode;
  /** Sem padding e na altura da tela: para a página de atendimento, que rola por dentro. */
  fullBleed?: boolean;
}

export function MainLayout({ children, fullBleed = false }: MainLayoutProps) {
  const { user } = useAuth();
  // Marcada por quem cadastra e por quem redefine a senha de alguém.
  const senhaProvisoria = user?.user_metadata?.senha_provisoria === true;

  // Logada = CRM aberto, mesmo em segundo plano: a cada minuto o banco fica sabendo.
  useEffect(() => {
    if (!user) return;
    void avisarPresenca();
    const t = window.setInterval(() => void avisarPresenca(), 60_000);
    return () => window.clearInterval(t);
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className={fullBleed ? 'ml-64 h-screen overflow-hidden' : 'ml-64 p-8'}>
        {children}
      </main>
      <TrocarSenhaDialog open={senhaProvisoria} obrigatoria />
    </div>
  );
}
