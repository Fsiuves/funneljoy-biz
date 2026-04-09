import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenantCheck } from '@/hooks/useTenantCheck';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireTenant?: boolean;
}

export function ProtectedRoute({ children, requireTenant = true }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { hasTenant, loading: tenantLoading } = useTenantCheck(user, authLoading);
  const location = useLocation();

  const loading = authLoading || (isAuthenticated && requireTenant && tenantLoading);

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

  return <>{children}</>;
}
