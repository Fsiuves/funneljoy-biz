-- Remover política permissiva
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;

-- Criar política mais restritiva: usuário só pode criar tenant se não tiver um ainda
CREATE POLICY "Users can create first tenant"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND tenant_id IS NOT NULL
  )
);