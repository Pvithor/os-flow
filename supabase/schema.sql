-- OS FLOW • Schema PostgreSQL para Supabase (Plano Free)
-- Execute este arquivo no SQL Editor do projeto Supabase antes do primeiro deploy.
-- Todas as tabelas ficam protegidas com RLS (sem policies públicas; acesso exclusivo via service_role no Cloudflare Worker).

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sac',
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (LOWER(username));

CREATE TABLE IF NOT EXISTS public.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window ON public.auth_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS public.operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT '',
  station TEXT NOT NULL DEFAULT 'Equipe Técnica',
  shift TEXT NOT NULL DEFAULT 'TURNO B • POSTO ATIVO',
  shift_goal INTEGER NOT NULL DEFAULT 6
);

CREATE TABLE IF NOT EXISTS public.units (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.work_orders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'in_progress', 'paused', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  completed_at TIMESTAMPTZ,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'SAC',
  assigned_operator_id TEXT,
  assigned_operator_name TEXT,
  assigned_station TEXT,
  completed_by TEXT,
  operator_notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.work_orders(status);

CREATE TABLE IF NOT EXISTS public.alerts (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT,
  order_code TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alerts_order_id ON public.alerts(order_id);

CREATE TABLE IF NOT EXISTS public.notices (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'NÃO INICIADO',
  text TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'SAC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.settings (key, value) VALUES
  ('plantName', 'Planta Sul • Pavilhão 3'),
  ('shiftLabel', 'Tempo de Ciclo Turno 02 • Atualização: 1 seg'),
  ('dailyGoal', '40'),
  ('totalBenches', '8')
ON CONFLICT (key) DO NOTHING;

-- Row Level Security: nega todo acesso público/anon direto pela Data API do Supabase
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Permissões explícitas para service_role (necessário para chaves sb_secret_ no Supabase)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
