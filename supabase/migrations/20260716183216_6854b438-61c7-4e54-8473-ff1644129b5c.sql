REVOKE ALL ON FUNCTION public.set_lead_step_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_lead_step_tenant_id() FROM anon;
REVOKE ALL ON FUNCTION public.set_lead_step_tenant_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_lead_step_tenant_id() TO service_role;