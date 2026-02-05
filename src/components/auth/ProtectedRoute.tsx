import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenantCheck } from '@/hooks/useTenantCheck';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireTenant?: boolean;
}

export function ProtectedRoute({ children, requireTenant = true }: ProtectedRouteProps) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { hasTenant, loading: tenantLoading } = useTenantCheck();
  const navigate = useNavigate();
  const location = useLocation();

  const loading = authLoading || (isAuthenticated && tenantLoading);

  useEffect(() => {
    if (authLoading) return;

    // Not authenticated -> go to auth
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    // Authenticated but checking tenant
    if (tenantLoading) return;

    // Authenticated but no tenant -> go to onboarding (unless already there)
    if (requireTenant && hasTenant === false && location.pathname !== '/onboarding') {
      navigate('/onboarding');
      return;
    }
  }, [isAuthenticated, authLoading, hasTenant, tenantLoading, requireTenant, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // If tenant is required but not present, don't render
  if (requireTenant && hasTenant === false) {
    return null;
  }

  return <>{children}</>;
}
