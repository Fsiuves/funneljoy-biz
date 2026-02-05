-- Fix tenants INSERT policy to use schema-qualified function
DROP POLICY IF EXISTS "Users can create first tenant" ON public.tenants;
CREATE POLICY "Users can create first tenant"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.get_user_tenant_id(auth.uid()) IS NULL
);

-- Allow users to always read their own profile (needed for onboarding/tenant checks)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Backend helper: create tenant + upsert profile + assign admin role atomically
CREATE OR REPLACE FUNCTION public.create_my_tenant(_company_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_tenant_id uuid;
  v_slug text;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_existing_tenant_id := public.get_user_tenant_id(v_user_id);
  IF v_existing_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_already_exists';
  END IF;

  IF _company_name IS NULL OR btrim(_company_name) = '' THEN
    RAISE EXCEPTION 'company_name_required';
  END IF;

  v_slug := lower(_company_name);
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+)|(-+$)', '', 'g');
  v_slug := left(v_slug, 40);
  IF v_slug = '' THEN
    v_slug := 'empresa';
  END IF;
  v_slug := v_slug || '-' || substr(md5(random()::text), 1, 8);

  INSERT INTO public.tenants (name, slug)
  VALUES (btrim(_company_name), v_slug)
  RETURNING id INTO v_tenant_id;

  -- Upsert profile
  INSERT INTO public.profiles (id, email, name, tenant_id)
  VALUES (v_user_id, '', NULL, v_tenant_id)
  ON CONFLICT (id)
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  -- Ensure admin role
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant_id, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

-- Allow authenticated users to execute the function
GRANT EXECUTE ON FUNCTION public.create_my_tenant(text) TO authenticated;