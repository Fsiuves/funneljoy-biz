DROP POLICY IF EXISTS "Users can upload logos in own tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update logos in own tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete logos in own tenant folder" ON storage.objects;

CREATE POLICY "Admins can upload logos in own tenant folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.get_user_tenant_id(auth.uid()))::text
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update logos in own tenant folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.get_user_tenant_id(auth.uid()))::text
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete logos in own tenant folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.get_user_tenant_id(auth.uid()))::text
  AND public.has_role(auth.uid(), 'admin')
);