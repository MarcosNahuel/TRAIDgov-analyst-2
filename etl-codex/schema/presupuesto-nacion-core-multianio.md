# Schema (CORE) - Credito Devengado Mensual 2014-2026

> Este archivo esta pensado para inyectarse como contexto al agente para generar SQL correcto.
> Modelo: star schema chico (1 fact + dims esenciales + historicos por anio + IPC).

## 1) Tabla de hechos

### `fact_credito_devengado_mensual`

**Grano (una fila):**
`anio + mes + jurisdiccion + servicio + programa + subprograma + inciso + ubicacion`

**Unidad de monto:**
`credito_devengado` esta en **millones de pesos** (no en pesos).

| Columna | Tipo | Descripcion |
|---|---|---|
| `id` | BIGINT | PK surrogate |
| `ejercicio_presupuestario` | INT | Anio fiscal |
| `impacto_presupuestario_mes` | SMALLINT | Mes (1-12) |
| `periodo` | DATE | Primer dia del mes (YYYY-MM-01) |
| `jurisdiccion_id` | TEXT | FK logica a `dim_jurisdiccion` |
| `servicio_id` | TEXT | FK logica a `dim_servicio` |
| `programa_id` | TEXT | Parte de FK a `dim_programa` |
| `subprograma_id` | TEXT | Parte de FK a `dim_subprograma` |
| `inciso_id` | TEXT | FK logica a `dim_inciso` |
| `ubicacion_geografica_id` | TEXT | FK logica a `dim_ubicacion_geografica` |
| `credito_devengado` | NUMERIC | Devengado del mes (millones) agregado al grano CORE |
| `source_file` | TEXT | Ej: `credito-mensual-2024` |
| `loaded_at` | TIMESTAMPTZ | Timestamp de carga |
| `row_hash` | TEXT | Hash deterministico del grano (idempotencia) |

## 2) Dimensiones (actual)

### `dim_jurisdiccion`
- PK: `jurisdiccion_id`
- Columns: `jurisdiccion_id`, `jurisdiccion_desc`
- JOIN: `h.jurisdiccion_id = j.jurisdiccion_id`

### `dim_servicio`
- PK: `servicio_id`
- Columns: `servicio_id`, `servicio_desc`
- JOIN: `h.servicio_id = s.servicio_id`

### `dim_programa`
- PK compuesta: `(servicio_id, programa_id)`
- Columns: `servicio_id`, `programa_id`, `programa_desc`
- JOIN: `h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id`

### `dim_subprograma`
- PK compuesta: `(servicio_id, programa_id, subprograma_id)`
- Columns: `servicio_id`, `programa_id`, `subprograma_id`, `subprograma_desc`
- JOIN:
  - `h.servicio_id = sp.servicio_id`
  - `AND h.programa_id = sp.programa_id`
  - `AND h.subprograma_id = sp.subprograma_id`

### `dim_inciso`
- PK: `inciso_id`
- Columns: `inciso_id`, `inciso_desc`
- JOIN: `h.inciso_id = i.inciso_id`

### `dim_ubicacion_geografica`
- PK: `ubicacion_geografica_id`
- Columns: `ubicacion_geografica_id`, `ubicacion_geografica_desc`
- JOIN: `h.ubicacion_geografica_id = ug.ubicacion_geografica_id`

## 3) Nombres historicos (por anio)

Para narrativa historica, usar `*_hist` (descripcion por anio) con fallback a `dim_*`.

Ejemplo `dim_jurisdiccion_hist`:
- PK: `(jurisdiccion_id, ejercicio_presupuestario)`
- JOIN:
  - `jh.jurisdiccion_id = h.jurisdiccion_id`
  - `AND jh.ejercicio_presupuestario = h.ejercicio_presupuestario`

Tablas:
- `dim_jurisdiccion_hist`
- `dim_servicio_hist`
- `dim_programa_hist`
- `dim_subprograma_hist`
- `dim_inciso_hist`
- `dim_ubicacion_geografica_hist`

## 4) IPC (para montos reales)

### `ipc_indice_mensual`

| Columna | Tipo | Descripcion |
|---|---|---|
| `periodo` | DATE | YYYY-MM-01 |
| `ipc_indice` | NUMERIC | Indice (base segun fuente) |
| `fuente` | TEXT | Ej: `apis.datos.gob.ar (INDEC)` |
| `base` | TEXT | Ej: `dic-2016=100` (depende de la serie) |

**Deflactar a precios constantes de un mes base**:
`monto_real = monto_nominal * (ipc_base / ipc_periodo)`

## 5) Reglas SQL para el agente

1. Filtrar siempre por `ejercicio_presupuestario` cuando sea posible (performance).
2. Para series mensuales, usar `periodo` o (`ejercicio_presupuestario`, `impacto_presupuestario_mes`) y ordenar por tiempo.
3. Para filtros de texto sobre `*_desc`, usar normalizacion:

```sql
WHERE unaccent(lower(j.jurisdiccion_desc)) LIKE '%' || unaccent(lower('educacion')) || '%'
```

4. Para joins de programa/subprograma, usar las keys compuestas (incluyendo `servicio_id`).
5. Montos estan en **millones**: para “pesos”, multiplicar por 1_000_000.

## 6) Queries ejemplo

### 6.1 Devengado total por anio
```sql
SELECT
  ejercicio_presupuestario,
  SUM(credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual
GROUP BY 1
ORDER BY 1;
```

### 6.2 Top incisos (un anio)
```sql
SELECT
  i.inciso_desc,
  SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
JOIN dim_inciso i ON i.inciso_id = h.inciso_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

### 6.3 Serie mensual (nominal) para una jurisdiccion
```sql
SELECT
  h.periodo,
  SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
WHERE h.ejercicio_presupuestario IN (2023, 2024)
  AND h.jurisdiccion_id = '88'
GROUP BY 1
ORDER BY 1;
```

### 6.4 Serie mensual a precios constantes (requiere IPC)
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

