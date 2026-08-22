
-- ── API Integrations table ─────────────────────────────────────────────────
CREATE TABLE public.api_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  api_key       text NOT NULL UNIQUE,
  api_key_prefix text NOT NULL,          -- first 8 chars for display
  permissions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  rate_limit    integer NOT NULL DEFAULT 100,  -- requests/minute
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── API Integration logs table ─────────────────────────────────────────────
CREATE TABLE public.api_integration_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.api_integrations(id) ON DELETE CASCADE,
  endpoint       text NOT NULL,
  method         text NOT NULL DEFAULT 'GET',
  status_code    integer,
  response_time_ms integer,
  ip_address     text,
  request_body   jsonb,
  response_body  jsonb,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_api_integrations_api_key      ON public.api_integrations(api_key);
CREATE INDEX idx_api_integrations_is_active    ON public.api_integrations(is_active);
CREATE INDEX idx_api_integration_logs_int_id   ON public.api_integration_logs(integration_id);
CREATE INDEX idx_api_integration_logs_created  ON public.api_integration_logs(created_at DESC);

-- ── Performance indexes on existing hot tables ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vr_agent_status_processed
  ON public.verification_requests(agent_id, status, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vr_status_created
  ON public.verification_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
  ON public.activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_request_created
  ON public.messages(request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_internal_messages_convo
  ON public.internal_messages(sender_id, receiver_id, created_at DESC);

-- ── Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_api_integration_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_api_integrations_updated_at
  BEFORE UPDATE ON public.api_integrations
  FOR EACH ROW EXECUTE FUNCTION update_api_integration_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.api_integrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_integration_logs ENABLE ROW LEVEL SECURITY;

-- Helper: check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

-- api_integrations: admin only full access
CREATE POLICY "admin_select_integrations"  ON public.api_integrations FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_insert_integrations"  ON public.api_integrations FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_integrations"  ON public.api_integrations FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_integrations"  ON public.api_integrations FOR DELETE USING (public.is_admin());

-- api_integration_logs: admin read, no direct insert (edge function uses service role)
CREATE POLICY "admin_select_int_logs" ON public.api_integration_logs FOR SELECT USING (public.is_admin());

-- ── Realtime ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_integrations;
