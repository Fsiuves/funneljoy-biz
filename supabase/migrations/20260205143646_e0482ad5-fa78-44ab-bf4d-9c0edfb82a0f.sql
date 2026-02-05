-- =====================================================
-- FIX: Activities table RLS - Role-based access control
-- Sales: Only see activities on their own leads
-- Managers/Admins: See all activities in tenant
-- =====================================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view activities in their tenant" ON public.activities;

-- SELECT: Role-based access (linked to lead access)
CREATE POLICY "Users can view activities based on role"
ON public.activities
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    -- Admins and Managers can see all activities in tenant
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    -- Sales can only see activities they created
    created_by = auth.uid() OR
    -- Or activities on leads they have access to
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
      AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
    )
  )
);

-- INSERT: Users can only create activities on leads they have access to
DROP POLICY IF EXISTS "Users can insert activities in their tenant" ON public.activities;

CREATE POLICY "Users can insert activities on accessible leads"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND created_by = auth.uid()
  AND (
    -- Admins and Managers can add activities to any lead
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager') OR
    -- Sales can only add activities to their own leads
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
      AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
    )
  )
);