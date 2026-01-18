-- Criar tabela tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    address TEXT,
    cnpj TEXT,
    system_logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Criar tabela profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Criar enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales');

-- Criar tabela user_roles (seguindo boas práticas de segurança)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'sales',
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, tenant_id)
);

-- Habilitar RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (security definer para evitar recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para obter role do usuário no tenant
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _tenant_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
    AND tenant_id = _tenant_id
  LIMIT 1
$$;

-- Função para obter tenant_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- Políticas RLS para tenants
CREATE POLICY "Users can view their own tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their own tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()));

-- Políticas RLS para profiles
CREATE POLICY "Users can view profiles in their tenant"
ON public.profiles
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Políticas RLS para user_roles
CREATE POLICY "Users can view roles in their tenant"
ON public.user_roles
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert roles in their tenant"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update roles in their tenant"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete roles in their tenant"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

-- Criar bucket para logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- Políticas para o bucket de logos
CREATE POLICY "Logos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Authenticated users can update logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can delete logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'logos');

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();