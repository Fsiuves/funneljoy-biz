-- Drop the existing policy that depends on profiles table
DROP POLICY IF EXISTS "Users can create first tenant" ON public.tenants;

-- Create new policy using security definer function (avoids RLS recursion)
CREATE POLICY "Users can create first tenant" ON public.tenants
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND public.get_user_tenant_id(auth.uid()) IS NULL
);