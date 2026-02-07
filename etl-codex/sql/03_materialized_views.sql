-- ============================================================
-- MATERIALIZED VIEWS (pre-agregadas para el agente)
-- Refrescar despues de cada ETL:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_gasto_anual_jurisdiccion;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_serie_mensual;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_gasto_finalidad_funcion;
-- ============================================================

-- MV1: Gasto anual por jurisdiccion (la query mas comun)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_gasto_anual_jurisdiccion AS
SELECT
  h.ejercicio_presupuestario,
  h.jurisdiccion_id,
  j.jurisdiccion_desc,
  SUM(h.credito_devengado) AS devengado,
  SUM(h.credito_vigente) AS vigente,
  COUNT(*) AS filas_fuente
FROM fact_credito_devengado_mensual h
JOIN dim_jurisdiccion j ON j.jurisdiccion_id = h.jurisdiccion_id
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gasto_anual_jur
  ON mv_gasto_anual_jurisdiccion (ejercicio_presupuestario, jurisdiccion_id);

-- MV2: Serie mensual total (para graficos de linea)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_serie_mensual AS
SELECT
  ejercicio_presupuestario,
  impacto_presupuestario_mes,
  periodo,
  SUM(credito_devengado) AS devengado,
  SUM(credito_vigente) AS vigente
FROM fact_credito_devengado_mensual
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_serie_mensual
  ON mv_serie_mensual (ejercicio_presupuestario, impacto_presupuestario_mes);

-- MV3: Gasto por finalidad + funcion (para analisis funcional)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_gasto_finalidad_funcion AS
SELECT
  h.ejercicio_presupuestario,
  h.finalidad_id,
  fi.finalidad_desc,
  h.funcion_id,
  fu.funcion_desc,
  SUM(h.credito_devengado) AS devengado,
  SUM(h.credito_vigente) AS vigente
FROM fact_credito_devengado_mensual h
JOIN dim_finalidad fi ON fi.finalidad_id = h.finalidad_id
JOIN dim_funcion fu ON fu.finalidad_id = h.finalidad_id AND fu.funcion_id = h.funcion_id
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gasto_finalidad
  ON mv_gasto_finalidad_funcion (ejercicio_presupuestario, finalidad_id, funcion_id);
