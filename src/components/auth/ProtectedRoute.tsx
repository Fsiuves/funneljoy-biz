import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenantCheck } from '@/hooks/useTenantCheck';
import { useMarca } from '@/hooks/useMarca';
import { useMenu } from '@/hooks/useEmpresa';
import { trocarEmpresa } from '@/hooks/useAtendimento';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireTenant?: boolean;
}

/** Recado para a tela de login, que lê e apaga. */
export const CHAVE_ERRO_LOGIN = 'crm-erro-login';

export function ProtectedRoute({ children, requireTenant = true }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { hasTenant, tenantId, loading: tenantLoading } = useTenantCheck(user, authLoading);
  const { marca } = useMarca();
  const menu = useMenu();
  const location = useLocation();
  const [ajustando, setAjustando] = useState(false);

  // No endereço de uma empresa, quem entra fica nela. Quem tem papel lá e estava
  // em outra (a Dom, por exemplo) troca sozinho; quem não tem, sai com recado.
  const foraDaEmpresaDoEndereco =
    !!marca && isAuthenticated && !tenantLoading && hasTenant !== null && tenantId !== marca.tenantId;

  useEffect(() => {
    if (!foraDaEmpresaDoEndereco || ajustando || !marca) return;
    setAjustando(true);
    (async () => {
      const { data } = await (supabase as any).rpc('my_tenants');
      const temPapel = ((data ?? []) as { tenant_id: string }[]).some((e) => e.tenant_id === marca.tenantId);
      if (temPapel && !(await trocarEmpresa(marca.tenantId))) {
        window.location.reload();
        return;
      }
      try {
        sessionStorage.setItem(CHAVE_ERRO_LOGIN, `Este acesso não é da ${marca.nome}.`);
      } catch {
        // Sem armazenamento a pessoa só não vê o motivo.
      }
      await supabase.auth.signOut();
      setAjustando(false);
    })();
  }, [foraDaEmpresaDoEndereco, ajustando, marca]);

  const loading =
    authLoading ||
    (isAuthenticated && requireTenant && (tenantLoading || menu.carregando)) ||
    foraDaEmpresaDoEndereco ||
    ajustando;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (requireTenant && hasTenant === false && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Tela fora do menu do papel (a recepção abrindo o Dashboard, por exemplo)
  // vai para a tela inicial dele.
  if (requireTenant && !menu.permitido(location.pathname) && menu.permitido(menu.inicio)) {
    return <Navigate to={menu.inicio} replace />;
  }

  return <>{children}</>;
}
