-- =====================================================
-- SECURITY FIX 1: Activities table UPDATE/DELETE policies
-- Prevents tampering with audit trail - only admins can modify
-- =====================================================

-- Policy: Only admins can update activities (for corrections)
CREATE POLICY "Only admins can update activities"
ON public.activities
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

-- Policy: Only admins can delete activities (preserve audit trail)
CREATE POLICY "Only admins can delete activities"
ON public.activities
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

-- =====================================================
-- SECURITY FIX 2: Input validation constraints
-- Prevents invalid data and potential DoS attacks
-- =====================================================

-- Leads table constraints
ALTER TABLE public.leads 
ADD CONSTRAINT leads_email_format 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE public.leads 
ADD CONSTRAINT leads_phone_format 
CHECK (phone ~* '^[0-9+()\s\-]+$' AND length(phone) >= 8 AND length(phone) <= 20);

ALTER TABLE public.leads 
ADD CONSTRAINT leads_name_length 
CHECK (length(name) >= 2 AND length(name) <= 200);

ALTER TABLE public.leads 
ADD CONSTRAINT leads_company_length 
CHECK (company IS NULL OR length(company) <= 200);

ALTER TABLE public.leads 
ADD CONSTRAINT leads_value_range 
CHECK (value IS NULL OR (value >= 0 AND value <= 999999999.99));

-- Activities table constraints
ALTER TABLE public.activities 
ADD CONSTRAINT activities_description_length 
CHECK (length(description) >= 1 AND length(description) <= 5000);

ALTER TABLE public.activities 
ADD CONSTRAINT activities_type_length 
CHECK (length(type) >= 1 AND length(type) <= 50);

-- =====================================================
-- SECURITY FIX 3: Server-side team member invitation
-- Replaces client-side logic with secure RPC function
-- =====================================================

CREATE OR REPLACE FUNCTION public.invite_team_member(
  _email text,
  _name text,
  _role app_role DEFAULT 'sales'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_tenant_id uuid;
  v_new_user_id uuid;
  v_result json;
BEGIN
  -- Get caller info
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Check caller is admin
  IF NOT public.has_role(v_caller_id, 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Get tenant ID
  v_tenant_id := public.get_user_tenant_id(v_caller_id);
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_tenant');
  END IF;

  -- Validate email format
  IF _email IS NULL OR _email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_email');
  END IF;

  -- Validate name
  IF _name IS NULL OR length(btrim(_name)) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_name');
  END IF;

  -- Validate role
  IF _role NOT IN ('admin', 'manager', 'sales') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_role');
  END IF;

  -- Check if email already exists in profiles for this tenant
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE email = lower(btrim(_email)) AND tenant_id = v_tenant_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'email_already_exists');
  END IF;

  -- Note: This function prepares the invitation record
  -- The actual auth.signUp must still be called client-side
  -- But the role assignment is controlled server-side

  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'email', lower(btrim(_email)),
    'name', btrim(_name),
    'role', _role
  );
END;
$$;

-- Function to complete team member setup after auth.signUp
CREATE OR REPLACE FUNCTION public.complete_team_member_setup(
  _user_id uuid,
  _email text,
  _name text,
  _role app_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Get caller info
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Check caller is admin
  IF NOT public.has_role(v_caller_id, 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Get tenant ID
  v_tenant_id := public.get_user_tenant_id(v_caller_id);
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_tenant');
  END IF;

  -- Create profile for new user
  INSERT INTO public.profiles (id, email, name, tenant_id)
  VALUES (_user_id, lower(btrim(_email)), btrim(_name), v_tenant_id)
  ON CONFLICT (id) DO UPDATE SET 
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name;

  -- Assign role
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, v_tenant_id, _role)
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN json_build_object('success', true, 'user_id', _user_id);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.invite_team_member(text, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_team_member_setup(uuid, text, text, app_role) TO authenticated;