-- ============================================================
-- TRAIDgov Analyst - Schema Presupuesto Nacional Argentina
-- Star Schema: 1 fact table + 19 dimension tables
-- ============================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ============================================================
-- DIMENSIONES - Clasificador Económico (padre → hijo)
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_inciso (
    id_unico TEXT PRIMARY KEY,
    inciso_id TEXT NOT NULL,
    inciso_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_principal (
    id_unico TEXT PRIMARY KEY,
    inciso_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    principal_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_parcial (
    id_unico TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    parcial_id TEXT NOT NULL,
    parcial_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_subparcial (
    id_unico TEXT PRIMARY KEY,
    parcial_id TEXT NOT NULL,
    subparcial_id TEXT NOT NULL,
    subparcial_desc TEXT NOT NULL
);

-- ============================================================
-- DIMENSIONES - Estructura Administrativa
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_jurisdiccion (
    id_unico TEXT PRIMARY KEY,
    jurisdiccion_id TEXT NOT NULL,
    jurisdiccion_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_subjurisdiccion (
    id_unico TEXT PRIMARY KEY,
    jurisdiccion_id TEXT NOT NULL,
    subjurisdiccion_id TEXT NOT NULL,
    subjurisdiccion_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_entidad (
    id_unico TEXT PRIMARY KEY,
    subjurisdiccion_id TEXT NOT NULL,
    entidad_id TEXT NOT NULL,
    entidad_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_servicio (
    id_unico TEXT PRIMARY KEY,
    entidad_id TEXT NOT NULL,
    servicio_id TEXT NOT NULL,
    servicio_desc TEXT NOT NULL
);

-- ============================================================
-- DIMENSIONES - Estructura Programática
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_programa (
    id_unico TEXT PRIMARY KEY,
    servicio_id TEXT NOT NULL,
    programa_id TEXT NOT NULL,
    programa_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_subprograma (
    id_unico TEXT PRIMARY KEY,
    programa_id TEXT NOT NULL,
    subprograma_id TEXT NOT NULL,
    subprograma_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_proyecto (
    id_unico TEXT PRIMARY KEY,
    subprograma_id TEXT NOT NULL,
    proyecto_id TEXT NOT NULL,
    proyecto_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_actividad (
    id_unico TEXT PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    actividad_id TEXT NOT NULL,
    actividad_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_obra (
    id_unico TEXT PRIMARY KEY,
    actividad_id TEXT NOT NULL,
    obra_id TEXT NOT NULL,
    obra_desc TEXT NOT NULL
);

-- ============================================================
-- DIMENSIONES - Estructura Funcional
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_finalidad (
    id_unico TEXT PRIMARY KEY,
    finalidad_id TEXT NOT NULL,
    finalidad_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_funcion (
    id_unico TEXT PRIMARY KEY,
    finalidad_id TEXT NOT NULL,
    funcion_id TEXT NOT NULL,
    funcion_desc TEXT NOT NULL
);

-- ============================================================
-- DIMENSIONES - Otras
-- ============================================================

CREATE TABLE IF NOT EXISTS dim_fuente_financiamiento (
    id_unico TEXT PRIMARY KEY,
    fuente_financiamiento_id TEXT NOT NULL,
    fuente_financiamiento_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_ubicacion_geografica (
    id_unico TEXT PRIMARY KEY,
    ubicacion_geografica_id TEXT NOT NULL,
    ubicacion_geografica_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_caracter (
    id_unico TEXT PRIMARY KEY,
    caracter_id TEXT NOT NULL,
    caracter_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_sector (
    id_unico TEXT PRIMARY KEY,
    sector_id TEXT NOT NULL,
    sector_desc TEXT NOT NULL
);

-- ============================================================
-- TABLA DE HECHOS
-- ============================================================

CREATE TABLE IF NOT EXISTS presupuesto_nacion_2024 (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ejercicio_presupuestario INTEGER NOT NULL,

    -- FKs a dimensiones
    jurisdiccion_id TEXT,
    subjurisdiccion_id TEXT,
    entidad_id TEXT,
    servicio_id TEXT,
    programa_id TEXT,
    subprograma_id TEXT,
    proyecto_id TEXT,
    actividad_id TEXT,
    obra_id TEXT,
    inciso_id TEXT,
    principal_id TEXT,
    parcial_id TEXT,
    subparcial_id TEXT,
    finalidad_id TEXT,
    funcion_id TEXT,
    fuente_financiamiento_id TEXT,
    ubicacion_geografica_id TEXT,
    caracter_id TEXT,
    sector_id TEXT,

    -- Métricas financieras (en pesos)
    credito_presupuestado NUMERIC(20, 2) DEFAULT 0,
    credito_vigente NUMERIC(20, 2) DEFAULT 0,
    credito_comprometido NUMERIC(20, 2) DEFAULT 0,
    credito_devengado NUMERIC(20, 2) DEFAULT 0,
    credito_pagado NUMERIC(20, 2) DEFAULT 0,

    -- Metadatos
    ultima_actualizacion_fecha TIMESTAMPTZ DEFAULT NOW(),
    source_file TEXT
);

-- ============================================================
-- ÍNDICES para performance analítica
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_presup_jurisdiccion
    ON presupuesto_nacion_2024 (ejercicio_presupuestario, jurisdiccion_id);

CREATE INDEX IF NOT EXISTS idx_presup_programa
    ON presupuesto_nacion_2024 (programa_id, inciso_id);

CREATE INDEX IF NOT EXISTS idx_presup_funcional
    ON presupuesto_nacion_2024 (finalidad_id, funcion_id);

CREATE INDEX IF NOT EXISTS idx_presup_agg
    ON presupuesto_nacion_2024 (ejercicio_presupuestario, jurisdiccion_id, programa_id, inciso_id);

CREATE INDEX IF NOT EXISTS idx_presup_fuente
    ON presupuesto_nacion_2024 (fuente_financiamiento_id);

CREATE INDEX IF NOT EXISTS idx_presup_ubicacion
    ON presupuesto_nacion_2024 (ubicacion_geografica_id);

-- Full text search en dimensiones
CREATE INDEX IF NOT EXISTS idx_jurisdiccion_trgm
    ON dim_jurisdiccion USING GIN (jurisdiccion_desc gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_programa_trgm
    ON dim_programa USING GIN (programa_desc gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_actividad_trgm
    ON dim_actividad USING GIN (actividad_desc gin_trgm_ops);

-- ============================================================
-- TABLAS AUXILIARES
-- ============================================================

-- Golden Artifacts (cache semántico de visualizaciones validadas)
CREATE TABLE IF NOT EXISTS golden_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_query TEXT NOT NULL,
    sql_query TEXT,
    chart_type TEXT NOT NULL,
    chart_config JSONB NOT NULL,
    result_data JSONB,
    validation_score FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(1536)
);

-- Historial de conversaciones
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FUNCIÓN: execute_readonly_query (CRÍTICA para el tool executeSQL)
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
    -- Validar que sea SELECT
    IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%') THEN
        RAISE EXCEPTION 'Solo queries SELECT permitidas';
    END IF;

    -- Validar que no contenga comandos peligrosos
    IF sql_query ~* '\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC)\b' THEN
        RAISE EXCEPTION 'Query contiene comandos no permitidos';
    END IF;

    -- Ejecutar query y convertir resultado a JSONB
    EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
    INTO result;

    RETURN result;
END;
$$;

-- Dar permiso al rol anon para ejecutar
GRANT EXECUTE ON FUNCTION execute_readonly_query TO anon;
GRANT EXECUTE ON FUNCTION execute_readonly_query TO authenticated;

-- ============================================================
-- FUNCIÓN: match_golden_artifacts (búsqueda semántica)
-- ============================================================

CREATE OR REPLACE FUNCTION match_golden_artifacts(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    user_query TEXT,
    sql_query TEXT,
    chart_config JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        ga.id, ga.user_query, ga.sql_query, ga.chart_config,
        1 - (ga.embedding <=> query_embedding) AS similarity
    FROM golden_artifacts ga
    WHERE 1 - (ga.embedding <=> query_embedding) > match_threshold
    ORDER BY ga.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (datos públicos, solo lectura)
-- ============================================================

ALTER TABLE presupuesto_nacion_2024 ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_jurisdiccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_subjurisdiccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_entidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_subprograma ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_inciso ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_parcial ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_subparcial ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_finalidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_funcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_fuente_financiamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_ubicacion_geografica ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_caracter ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_sector ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas de solo lectura para datos presupuestarios (datos públicos)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'presupuesto_nacion_2024',
        'dim_jurisdiccion', 'dim_subjurisdiccion', 'dim_entidad', 'dim_servicio',
        'dim_programa', 'dim_subprograma', 'dim_proyecto', 'dim_actividad', 'dim_obra',
        'dim_inciso', 'dim_principal', 'dim_parcial', 'dim_subparcial',
        'dim_finalidad', 'dim_funcion',
        'dim_fuente_financiamiento', 'dim_ubicacion_geografica',
        'dim_caracter', 'dim_sector',
        'golden_artifacts', 'chat_sessions'
    ])
    LOOP
        EXECUTE format(
            'CREATE POLICY IF NOT EXISTS "public_read_%s" ON %I FOR SELECT TO anon, authenticated USING (true)',
            tbl, tbl
        );
    END LOOP;
END;
$$;
