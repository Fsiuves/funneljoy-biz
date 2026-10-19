import { useQuery } from '@tanstack/react-query';
import { User } from '@supabase/supabase-js';
import { minhaEmpresaId } from '@/lib/minhaEmpresa';

interface TenantCheckResult {
  hasTenant: boolean | null;
  loading: boolean;
  tenantId: string | null;
}

/**
 * A empresa em uso (a da aba, se a pessoa tem papel nela; senão a do perfil).
 *
 * Fica no cache: cada tela tem o seu ProtectedRoute, e sem cache toda troca de
 * tela perguntava de novo e mostrava a tela de carregando. Falha de rede não é
 * "sem empresa": antes ela mandava para o cadastro de empresa, recarregava a
 * página ou tirava a pessoa do sistema. Agora tenta de novo e segue carregando.
 */
export function useTenantCheck(user: User | null, authLoading: boolean): TenantCheckResult {
  const consulta = useQuery({
    queryKey: ['empresa-em-uso', user?.id],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60_000,
    retry: true,
    retryDelay: (tentativa) => Math.min(1000 * 2 ** tentativa, 10_000),
    queryFn: () => minhaEmpresaId(user!.id),
  });

  if (authLoading) return { hasTenant: null, loading: true, tenantId: null };
  if (!user) return { hasTenant: null, loading: false, tenantId: null };
  if (consulta.data === undefined) return { hasTenant: null, loading: true, tenantId: null };
  return { hasTenant: !!consulta.data, loading: false, tenantId: consulta.data };
}
