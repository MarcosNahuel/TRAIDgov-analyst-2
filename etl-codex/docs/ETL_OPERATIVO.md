# ETL Operativo (CORE v1) - Descarga, Carga, Validacion

## Prerrequisitos

- SQL aplicado en Supabase: `etl-codex/sql/01_schema_core.sql`
- `.env.local` en la raiz del repo con:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (recomendado para carga)

## Cargar core (2014-2026)

```bash
npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2014 --to 2026
```

El script:
- descarga ZIP por anio (cachea en `etl-codex/data/raw/`)
- extrae CSV por anio (en `etl-codex/data/extracted/<anio>/`)
- parsea y agrega al grano CORE
- hace upsert de dims + dims historicas + fact

## Cargar IPC

```bash
npx tsx etl-codex/scripts/load-ipc.ts
```

Notas:
- la serie default arranca en 2016-12 (no cubre 2014-2015).
- el endpoint puede no estar actualizado al ultimo mes disponible.

## Validaciones sugeridas (SQL)

### 1) Conteo por anio
```sql
SELECT ejercicio_presupuestario, COUNT(*) AS filas
FROM fact_credito_devengado_mensual
GROUP BY 1
ORDER BY 1;
```

### 2) Conteo por mes (un anio)
```sql
SELECT impacto_presupuestario_mes, COUNT(*) AS filas
FROM fact_credito_devengado_mensual
WHERE ejercicio_presupuestario = 2024
GROUP BY 1
ORDER BY 1;
```

### 3) Total devengado (sanity check)
```sql
SELECT
  ejercicio_presupuestario,
  ROUND(SUM(credito_devengado)::numeric, 2) AS devengado_millones
FROM fact_credito_devengado_mensual
WHERE ejercicio_presupuestario = 2024
GROUP BY 1;
```

### 4) Top incisos (un anio)
```sql
SELECT i.inciso_desc, SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
JOIN dim_inciso i ON i.inciso_id = h.inciso_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

