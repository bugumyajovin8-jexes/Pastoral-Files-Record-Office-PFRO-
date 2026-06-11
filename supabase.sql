-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.churches (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  location text,
  pastor_id uuid NOT NULL,
  mhazini_email text,
  CONSTRAINT churches_pkey PRIMARY KEY (id),
  CONSTRAINT churches_pastor_id_fkey FOREIGN KEY (pastor_id) REFERENCES auth.users(id)
);
CREATE TABLE public.congregants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text,
  marital_status text,
  age integer,
  residence text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  parental_church text,
  gender text,
  Kanisa ushirika ulipo text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT congregants_pkey PRIMARY KEY (id),
  CONSTRAINT congregants_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id)
);
CREATE TABLE public.contribution_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text,
  CONSTRAINT contribution_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.contributions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  congregant_id uuid NOT NULL,
  church_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['Zaka'::text, 'Sadaka'::text])),
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  contribution_type_id uuid,
  payment_method text,
  CONSTRAINT contributions_pkey PRIMARY KEY (id),
  CONSTRAINT contributions_congregant_id_fkey FOREIGN KEY (congregant_id) REFERENCES public.congregants(id),
  CONSTRAINT contributions_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id),
  CONSTRAINT contributions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id),
  CONSTRAINT contributions_contribution_type_id_fkey FOREIGN KEY (contribution_type_id) REFERENCES public.contribution_types(id)
);
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'mhazini'::text,
  invited_by uuid,
  church_id uuid,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id),
  CONSTRAINT invitations_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  role text DEFAULT 'mhazini'::text CHECK (role = ANY (ARRAY['pastor'::text, 'mhazini'::text, 'superadmin'::text, 'mshiriki'::text])),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  full_name text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_churches (
  user_id uuid NOT NULL,
  church_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  role_in_church text DEFAULT 'member'::text,
  CONSTRAINT user_churches_pkey PRIMARY KEY (user_id, church_id),
  CONSTRAINT user_churches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_churches_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id)
);

CREATE TABLE public.licenses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL UNIQUE,
  church_name text,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'suspended'::text])),
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT licenses_pkey PRIMARY KEY (id),
  CONSTRAINT licenses_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS) on licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view license status
CREATE POLICY "Allow authenticated users to view license status" ON public.licenses
  FOR SELECT TO authenticated USING (true);

-- Allow superadmins to fully manage all licenses
CREATE POLICY "Allow superadmins full access on licenses" ON public.licenses
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    )
  );

-- Allow pastors to insert and manage licenses for churches they create
CREATE POLICY "Allow pastors to manage licences for owned churches" ON public.licenses
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.churches
      WHERE churches.id = licenses.church_id AND churches.pastor_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.churches
      WHERE churches.id = licenses.church_id AND churches.pastor_id = auth.uid()
    )
  );

-- Enable Row Level Security (RLS) on user_churches table
ALTER TABLE public.user_churches ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view user_churches mappings they are part of
CREATE POLICY "Allow users to view their own mappings" ON public.user_churches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Allow pastors to manage mappings in user_churches
CREATE POLICY "Allow pastors to manage user_churches" ON public.user_churches
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'pastor'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'pastor'
    )
  );

-- Grant access on licenses table to Supabase client roles
GRANT ALL ON TABLE public.licenses TO postgres;
GRANT ALL ON TABLE public.licenses TO anon;
GRANT ALL ON TABLE public.licenses TO authenticated;
GRANT ALL ON TABLE public.licenses TO service_role;

-- Grant access on user_churches table to Supabase client roles
GRANT ALL ON TABLE public.user_churches TO postgres;
GRANT ALL ON TABLE public.user_churches TO anon;
GRANT ALL ON TABLE public.user_churches TO authenticated;
GRANT ALL ON TABLE public.user_churches TO service_role;
