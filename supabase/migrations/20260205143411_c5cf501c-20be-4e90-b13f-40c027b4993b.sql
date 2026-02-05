-- =====================================================
-- FIX: Leads table RLS - Role-based access control
-- Sales: Only see assigned or created leads
-- Managers/Admins: See all leads in tenant
-- =====================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Users can view leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads in their tenant" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads in their tenant" ON public.leads;

-- SELECT: Role-based access
CREATE POLICY "Users can view leads based on role"
ON public.leads
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    -- Admins and Managers can see all leads in tenant
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    -- Sales can only see their own leads (assigned or created)
    assigned_to = auth.uid() OR
    created_by = auth.uid()
  )
);

-- UPDATE: Role-based access
CREATE POLICY "Users can update leads based on role"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    -- Admins and Managers can update all leads
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    -- Sales can only update their own leads
    assigned_to = auth.uid() OR
    created_by = auth.uid()
  )
);

-- DELETE: Only Admins and Managers can delete
CREATE POLICY "Only admins and managers can delete leads"
ON public.leads
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager')
  )
);