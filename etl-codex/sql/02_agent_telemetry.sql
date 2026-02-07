-- ============================================================
-- TELEMETRIA DEL AGENTE
-- Registra cada interaccion: tiempos, tokens, errores
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_telemetry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT,
  user_query TEXT NOT NULL,

  -- Tiempos (ms)
  t_total_ms INTEGER,
  t_first_token_ms INTEGER,
  t_db_total_ms INTEGER,

  -- Agente
  step_count INTEGER,
  tool_calls JSONB,       -- [{name, latency_ms, success}]
  sql_queries JSONB,      -- [{sql, latency_ms, row_count, warnings}]
  model_id TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,

  -- Resultado
  had_error BOOLEAN DEFAULT false,
  error_message TEXT,
  dashboard_generated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_telemetry" ON agent_telemetry
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "public_read_telemetry" ON agent_telemetry
  FOR SELECT TO anon, authenticated USING (true);
