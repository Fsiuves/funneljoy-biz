CREATE OR REPLACE FUNCTION public.set_lead_step_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.leads
  WHERE id = NEW.lead_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_lead_steps_tenant_id ON public.lead_steps;
CREATE TRIGGER set_lead_steps_tenant_id
  BEFORE INSERT OR UPDATE OF lead_id ON public.lead_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_step_tenant_id();

DROP POLICY IF EXISTS "Users can view lead_steps in their tenant" ON public.lead_steps;
DROP POLICY IF EXISTS "Users can insert lead_steps in their tenant" ON public.lead_steps;
DROP POLICY IF EXISTS "Users can update lead_steps in their tenant" ON public.lead_steps;
DROP POLICY IF EXISTS "Users can delete lead_steps in their tenant" ON public.lead_steps;

CREATE POLICY "Users can view lead_steps for their leads"
  ON public.lead_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_steps.lead_id
        AND l.tenant_id = public.get_user_tenant_id(auth.uid())
        AND l.tenant_id = lead_steps.tenant_id
    )
  );

CREATE POLICY "Users can insert lead_steps for their leads"
  ON public.lead_steps FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_steps.lead_id
        AND l.tenant_id = public.get_user_tenant_id(auth.uid())
        AND l.tenant_id = lead_steps.tenant_id
    )
  );

CREATE POLICY "Users can update lead_steps for their leads"
  ON public.lead_steps FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_steps.lead_id
        AND l.tenant_id = public.get_user_tenant_id(auth.uid())
        AND l.tenant_id = lead_steps.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_steps.lead_id
        AND l.tenant_id = public.get_user_tenant_id(auth.uid())
        AND l.tenant_id = lead_steps.tenant_id
    )
  );

CREATE POLICY "Users can delete lead_steps for their leads"
  ON public.lead_steps FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_steps.lead_id
        AND l.tenant_id = public.get_user_tenant_id(auth.uid())
        AND l.tenant_id = lead_steps.tenant_id
    )
  );