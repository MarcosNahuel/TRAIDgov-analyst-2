-- ============================================================
-- ETL CODEX - Schema CORE (2014-2026)
-- Credito Devengado + Vigente Mensual (agregado a grano CORE)
-- Supabase/Postgres 15
-- ============================================================

-- Extensiones utiles (texto / normalizacion)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================================
-- DIMENSIONES (actual)
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_jurisdiccion (
  jurisdiccion_id TEXT PRIMARY KEY,
  jurisdiccion_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_servicio (
  servicio_id TEXT PRIMARY KEY,
  servicio_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_inciso (
  inciso_id TEXT PRIMARY KEY,
  inciso_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_ubicacion_geografica (
  ubicacion_geografica_id TEXT PRIMARY KEY,
  ubicacion_geografica_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_programa (
  servicio_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  programa_desc TEXT NOT NULL,
  PRIMARY KEY (servicio_id, programa_id)
);

CREATE TABLE IF NOT EXISTS dim_subprograma (
  servicio_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  subprograma_id TEXT NOT NULL,
  subprograma_desc TEXT NOT NULL,
  PRIMARY KEY (servicio_id, programa_id, subprograma_id)
);

CREATE TABLE IF NOT EXISTS dim_finalidad (
  finalidad_id TEXT PRIMARY KEY,
  finalidad_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_funcion (
  finalidad_id TEXT NOT NULL,
  funcion_id TEXT NOT NULL,
  funcion_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, funcion_id)
);

CREATE TABLE IF NOT EXISTS dim_fuente_financiamiento (
  fuente_financiamiento_id TEXT PRIMARY KEY,
  fuente_financiamiento_desc TEXT NOT NULL
);

-- ============================================================
-- DIMENSIONES (historico por anio)
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_jurisdiccion_hist (
  jurisdiccion_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  jurisdiccion_desc TEXT NOT NULL,
  PRIMARY KEY (jurisdiccion_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_servicio_hist (
  servicio_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  servicio_desc TEXT NOT NULL,
  PRIMARY KEY (servicio_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_inciso_hist (
  inciso_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  inciso_desc TEXT NOT NULL,
  PRIMARY KEY (inciso_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_ubicacion_geografica_hist (
  ubicacion_geografica_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  ubicacion_geografica_desc TEXT NOT NULL,
  PRIMARY KEY (ubicacion_geografica_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_programa_hist (
  servicio_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  programa_desc TEXT NOT NULL,
  PRIMARY KEY (servicio_id, programa_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_subprograma_hist (
  servicio_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  subprograma_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  subprograma_desc TEXT NOT NULL,
  PRIMARY KEY (servicio_id, programa_id, subprograma_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_finalidad_hist (
  finalidad_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  finalidad_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_funcion_hist (
  finalidad_id TEXT NOT NULL,
  funcion_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  funcion_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, funcion_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_fuente_financiamiento_hist (
  fuente_financiamiento_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  fuente_financiamiento_desc TEXT NOT NULL,
  PRIMARY KEY (fuente_financiamiento_id, ejercicio_presupuestario)
);

-- ============================================================
-- IPC (para deflactar)
-- ============================================================

CREATE TABLE IF NOT EXISTS ipc_indice_mensual (
  periodo DATE PRIMARY KEY,
  ipc_indice NUMERIC(24, 8) NOT NULL,
  fuente TEXT,
  base TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA DE HECHOS (particionada por anio)
-- ============================================================

CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejercicio_presupuestario INTEGER NOT NULL,
  impacto_presupuestario_mes SMALLINT NOT NULL CHECK (impacto_presupuestario_mes BETWEEN 1 AND 12),
  -- Primer dia del mes (para joins con IPC y series)
  periodo DATE GENERATED ALWAYS AS (make_date(ejercicio_presupuestario, impacto_presupuestario_mes, 1)) STORED,

  -- Keys (core)
  jurisdiccion_id TEXT NOT NULL,
  servicio_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  subprograma_id TEXT NOT NULL,
  inciso_id TEXT NOT NULL,
  ubicacion_geografica_id TEXT NOT NULL,
  finalidad_id TEXT NOT NULL DEFAULT '0',
  funcion_id TEXT NOT NULL DEFAULT '0',
  fuente_financiamiento_id TEXT NOT NULL DEFAULT '0',

  -- Metricas (millones de pesos)
  credito_devengado NUMERIC(24, 8) NOT NULL DEFAULT 0,
  credito_vigente NUMERIC(24, 8) NOT NULL DEFAULT 0,

  -- Metadata
  source_file TEXT,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_hash TEXT NOT NULL,

  -- Idempotencia: hash deterministico del grano CORE dentro del anio
  UNIQUE (ejercicio_presupuestario, row_hash)
) PARTITION BY RANGE (ejercicio_presupuestario);

-- Particiones (2014-2026)
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2014
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2014) TO (2015);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2015
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2015) TO (2016);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2016
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2016) TO (2017);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2017
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2017) TO (2018);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2018
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2018) TO (2019);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2019
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2019) TO (2020);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2020
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2020) TO (2021);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2021
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2021) TO (2022);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2022
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2022) TO (2023);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2023
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2023) TO (2024);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2024
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2024) TO (2025);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2025
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2025) TO (2026);
CREATE TABLE IF NOT EXISTS fact_credito_devengado_mensual_2026
  PARTITION OF fact_credito_devengado_mensual FOR VALUES FROM (2026) TO (2027);

-- ============================================================
-- Indices (orientados a patrones del agente)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_fact_time
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, impacto_presupuestario_mes);

CREATE INDEX IF NOT EXISTS idx_fact_periodo
  ON fact_credito_devengado_mensual (periodo);

CREATE INDEX IF NOT EXISTS idx_fact_jur
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, jurisdiccion_id);

CREATE INDEX IF NOT EXISTS idx_fact_servicio
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, servicio_id);

CREATE INDEX IF NOT EXISTS idx_fact_inciso
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, inciso_id);

CREATE INDEX IF NOT EXISTS idx_fact_programa
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, servicio_id, programa_id);

CREATE INDEX IF NOT EXISTS idx_fact_geo
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, ubicacion_geografica_id);

CREATE INDEX IF NOT EXISTS idx_fact_finalidad
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, finalidad_id);

CREATE INDEX IF NOT EXISTS idx_fact_funcion
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, finalidad_id, funcion_id);

CREATE INDEX IF NOT EXISTS idx_fact_fuente
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, fuente_financiamiento_id);

-- Busqueda por texto (si se consulta por desc)
CREATE INDEX IF NOT EXISTS idx_jurisdiccion_trgm
  ON dim_jurisdiccion USING GIN (jurisdiccion_desc gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_servicio_trgm
  ON dim_servicio USING GIN (servicio_desc gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_programa_trgm
  ON dim_programa USING GIN (programa_desc gin_trgm_ops);

-- ============================================================
-- RPC Read-only (tool executeSQL)
-- ============================================================

CREATE OR REPLACE FUNCTION execute_readonly_query(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10000'
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%' OR UPPER(TRIM(sql_query)) LIKE 'WITH%') THEN
    RAISE EXCEPTION 'Solo queries SELECT/WITH permitidas';
  END IF;

  IF sql_query ~* '\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC)\b' THEN
    RAISE EXCEPTION 'Query contiene comandos no permitidos';
  END IF;

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_readonly_query TO anon;
GRANT EXECUTE ON FUNCTION execute_readonly_query TO authenticated;

-- ============================================================
-- GESTION DE CONVERSACIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Nueva conversacion',
  last_insight TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON conversations (updated_at DESC);

-- ============================================================
-- MEMORIA PERMANENTE (cross-session)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'preference',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE fact_credito_devengado_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_jurisdiccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_subprograma ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_inciso ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_ubicacion_geografica ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_finalidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_funcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_fuente_financiamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_jurisdiccion_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_servicio_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_programa_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_subprograma_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_inciso_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_ubicacion_geografica_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_finalidad_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_funcion_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_fuente_financiamiento_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipc_indice_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

-- Policies: lectura publica para datos presupuestarios
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'fact_credito_devengado_mensual',
    'dim_jurisdiccion', 'dim_servicio', 'dim_programa', 'dim_subprograma',
    'dim_inciso', 'dim_ubicacion_geografica',
    'dim_finalidad', 'dim_funcion', 'dim_fuente_financiamiento',
    'dim_jurisdiccion_hist', 'dim_servicio_hist', 'dim_programa_hist', 'dim_subprograma_hist',
    'dim_inciso_hist', 'dim_ubicacion_geografica_hist',
    'dim_finalidad_hist', 'dim_funcion_hist', 'dim_fuente_financiamiento_hist',
    'ipc_indice_mensual'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "public_read_%s" ON %I FOR SELECT TO anon, authenticated USING (true)',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- Policies: lectura/escritura publica para conversaciones y memoria (sin auth)
CREATE POLICY IF NOT EXISTS "public_all_conversations" ON conversations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "public_all_agent_memories" ON agent_memories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
