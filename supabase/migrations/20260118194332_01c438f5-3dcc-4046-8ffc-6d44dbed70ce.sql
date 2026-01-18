-- Permitir que usuários autenticados criem tenants durante o signup
CREATE POLICY "Authenticated users can create tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Após criar o tenant e profile, também precisamos criar o user_role como admin
-- Vamos criar uma função que faz isso automaticamente quando um profile é criado
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o profile tem tenant_id, criar role como admin
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (NEW.id, NEW.tenant_id, 'admin')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para criar role automaticamente
CREATE TRIGGER on_profile_created
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();