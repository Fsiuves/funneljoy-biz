
-- 1) Restrict anon insert on leads to tenants with pia_ativo, and limit fields
DROP POLICY IF EXISTS "anon pode inserir leads pia" ON public.leads;

CREATE POLICY "Anon can insert PIA leads for enabled tenants"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (
  source = 'pia'
  AND assigned_to IS NULL
  AND value IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = leads.tenant_id AND t.pia_ativo = true
  )
);

-- 2) Tighten storage policies on logos bucket - scope to tenant folder prefix
DROP POLICY IF EXISTS "Logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;

CREATE POLICY "Users can upload logos in own tenant folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Users can update logos in own tenant folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Users can delete logos in own tenant folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);
