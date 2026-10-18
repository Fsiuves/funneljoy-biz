import { supabase } from '@/integrations/supabase/client';

/** A empresa em uso: a da aba, se a pessoa tem papel nela; senão a do perfil. */
export async function minhaEmpresaId(userId: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('get_user_tenant_id', { _user_id: userId });
  if (error) throw error;
  return (data as string | null) ?? null;
}
