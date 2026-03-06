ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.leads DROP CONSTRAINT leads_email_format;
ALTER TABLE public.leads ADD CONSTRAINT leads_email_format CHECK (email IS NULL OR email = '' OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');