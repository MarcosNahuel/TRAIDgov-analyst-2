# Instrucciones Completas: Supabase + ETL (CORE v1)

Objetivo: dejar Supabase con el schema CORE (2014-2026) y cargar datos con los scripts de `etl-codex/scripts/`.

## 0) Requisitos

- Proyecto Supabase activo (Postgres 15).
- Acceso al **Service Role Key** (recomendado/obligatorio para ETL).
- Node.js instalado (recomendado: Node 18+).
- En este repo: dependencias instaladas (`npm i`).

## 1) Variables de entorno (ETL)

En la raiz del repo, archivo `.env.local` (ya existe en este proyecto) con:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Notas:
- El ETL usa `SUPABASE_SERVICE_ROLE_KEY` para poder hacer `upsert/insert` aun con RLS habilitado.
- Si corres el ETL con `NEXT_PUBLIC_SUPABASE_ANON_KEY`, lo mas probable es que falle por permisos/RLS.

## 2) Ejecutar el SQL del schema en Supabase

Archivo a ejecutar:
- `etl-codex/sql/01_schema_core.sql`

Pasos en Supabase Dashboard:
1. Entrar a tu proyecto.
2. Ir a **SQL Editor**.
3. Crear un query nuevo.
4. Pegar el contenido completo de `etl-codex/sql/01_schema_core.sql`.
5. Ejecutar.

Que crea este SQL:
- Extensiones: `pg_trgm`, `unaccent`
- Dimensiones (actual + historico por anio)
- `ipc_indice_mensual`
- `fact_credito_devengado_mensual` particionada 2014..2026
- Indices basicos para queries del agente
- RPC `execute_readonly_query` (permite `SELECT` y `WITH`)
- RLS habilitado + policies de lectura publica

## 3) Correr el ETL del core (2014-2026)

Comando:

```bash
npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2014 --to 2026
```

Que hace:
- Descarga `credito-mensual-{ANIO}.zip` por anio (cachea en `etl-codex/data/raw/`).
- Extrae el CSV (en `etl-codex/data/extracted/<anio>/`).
- Parsea el CSV y agrega al grano CORE:
  - `anio, mes, jurisdiccion, servicio, programa, subprograma, inciso, ubicacion`
  - `SUM(credito_devengado)`
- Upsert de:
  - dims actuales (`dim_*`)
  - dims historicas por anio (`dim_*_hist`)
  - fact (`fact_credito_devengado_mensual`) con idempotencia por `row_hash`

Idempotencia / re-ejecucion:
- Se puede correr varias veces: el `upsert` usa `UNIQUE (ejercicio_presupuestario, row_hash)`.
- Si un anio se actualiza en origen (ej. 2026), volver a correr ese rango actualiza los valores agregados.

Nota sobre 2026:
- El dataset 2026 es **parcial** (hasta el momento de publicacion del ZIP). No esperes 12 meses.

## 4) Cargar IPC (para montos reales)

Comando:

```bash
npx tsx etl-codex/scripts/load-ipc.ts
```

Detalles:
- Por defecto usa la serie `145.3_INGNACNAL_DICI_M_15` (IPC nivel general nacional, base dic-2016).
- Esa serie no cubre 2014-2015. Para esos anios, hay que decidir otra serie/metodologia.

## 5) Validaciones post-carga (SQL)

Ejecutar en Supabase SQL Editor.

### 5.1 Conteo por anio
```sql
SELECT ejercicio_presupuestario, COUNT(*) AS filas
FROM fact_credito_devengado_mensual
GROUP BY 1
ORDER BY 1;
```

### 5.2 Serie mensual total (un anio)
```sql
SELECT periodo, SUM(credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual
WHERE ejercicio_presupuestario = 2024
GROUP BY 1
ORDER BY 1;
```

### 5.3 Top incisos (un anio)
```sql
SELECT i.inciso_desc, SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
JOIN dim_inciso i ON i.inciso_id = h.inciso_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

### 5.4 Join a nombres historicos (por anio)
```sql
SELECT
  h.ejercicio_presupuestario,
  COALESCE(jh.jurisdiccion_desc, j.jurisdiccion_desc) AS jurisdiccion_desc,
  SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
LEFT JOIN dim_jurisdiccion_hist jh
  ON jh.jurisdiccion_id = h.jurisdiccion_id
 AND jh.ejercicio_presupuestario = h.ejercicio_presupuestario
LEFT JOIN dim_jurisdiccion j
  ON j.jurisdiccion_id = h.jurisdiccion_id
WHERE h.ejercicio_presupuestario IN (2019, 2024)
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

### 5.5 Deflactar con IPC (si esta cargado)
```sql
WITH base AS (
  SELECT ipc_indice AS ipc_base
  FROM ipc_indice_mensual
  WHERE periodo = DATE '2024-12-01'
)
SELECT
  h.periodo,
  SUM(h.credito_devengado) * (base.ipc_base / ipc.ipc_indice) AS devengado_real_millones
FROM fact_credito_devengado_mensual h
JOIN ipc_indice_mensual ipc ON ipc.periodo = h.periodo
CROSS JOIN base
WHERE h.jurisdiccion_id = '88'
GROUP BY 1, base.ipc_base, ipc.ipc_indice
ORDER BY 1;
```

## 6) Troubleshooting

### 6.1 “permission denied” / RLS
- Asegurate de usar `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.

### 6.2 Timeouts o ETL lento
- Es normal que tarde: el ETL hace `upsert` via API (PostgREST) en batches.
- Corre el backfill fuera de horario.
- Si falla a mitad, re-ejecuta: es idempotente.

### 6.3 Variacion de encoding / separador
- El ETL detecta delimitador por header y reintenta encoding `latin1` si falla `utf8`.

