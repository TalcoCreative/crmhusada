
-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'agent');
CREATE TYPE public.conversation_status AS ENUM ('OPEN', 'PENDING', 'RESOLVED');
CREATE TYPE public.message_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE public.message_type AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'INTERNAL_NOTE');
CREATE TYPE public.message_status AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  whatsapp_number TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============== USER ROLES ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'))
$$;

-- Profile policies
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles policies
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============== AUTO PROFILE TRIGGER ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  -- First user becomes super_admin, rest become agent
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== STAGES ==============
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  order_index INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stages TO authenticated;
GRANT ALL ON public.stages TO service_role;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages_read_auth" ON public.stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "stages_admin_write" ON public.stages FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.stages (name, color, order_index, is_default, is_terminal) VALUES
  ('Baru', '#3b82f6', 1, true, false),
  ('Prospect', '#f59e0b', 2, false, false),
  ('Deal', '#10b981', 3, false, false),
  ('Closed', '#6b7280', 4, false, true),
  ('Lost', '#ef4444', 5, false, true);

-- ============== PRODUCTS ==============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read_auth" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.products (name, description, category) VALUES
  ('Konsultasi Umum', 'Konsultasi medis umum dengan dokter Husada', 'Konsultasi'),
  ('REZUM', 'Tindakan REZUM untuk BPH', 'Tindakan'),
  ('Medical Check Up', 'Paket pemeriksaan kesehatan lengkap', 'MCU');

-- ============== CONTACTS ==============
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT NOT NULL UNIQUE,
  full_name TEXT,
  age INT,
  domicile TEXT,
  chief_complaint TEXT,
  initial_question TEXT,
  current_medications TEXT,
  stage_id UUID REFERENCES public.stages(id),
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  interested_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  chatbot_state TEXT,
  chatbot_data JSONB,
  last_interaction_at TIMESTAMPTZ,
  total_messages INT NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_stage ON public.contacts(stage_id);
CREATE INDEX idx_contacts_assigned ON public.contacts(assigned_agent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_read_auth" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_write_auth" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============== CONVERSATIONS ==============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.conversation_status NOT NULL DEFAULT 'OPEN',
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_replied_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_contact ON public.conversations(contact_id);
CREATE INDEX idx_conv_lastmsg ON public.conversations(last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_read_auth" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "conv_write_auth" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============== MESSAGES ==============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  type public.message_type NOT NULL DEFAULT 'TEXT',
  content TEXT NOT NULL,
  media_url TEXT,
  sent_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fonnte_message_id TEXT UNIQUE,
  status public.message_status NOT NULL DEFAULT 'SENT',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_conv_sent ON public.messages(conversation_id, sent_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_read_auth" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "msg_write_auth" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============== TEMPLATES ==============
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_read_auth" ON public.templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin_write" ON public.templates FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============== SYSTEM SETTINGS ==============
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
-- Read for admins only (contains api keys). Edge functions use service role.
CREATE POLICY "settings_admin_read" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "settings_admin_write" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.system_settings (key, value) VALUES
  ('fonnte_api_key', ''),
  ('fonnte_device', ''),
  ('chatbot_enabled', 'true');

-- ============== ACTIVITY LOGS ==============
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_read_auth" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_insert_auth" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ============== UPDATED_AT TRIGGER ==============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== REALTIME ==============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
