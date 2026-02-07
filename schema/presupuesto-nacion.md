# Schema: Presupuesto Nacional Argentina (2019-2025)

> Este archivo se inyecta como contexto al LLM.
> Modelo: star schema (1 fact particionada + 9 dims actuales + 9 dims hist + IPC).
> Datos mensuales de presupuestoabierto.gob.ar.

---

## Tabla de Hechos

### `fact_credito_devengado_mensual`

**Grano (una fila):**
`anio + mes + jurisdiccion + servicio + programa + subprograma + inciso + ubicacion + finalidad + funcion + fuente`

**Metricas (millones de pesos):**
- `credito_devengado`: Obligacion de pago real (bien/servicio recibido)
- `credito_vigente`: Presupuesto autorizado (inicial + modificaciones)

**Particionada por `ejercicio_presupuestario`** (2019-2025, ~500K filas/anio).

| Columna | Tipo | Descripcion |
|---|---|---|
| `id` | BIGINT | PK surrogate |
| `ejercicio_presupuestario` | INT | Anio fiscal (2019-2025) |
| `impacto_presupuestario_mes` | SMALLINT | Mes (1-12) |
| `periodo` | DATE | Primer dia del mes (YYYY-MM-01), generado |
| `jurisdiccion_id` | TEXT | FK a `dim_jurisdiccion` |
| `servicio_id` | TEXT | FK a `dim_servicio` |
| `programa_id` | TEXT | Parte de FK a `dim_programa` |
| `subprograma_id` | TEXT | Parte de FK a `dim_subprograma` |
| `inciso_id` | TEXT | FK a `dim_inciso` |
| `ubicacion_geografica_id` | TEXT | FK a `dim_ubicacion_geografica` |
| `finalidad_id` | TEXT | FK a `dim_finalidad` |
| `funcion_id` | TEXT | Parte de FK a `dim_funcion` |
| `fuente_financiamiento_id` | TEXT | FK a `dim_fuente_financiamiento` |
| `credito_devengado` | NUMERIC | Devengado del mes (millones) |
| `credito_vigente` | NUMERIC | Vigente del mes (millones) |
| `source_file` | TEXT | Ej: `credito-mensual-2024` |
| `loaded_at` | TIMESTAMPTZ | Timestamp de carga |
| `row_hash` | TEXT | Hash deterministico del grano (idempotencia) |

### Escala de Montos

Los montos estan en **MILLONES de pesos argentinos**.
- Valores < 1,000: mostrar como "X millones de pesos"
- Valores 1,000-999,999: mostrar como "X.X miles de millones de pesos"
- Valores > 1,000,000: mostrar como "X.X billones de pesos"

---

## Dimensiones Actuales (9)

### dim_jurisdiccion
- PK: `jurisdiccion_id`
- Columnas: `jurisdiccion_id`, `jurisdiccion_desc`
- JOIN: `h.jurisdiccion_id = j.jurisdiccion_id`

### dim_servicio
- PK: `servicio_id`
- Columnas: `servicio_id`, `servicio_desc`
- JOIN: `h.servicio_id = s.servicio_id`

### dim_programa
- PK compuesta: `(servicio_id, programa_id)`
- Columnas: `servicio_id`, `programa_id`, `programa_desc`
- JOIN: `h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id`

### dim_subprograma
- PK compuesta: `(servicio_id, programa_id, subprograma_id)`
- Columnas: `servicio_id`, `programa_id`, `subprograma_id`, `subprograma_desc`
- JOIN: `h.servicio_id = sp.servicio_id AND h.programa_id = sp.programa_id AND h.subprograma_id = sp.subprograma_id`

### dim_inciso
- PK: `inciso_id`
- Columnas: `inciso_id`, `inciso_desc`
- JOIN: `h.inciso_id = i.inciso_id`
- Clasificador economico: 1=Personal, 2=Bienes consumo, 3=Servicios, 4=Bienes uso, 5=Transferencias, 6=Activos financieros, 7=Deuda, 8=Otros

### dim_ubicacion_geografica
- PK: `ubicacion_geografica_id`
- Columnas: `ubicacion_geografica_id`, `ubicacion_geografica_desc`
- JOIN: `h.ubicacion_geografica_id = ug.ubicacion_geografica_id`
- IDs INDEC: 2=CABA, 6=Buenos Aires, 14=Cordoba, etc. Especiales: 96=Interprovincial, 97=Nacional

### dim_finalidad
- PK: `finalidad_id`
- Columnas: `finalidad_id`, `finalidad_desc`
- JOIN: `h.finalidad_id = fi.finalidad_id`
- Valores: 1=Admin Gubernamental, 2=Defensa y Seguridad, 3=Servicios Sociales, 4=Servicios Economicos, 5=Deuda Publica

### dim_funcion
- PK compuesta: `(finalidad_id, funcion_id)`
- Columnas: `finalidad_id`, `funcion_id`, `funcion_desc`
- JOIN: `h.finalidad_id = fu.finalidad_id AND h.funcion_id = fu.funcion_id`
- Funciones clave: 3-1=Salud, 3-2=Promocion Social, 3-3=Seguridad Social (ANSES), 3-4=Educacion y Cultura, 4-1=Energia, 4-3=Transporte

### dim_fuente_financiamiento
- PK: `fuente_financiamiento_id`
- Columnas: `fuente_financiamiento_id`, `fuente_financiamiento_desc`
- JOIN: `h.fuente_financiamiento_id = ff.fuente_financiamiento_id`
- Valores: 1.1=Tesoro Nacional, 1.2=Recursos Propios, 1.3=Afectacion Especifica, 1.4=Transferencias Internas, 1.5=Credito Interno, 2.1=Transferencias Externas, 2.2=Credito Externo

---

## ADVERTENCIA CRITICA: Keys Compuestas

**`programa_id` NO es globalmente unico.**
La clave real de un programa es `servicio_id + programa_id`.

Dimensiones con key compuesta (JOIN obligatorio con TODOS los campos):
- `dim_programa`: `servicio_id + programa_id`
- `dim_subprograma`: `servicio_id + programa_id + subprograma_id`
- `dim_funcion`: `finalidad_id + funcion_id`

Dimensiones simples (JOIN por 1 campo):
- `dim_jurisdiccion`, `dim_servicio`, `dim_inciso`, `dim_ubicacion_geografica`
- `dim_finalidad`, `dim_fuente_financiamiento`

---

## Dimensiones Historicas (por anio)

Para narrativa historica, usar `*_hist` (descripcion valida para ese anio) con fallback a `dim_*` (ultima conocida).

Patron:
```sql
COALESCE(jh.jurisdiccion_desc, j.jurisdiccion_desc) AS jurisdiccion_desc
```

Tablas hist (PK incluye `ejercicio_presupuestario`):
- `dim_jurisdiccion_hist` (jurisdiccion_id, ejercicio_presupuestario)
- `dim_servicio_hist` (servicio_id, ejercicio_presupuestario)
- `dim_programa_hist` (servicio_id, programa_id, ejercicio_presupuestario)
- `dim_subprograma_hist` (servicio_id, programa_id, subprograma_id, ejercicio_presupuestario)
- `dim_inciso_hist` (inciso_id, ejercicio_presupuestario)
- `dim_ubicacion_geografica_hist` (ubicacion_geografica_id, ejercicio_presupuestario)
- `dim_finalidad_hist` (finalidad_id, ejercicio_presupuestario)
- `dim_funcion_hist` (finalidad_id, funcion_id, ejercicio_presupuestario)
- `dim_fuente_financiamiento_hist` (fuente_financiamiento_id, ejercicio_presupuestario)

---

## IPC (para deflactar)

### `ipc_indice_mensual`

| Columna | Tipo | Descripcion |
|---|---|---|
| `periodo` | DATE | YYYY-MM-01 |
| `ipc_indice` | NUMERIC | Indice (base segun fuente) |
| `fuente` | TEXT | Ej: `apis.datos.gob.ar (INDEC)` |
| `base` | TEXT | Ej: `dic-2016=100` |

**Deflactar a precios constantes:**
```sql
monto_real = monto_nominal * (ipc_base / ipc_periodo)
```

---

## Indicadores Derivados

| Indicador | Formula SQL | Significado |
|-----------|-------------|-------------|
| Tasa de ejecucion | `SUM(credito_devengado) / NULLIF(SUM(credito_vigente), 0) * 100` | % del presupuesto ejecutado |
| Subejecucion | `(1 - SUM(credito_devengado) / NULLIF(SUM(credito_vigente), 0)) * 100` | % NO ejecutado (alerta si >30%) |
| Variacion interanual | `(SUM(dev_anio) / NULLIF(SUM(dev_anio_ant), 0) - 1) * 100` | Crecimiento nominal |

---

## Contexto Institucional por Gobierno

### 2019 (Macri)
- ~20 ministerios, estructura original
- Ministerio de Educacion, Cultura, Ciencia y Tecnologia
- Ministerio de Salud y Desarrollo Social
- Ministerio de Transporte

### 2020-2023 (Alberto Fernandez)
- Reestructuracion: se crearon ministerios de Mujeres, Generos y Diversidad; Obras Publicas
- Ministerio de Educacion (independiente)
- Ministerio de Salud (independiente)
- Ministerio de Desarrollo Social (independiente)

### 2024-2025 (Milei)
- DNU 8/2023: de ~20 a 16 jurisdicciones
- **Capital Humano (88)**: absorbe Educacion, Desarrollo Social, Trabajo, Cultura, Mujeres/Genero. Domina con ANSES.
- **Infraestructura (77)**: absorbe Transporte, Obra Publica. Eliminado Decreto 195/2024 (funciones a Economia).
- **Economia (50)**: Energia (subsidios), Agricultura, Industria, Finanzas.
- **Jefatura de Gabinete (25)**: CONICET, ciencia, medios publicos.
- Si preguntan por "Ministerio de Educacion" en 2024+, aclarar que esta en Capital Humano.

---

## Reglas SQL

1. **SIEMPRE filtrar por `ejercicio_presupuestario`** (performance, particiones).
2. **Keys compuestas obligatorias** para programa, subprograma, funcion.
3. **`unaccent(lower(...))`** para filtros de texto sobre `*_desc`.
4. **`NULLIF`** para divisiones (evitar division by zero).
5. **`LIMIT`** para resultados grandes.
6. **Para comparaciones inter-anuales con inflacion:** JOIN `ipc_indice_mensual`.
7. **Solo queries SELECT o WITH** (CTEs). Nunca DROP, INSERT, UPDATE, etc.

---

## Queries Ejemplo

### 1. Total devengado y vigente por anio
```sql
SELECT ejercicio_presupuestario,
       SUM(credito_vigente) AS vigente_millones,
       SUM(credito_devengado) AS devengado_millones,
       ROUND(SUM(credito_devengado) / NULLIF(SUM(credito_vigente), 0) * 100, 1) AS pct_ejecucion
FROM fact_credito_devengado_mensual
WHERE ejercicio_presupuestario BETWEEN 2019 AND 2025
GROUP BY 1
ORDER BY 1;
```

### 2. Top jurisdicciones por devengado (un anio)
```sql
SELECT j.jurisdiccion_desc,
       SUM(h.credito_devengado) AS devengado,
       SUM(h.credito_vigente) AS vigente,
       ROUND(SUM(h.credito_devengado) / NULLIF(SUM(h.credito_vigente), 0) * 100, 1) AS pct_ejecucion
FROM fact_credito_devengado_mensual h
JOIN dim_jurisdiccion j ON j.jurisdiccion_id = h.jurisdiccion_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 ORDER BY 2 DESC;
```

### 3. Serie mensual nominal
```sql
SELECT h.periodo,
       SUM(h.credito_devengado) AS devengado_millones
FROM fact_credito_devengado_mensual h
WHERE h.ejercicio_presupuestario = 2024
  AND h.jurisdiccion_id = '88'
GROUP BY 1 ORDER BY 1;
```

### 4. Serie mensual deflactada (IPC)
```sql
WITH base AS (
  SELECT ipc_indice AS ipc_base
  FROM ipc_indice_mensual
  WHERE periodo = DATE '2024-12-01'
)
SELECT h.periodo,
       SUM(h.credito_devengado) * (base.ipc_base / ipc.ipc_indice) AS devengado_real
FROM fact_credito_devengado_mensual h
JOIN ipc_indice_mensual ipc ON ipc.periodo = h.periodo
CROSS JOIN base
WHERE h.ejercicio_presupuestario = 2024
  AND h.jurisdiccion_id = '88'
GROUP BY 1, base.ipc_base, ipc.ipc_indice
ORDER BY 1;
```

### 5. Subejecucion por jurisdiccion
```sql
SELECT j.jurisdiccion_desc,
       SUM(h.credito_vigente) AS vigente,
       SUM(h.credito_devengado) AS devengado,
       ROUND((1 - SUM(h.credito_devengado) / NULLIF(SUM(h.credito_vigente), 0)) * 100, 1) AS pct_sub
FROM fact_credito_devengado_mensual h
JOIN dim_jurisdiccion j ON j.jurisdiccion_id = h.jurisdiccion_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 HAVING SUM(h.credito_vigente) > 0
ORDER BY pct_sub DESC;
```

### 6. Gasto por finalidad/funcion
```sql
SELECT fi.finalidad_desc, fu.funcion_desc,
       SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
JOIN dim_finalidad fi ON fi.finalidad_id = h.finalidad_id
JOIN dim_funcion fu ON fu.finalidad_id = h.finalidad_id AND fu.funcion_id = h.funcion_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15;
```

### 7. Comparacion inter-anual por jurisdiccion
```sql
SELECT j.jurisdiccion_desc,
       SUM(CASE WHEN h.ejercicio_presupuestario = 2023 THEN h.credito_devengado END) AS dev_2023,
       SUM(CASE WHEN h.ejercicio_presupuestario = 2024 THEN h.credito_devengado END) AS dev_2024
FROM fact_credito_devengado_mensual h
JOIN dim_jurisdiccion j ON j.jurisdiccion_id = h.jurisdiccion_id
WHERE h.ejercicio_presupuestario IN (2023, 2024)
GROUP BY 1 ORDER BY dev_2024 DESC NULLS LAST;
```

### 8. Evolucion de un programa
```sql
SELECT h.ejercicio_presupuestario, SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
WHERE h.servicio_id = '850' AND h.programa_id = '16'
  AND h.ejercicio_presupuestario BETWEEN 2019 AND 2025
GROUP BY 1 ORDER BY 1;
```

### 9. Gasto por provincia
```sql
SELECT ug.ubicacion_geografica_desc AS provincia,
       SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
JOIN dim_ubicacion_geografica ug ON ug.ubicacion_geografica_id = h.ubicacion_geografica_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 ORDER BY 2 DESC;
```

### 10. Distribucion por fuente de financiamiento
```sql
SELECT ff.fuente_financiamiento_desc,
       SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
JOIN dim_fuente_financiamiento ff ON ff.fuente_financiamiento_id = h.fuente_financiamiento_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 ORDER BY 2 DESC;
```

---

*Este archivo se inyecta automaticamente como contexto del LLM via `src/lib/ai/prompts.ts`*
