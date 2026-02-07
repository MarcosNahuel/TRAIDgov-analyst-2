# Prompt: Planificación de Expansión Multi-Año (2014-2024) con Granularidad Mensual

> Copiar/pegar este prompt completo en un LLM para obtener un plan detallado de expansión.

---

## INICIO DEL PROMPT

Sos un arquitecto de datos y desarrollador senior especializado en PostgreSQL, ETL pipelines, y aplicaciones Next.js con Supabase. Necesito que planifiques la expansión de una base de datos de presupuesto público argentino, pasando de **datos anuales de un solo ejercicio (2024)** a **datos mensuales multi-año (2014-2024)**.

El resultado debe ser un plan de implementación completo, detallado y ejecutable, cubriendo: schema SQL, ETL, migración de datos, cambios en la aplicación, y estrategia de performance.

---

## 1. ESTADO ACTUAL DEL SISTEMA

### 1.1 Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19.2 |
| AI | Vercel AI SDK 5.0 (streamText + tools) |
| LLM | Claude Sonnet 4.5 / Gemini 2.0 Flash |
| DB | Supabase (PostgreSQL 15 + pgvector + RLS) |
| Charts | Nivo (Sankey, Treemap, Bar, Pie, Line) |
| Deploy | 100% Vercel serverless |

### 1.2 Arquitectura "Minimal Agent"

La app es un chatbot de inteligencia presupuestaria con solo 2 tools:

1. **`executeSQL`** — Ejecuta queries SELECT read-only contra Supabase via una función RPC `execute_readonly_query`
2. **`generateDashboard`** — Genera configuración JSON para dashboards con KPIs, gráficos Nivo, tablas y análisis narrativo (renderizado client-side)

El LLM recibe un **schema doc** (archivo markdown inyectado en el system prompt) con toda la información de tablas, JOINs, reglas SQL y queries de ejemplo. No hay allowlist de queries — el LLM genera SQL libre.

### 1.3 Función RPC en Supabase

```sql
CREATE OR REPLACE FUNCTION execute_readonly_query(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10000'  -- 10 segundos max
AS $$
DECLARE
    result JSONB;
BEGIN
    IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%' OR UPPER(TRIM(sql_query)) LIKE 'WITH%') THEN
        RAISE EXCEPTION 'Solo queries SELECT/WITH permitidas';
    END IF;

    IF sql_query ~* '(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)' THEN
        RAISE EXCEPTION 'Query contiene comandos no permitidos';
    END IF;

    EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql_query || ') t'
    INTO result;

    RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
```

### 1.4 Schema Actual — Star Schema (Solo 2024)

#### Tabla de hechos: `presupuesto_nacion_2024`
- **119,413 registros** (datos anuales acumulados, sin granularidad mensual en la tabla actual)
- Nombre de tabla hardcodeado al año 2024

```sql
CREATE TABLE presupuesto_nacion_2024 (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ejercicio_presupuestario INTEGER,        -- Siempre 2024
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
    credito_presupuestado NUMERIC(20, 2),    -- Presupuesto inicial (Ley de Congreso)
    credito_vigente NUMERIC(20, 2),          -- Ajustado por DNU/modificaciones
    credito_comprometido NUMERIC(20, 2),     -- Reservado por contrato
    credito_devengado NUMERIC(20, 2),        -- Obligación de pago real
    credito_pagado NUMERIC(20, 2),           -- Salida efectiva del Tesoro
    source_file TEXT
);
```

#### 19 Tablas de Dimensiones

Todas las dimensiones tienen un campo `id_unico TEXT PRIMARY KEY` que es la concatenación de sus columnas clave.

| Tabla | Registros | Key Compuesta | JOIN |
|-------|-----------|---------------|------|
| **dim_jurisdiccion** | 16 | `jurisdiccion_id` | `h.jurisdiccion_id = j.jurisdiccion_id` |
| **dim_subjurisdiccion** | 39 | `jurisdiccion_id + subjurisdiccion_id` | `h.jurisdiccion_id = sj.jurisdiccion_id AND h.subjurisdiccion_id = sj.subjurisdiccion_id` |
| **dim_entidad** | 83 | `subjurisdiccion_id + entidad_id` | `h.subjurisdiccion_id = e.subjurisdiccion_id AND h.entidad_id = e.entidad_id` |
| **dim_servicio** | 129 | `entidad_id + servicio_id` | `h.entidad_id = s.entidad_id AND h.servicio_id = s.servicio_id` |
| **dim_programa** | 536 | `servicio_id + programa_id` | `h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id` |
| **dim_subprograma** | 323 | `programa_id + subprograma_id` | `h.programa_id = sp.programa_id AND h.subprograma_id = sp.subprograma_id` |
| **dim_proyecto** | 564 | `subprograma_id + proyecto_id` | `h.subprograma_id = pr.subprograma_id AND h.proyecto_id = pr.proyecto_id` |
| **dim_actividad** | 186 | `proyecto_id + actividad_id` | `h.proyecto_id = a.proyecto_id AND h.actividad_id = a.actividad_id` |
| **dim_obra** | 105 | `actividad_id + obra_id` | `h.actividad_id = o.actividad_id AND h.obra_id = o.obra_id` |
| **dim_inciso** | 8 | `inciso_id` | `h.inciso_id = i.inciso_id` |
| **dim_principal** | 48 | `inciso_id + principal_id` | `h.inciso_id = p.inciso_id AND h.principal_id = p.principal_id` |
| **dim_parcial** | 79 | `principal_id + parcial_id` | `h.principal_id = pa.principal_id AND h.parcial_id = pa.parcial_id` |
| **dim_subparcial** | 794 | `parcial_id + subparcial_id` | `h.parcial_id = sp.parcial_id AND h.subparcial_id = sp.subparcial_id` |
| **dim_finalidad** | 5 | `finalidad_id` | `h.finalidad_id = fi.finalidad_id` |
| **dim_funcion** | 29 | `finalidad_id + funcion_id` | `h.finalidad_id = fu.finalidad_id AND h.funcion_id = fu.funcion_id` |
| **dim_fuente_financiamiento** | 7 | `fuente_financiamiento_id` | `h.fuente_financiamiento_id = ff.fuente_financiamiento_id` |
| **dim_ubicacion_geografica** | 28 | `ubicacion_geografica_id` | `h.ubicacion_geografica_id = ug.ubicacion_geografica_id` |
| **dim_caracter** | 3 | `caracter_id` | `h.caracter_id = c.caracter_id` |
| **dim_sector** | 1 | `sector_id` | `h.sector_id = se.sector_id` |

#### Jerarquías Dimensionales

```
ADMINISTRATIVA (quién gasta):
jurisdiccion (16) → subjurisdiccion (39) → entidad (83) → servicio (129)

PROGRAMÁTICA (en qué gasta):
programa (536) → subprograma (323) → proyecto (564) → actividad (186) → obra (105)

FUNCIONAL (para qué gasta):
finalidad (5) → funcion (29)

ECONÓMICA (cómo gasta):
inciso (8) → principal (48) → parcial (79) → subparcial (794)
```

#### Advertencia Crítica: Keys Compuestas

`programa_id` NO es globalmente único. El ID `16` tiene 59 programas distintos. La clave real es `servicio_id + programa_id`. Esto aplica a TODAS las dimensiones jerárquicas listadas arriba.

#### Índices Actuales

```sql
CREATE INDEX idx_presup_agg ON presupuesto_nacion_2024
    (ejercicio_presupuestario, jurisdiccion_id, programa_id, inciso_id);
CREATE INDEX idx_presup_mes ON presupuesto_nacion_2024
    (impacto_presupuestario_mes);
```

### 1.5 ETL Actual (TypeScript)

El script `scripts/seed-database.ts` hace:

1. **Descarga** ZIP de MECON: `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-anual-2024.zip` (o `credito-mensual-2024.zip`)
2. **Parsea** CSV (~445 MB, ~476K registros mensualizados / 119K anuales)
3. **Normaliza** columnas (lowercase, sin acentos, underscores)
4. **Carga dimensiones** en orden jerárquico con upsert (`id_unico` como conflict key)
5. **Carga tabla de hechos** en batches de 500

Definición de dimensiones en el ETL:
```typescript
const DIMENSIONS: DimensionDef[] = [
  // Clasificador económico
  { table: "dim_inciso", idColumns: ["inciso_id"], descColumn: "inciso_desc" },
  { table: "dim_principal", idColumns: ["inciso_id", "principal_id"], descColumn: "principal_desc" },
  { table: "dim_parcial", idColumns: ["principal_id", "parcial_id"], descColumn: "parcial_desc" },
  { table: "dim_subparcial", idColumns: ["parcial_id", "subparcial_id"], descColumn: "subparcial_desc" },
  // Estructura administrativa
  { table: "dim_jurisdiccion", idColumns: ["jurisdiccion_id"], descColumn: "jurisdiccion_desc" },
  { table: "dim_subjurisdiccion", idColumns: ["jurisdiccion_id", "subjurisdiccion_id"], descColumn: "subjurisdiccion_desc" },
  { table: "dim_entidad", idColumns: ["subjurisdiccion_id", "entidad_id"], descColumn: "entidad_desc" },
  { table: "dim_servicio", idColumns: ["entidad_id", "servicio_id"], descColumn: "servicio_desc" },
  // Estructura programática
  { table: "dim_programa", idColumns: ["servicio_id", "programa_id"], descColumn: "programa_desc" },
  { table: "dim_subprograma", idColumns: ["programa_id", "subprograma_id"], descColumn: "subprograma_desc" },
  { table: "dim_proyecto", idColumns: ["subprograma_id", "proyecto_id"], descColumn: "proyecto_desc" },
  { table: "dim_actividad", idColumns: ["proyecto_id", "actividad_id"], descColumn: "actividad_desc" },
  { table: "dim_obra", idColumns: ["actividad_id", "obra_id"], descColumn: "obra_desc" },
  // Estructura funcional
  { table: "dim_finalidad", idColumns: ["finalidad_id"], descColumn: "finalidad_desc" },
  { table: "dim_funcion", idColumns: ["finalidad_id", "funcion_id"], descColumn: "funcion_desc" },
  // Otras
  { table: "dim_fuente_financiamiento", idColumns: ["fuente_financiamiento_id"], descColumn: "fuente_financiamiento_desc" },
  { table: "dim_ubicacion_geografica", idColumns: ["ubicacion_geografica_id"], descColumn: "ubicacion_geografica_desc" },
];
```

### 1.6 Métricas Financieras

Los montos están en **pesos argentinos** (no millones, el CSV trae valores crudos).

| Métrica | Descripción |
|---------|-------------|
| `credito_presupuestado` | Presupuesto inicial aprobado por Congreso |
| `credito_vigente` | Ajustado por DNU/Decisiones Administrativas |
| `credito_comprometido` | Reservado por contrato/orden de compra |
| `credito_devengado` | Obligación de pago (bien/servicio recibido) |
| `credito_pagado` | Salida efectiva del Tesoro Nacional |

Indicadores derivados:
- **Tasa de ejecución**: `devengado / NULLIF(vigente, 0) * 100`
- **Subejecución**: `(1 - devengado / NULLIF(vigente, 0)) * 100`
- **Deuda flotante**: `devengado - pagado`
- **Modificación presupuestaria**: `vigente - presupuestado`

### 1.7 System Prompt Actual (lo que el LLM recibe)

El LLM recibe un system prompt con:
- Rol: "Analista Principal de Presupuesto de la Nación Argentina"
- Reglas de SQL: keys compuestas obligatorias, `unaccent(LOWER(...))` para filtros de texto, `NULLIF` para divisiones
- Contexto institucional 2024 (estructura Milei: DNU 8/2023)
- Schema doc completo inyectado al final
- Reglas anti-layout-break para gráficos (máx 15 bars, máx 8 slices pie, etc.)

### 1.8 Fuente de Datos: Portal Presupuesto Abierto

**Datasets masivos (CSV/ZIP):**
```
https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/{AÑO}/credito-mensual-{AÑO}.zip
```

Ejemplo: `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-mensual-2024.zip`

- Cada ZIP contiene 1 CSV con ~400K-500K registros
- 57 columnas por CSV
- Encoding: UTF-8 o Latin-1 (varía entre años)
- Separador: puede ser TAB, `;` o `,`
- **La estructura de columnas puede variar ligeramente entre años** (nombres, orden, columnas adicionales/faltantes)

**API REST (alternativa/complemento):**
```
https://www.presupuestoabierto.gob.ar/api/v1/credito?ejercicio={AÑO}
```

---

## 2. LO QUE NECESITO QUE PLANIFIQUES

### 2.1 Objetivo

Expandir el sistema de **1 año (2024) con datos anuales** a **11 años (2014-2024) con datos mensuales**, manteniendo:
- Performance aceptable (queries < 10 segundos)
- Compatibilidad hacia atrás (que las queries actuales sigan funcionando)
- La misma arquitectura "Minimal Agent" (2 tools, schema doc como contexto)

### 2.2 Desafíos Conocidos

1. **Volumen**: De ~120K registros a ~5-6 MILLONES (11 años × ~500K registros mensuales cada uno)
2. **Estructura ministerial variable**: Los ministerios cambiaron con cada gobierno:
   - 2014-2015: Gobierno Cristina Fernández (~30 ministerios)
   - 2016-2019: Gobierno Macri (~20 ministerios, luego recortó)
   - 2020-2023: Gobierno Alberto Fernández (~20 ministerios)
   - 2024: Gobierno Milei (~16 ministerios, DNU 8/2023)
   - Ministerios se crean, fusionan, renombran y eliminan entre gobiernos
3. **Columnas CSV variables**: El formato del CSV de MECON no es idéntico entre años
4. **Inflación extrema**: La inflación acumulada 2014-2024 es >10,000%. Comparaciones nominales entre años son engañosas.
5. **Granularidad mensual**: Necesidad de una columna `mes` o `periodo` en la tabla de hechos
6. **Tabla de hechos renombrada**: Actualmente `presupuesto_nacion_2024` — necesita un nombre genérico
7. **Dimensiones que cambian entre años**: Un programa puede existir en 2020 pero no en 2024, y viceversa (Slowly Changing Dimensions)
8. **Schema doc expandido**: El LLM necesita saber que hay multi-año + contexto institucional por gobierno

### 2.3 Preguntas que el sistema debería poder responder después de la expansión

1. "¿Cómo evolucionó el gasto en educación de 2014 a 2024?"
2. "Comparame el presupuesto de Salud entre Macri y Fernández"
3. "¿Qué ministerio tuvo mayor crecimiento real del gasto en la última década?"
4. "Mostrame la ejecución mensual de 2024 vs 2023"
5. "¿Cuánto se gastó en obra pública por año?"
6. "¿Cómo cambió la composición del gasto (personal vs transferencias) en 10 años?"
7. "¿Qué proporción del presupuesto se destina a servicios sociales? ¿Cambió?"
8. "Evolución mensual del gasto total en el primer semestre de cada año"
9. "¿Cuál fue el año con mayor subejecución?"
10. "¿Cómo evolucionó la deuda flotante año a año?"

---

## 3. QUÉ NECESITO EN TU RESPUESTA

Generá un plan detallado y ejecutable que cubra **todos** estos aspectos:

### 3.1 Schema SQL: Nueva Estructura de Base de Datos

- **Tabla de hechos unificada** (nombre genérico, no por año)
- **Columnas nuevas** necesarias (`ejercicio`, `mes`, `periodo`, etc.)
- **Particionamiento** de PostgreSQL por año (o por año+mes) — analizar pros/contras
- **Tabla de dimensiones temporal** (`dim_periodo`, `dim_ejercicio`) — ¿es necesaria?
- **Manejo de Slowly Changing Dimensions**: ¿Qué pasa cuando un ministerio cambia de nombre o se fusiona? ¿Tipo 1, 2 o 3?
- **Tabla de equivalencias** entre estructuras ministeriales de distintos gobiernos (mapeo de jurisdicciones históricas a actuales)
- **Tabla de deflactores/IPC** para cálculos en términos reales
- **Índices optimizados** para el nuevo volumen (~5-6M registros)
- **Materialized views** para agregaciones frecuentes (gasto anual por jurisdicción, ejecución mensual, etc.)
- **Scripts SQL completos** listos para ejecutar en Supabase

### 3.2 ETL: Pipeline Multi-Año

- **Script de descarga** que itere 2014-2024 descargando cada ZIP
- **Normalización de columnas** entre años (mapeo de nombres de columnas que varían)
- **Detección de schema drift** entre CSVs de distintos años
- **Estrategia de carga**: ¿incremental o full refresh? ¿Cómo manejar re-ejecuciones?
- **Idempotencia**: Que se pueda re-ejecutar sin duplicar datos
- **Logging y progreso**: Reportar cuántos registros por año se cargaron
- **Validación post-carga**: Queries de verificación (totales por año, conteos, etc.)
- **Manejo de errores**: ¿Qué pasa si un año no está disponible? ¿Si el CSV está corrupto?
- **Paralelismo**: ¿Se pueden cargar años en paralelo o hay dependencias?
- **Script TypeScript completo** o pseudocódigo muy detallado

### 3.3 Migración: De Tabla Actual a Nueva Estructura

- **Estrategia de migración** de `presupuesto_nacion_2024` → nueva tabla unificada
- **Zero-downtime**: ¿Se puede hacer sin tirar abajo la app?
- **Rollback plan**: ¿Cómo volver atrás si algo sale mal?
- **Migración de datos existentes**: Mover los 119K registros actuales a la nueva tabla
- **Actualización de la función RPC** `execute_readonly_query`
- **Scripts de migración SQL** paso a paso

### 3.4 Cambios en la Aplicación

#### Schema Doc (`schema/presupuesto-nacion.md`)
- Actualizar para reflejar tabla unificada multi-año
- Agregar contexto institucional por gobierno/periodo
- Agregar reglas SQL nuevas (filtrar por ejercicio, comparaciones inter-anuales)
- Agregar queries de ejemplo multi-año
- Agregar advertencia sobre inflación y comparaciones nominales
- **Incluir el texto actualizado completo** o diff detallado

#### System Prompt (`src/lib/ai/prompts.ts`)
- Reglas nuevas para el LLM sobre multi-año
- Contexto institucional por gobierno
- Advertencias sobre inflación
- Reglas para gráficos de series temporales (line charts)

#### Tools (`src/lib/ai/tools.ts`)
- ¿Cambia algo en executeSQL?
- ¿Se necesita una nueva tool para deflactar montos?
- ¿Se necesita una tool para mapear jurisdicciones entre gobiernos?

#### ETL Script (`scripts/seed-database.ts`)
- Nuevo script multi-año o extensión del existente

### 3.5 Performance y Escalabilidad

- **Estimación de volumen**: ¿Cuántos registros totales esperamos?
- **Particionamiento**: Evaluar `PARTITION BY RANGE (ejercicio_presupuestario)` vs `PARTITION BY LIST`
- **Materialized views** para queries frecuentes:
  - Gasto anual por jurisdicción
  - Ejecución mensual
  - Totales por finalidad/función por año
- **Índices compuestos** optimizados para el patrón de queries del LLM
- **`statement_timeout`** de la función RPC: ¿10 segundos sigue siendo suficiente?
- **Plan de Supabase**: ¿El plan Free/Pro soporta ~5M registros? ¿Límites de storage?
- **Vercel timeout**: `maxDuration = 30` — ¿alcanza para queries sobre 5M registros?

### 3.6 Datos de Referencia: Inflación/IPC

- **Fuente oficial** del IPC/inflación mensual de Argentina (INDEC)
- **Tabla de deflactores** para normalizar montos a "pesos constantes de [año base]"
- **Fórmula de deflactación** que el LLM pueda usar en SQL
- ¿Guardar IPC como tabla en Supabase o como constantes en el schema doc?

### 3.7 Mapeo Institucional Inter-Gobiernos

- **Tabla de equivalencias**: Cómo mapear "Ministerio de Educación" (pre-2024) a "Ministerio de Capital Humano" (2024)
- **Cambios principales** en la estructura ministerial por gobierno
- ¿Es mejor un mapeo manual o automático?
- **Impacto en queries**: ¿El LLM necesita saber sobre estos cambios?

### 3.8 Cronograma y Priorización

- **Fases de implementación** ordenadas por prioridad y dependencia
- **Estimación de esfuerzo** por fase
- **Quick wins** vs. cambios grandes
- **Qué se puede hacer de forma incremental** (ej: empezar con 2023+2024, luego 2020-2024, luego 2014-2024)

---

## 4. RESTRICCIONES Y CONSIDERACIONES

1. **Todo se ejecuta en Supabase** (PostgreSQL 15). No hay acceso a un servidor dedicado.
2. **Deploy 100% Vercel serverless**. Sin VPS, sin Docker.
3. **Read-only**: La app solo lee datos. El ETL es un proceso offline separado.
4. **Plan Supabase Pro**: ~8GB de storage, 500MB RAM para Postgres. Considerar esto para el sizing.
5. **El LLM genera SQL libre** — no hay allowlist. Todo cambio de schema debe reflejarse en el schema doc.
6. **Backwards compatible**: Las preguntas que hoy funcionan (sobre 2024) deben seguir funcionando.
7. **Idioma**: Toda la documentación, schema doc y prompts en español argentino.
8. **Principio "Minimal Agent"**: Evitar agregar tools o complejidad innecesaria. Si se puede resolver con SQL + schema doc, mejor.

---

## 5. FORMATO DE RESPUESTA ESPERADO

Estructurá tu respuesta en estas secciones:

1. **Resumen Ejecutivo** (1 párrafo)
2. **Decisiones de Arquitectura** (tabla con decisión, opción elegida, alternativa descartada, razón)
3. **Schema SQL Completo** (scripts listos para ejecutar)
4. **Plan de Migración** (paso a paso con scripts)
5. **ETL Multi-Año** (pseudocódigo detallado o TypeScript)
6. **Schema Doc Actualizado** (diff o texto completo)
7. **Cambios en la Aplicación** (archivos a modificar con el cambio específico)
8. **Estrategia de Performance** (particionamiento, índices, views)
9. **Datos de Referencia** (IPC, mapeo institucional)
10. **Cronograma de Implementación** (fases con dependencias)
11. **Riesgos y Mitigaciones** (tabla)
12. **Checklist de Verificación** (queries de prueba post-migración)

Sé exhaustivo y específico. Dame scripts SQL que pueda copiar y ejecutar. Dame código TypeScript que pueda adaptar. Citá fuentes cuando sea posible (URLs del INDEC, MECON, etc.).

## FIN DEL PROMPT
