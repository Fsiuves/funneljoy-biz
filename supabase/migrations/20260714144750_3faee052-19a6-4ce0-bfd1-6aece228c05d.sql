-- Add notes column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text;

-- Create lead_steps table
CREATE TABLE public.lead_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  message text,
  done_at timestamptz,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, step_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_steps TO authenticated;
GRANT ALL ON public.lead_steps TO service_role;

ALTER TABLE public.lead_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead_steps in their tenant"
  ON public.lead_steps FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert lead_steps in their tenant"
  ON public.lead_steps FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update lead_steps in their tenant"
  ON public.lead_steps FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete lead_steps in their tenant"
  ON public.lead_steps FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_lead_steps_updated_at
  BEFORE UPDATE ON public.lead_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();