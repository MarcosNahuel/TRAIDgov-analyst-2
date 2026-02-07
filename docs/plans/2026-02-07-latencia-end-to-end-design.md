# Design: Exactitud y Performance del Agente

> Fecha: 2026-02-07 (rev. 2026-02-07)
> Prioridad: **Exactitud (1)**, Latencia (2), Costo (3)
> Premisa: "Prefiero que se demore y haga las comprobaciones, queries y bucles
>   necesarios para que el resultado sea correcto. La respuesta correcta y los
>   graficos bien, al igual que los numeros, antes de mejorar la latencia."
> Filosofia: Vercel "Minimal Agent" — no vectorizar, no RAG del schema.
> Constraint: Vercel + Supabase only, 0 dependencias nuevas de infra
> Excluido: Guardrails AST (no necesario para demo), Power BI (scope separado)

---

## Diagnostico

### Stack actual
- AI SDK 6 (`ai@^6.0.74`, `@ai-sdk/react@^3.0.76`)
- Gemini 3 Flash Preview via `@ai-sdk/google`
- Supabase PG 15 con RPC `execute_readonly_query`
- Nivo 0.99 (SVG) + framer-motion
- Next.js 16.1.6 + Turbopack
- 3 tools: executeSQL, generateDashboard, rememberFact

### Flujo actual de un request
```
[User] -> [POST /api/chat]
  -> loadMemories() .................. ~50ms
  -> streamText() con system prompt .. ~6000+ tokens input
    -> LLM paso 1: razona + executeSQL .. 2-4s
    -> DB query via RPC ................. 200-500ms
    -> LLM paso 2: segunda query? ....... 2-3s (si es compleja)
    -> DB query 2 ....................... 200-500ms
    -> LLM paso 3: generateDashboard .... 1-2s
  -> Client render charts .............. 200-500ms

Total estimado: 5-10s simple, 8-15s complejo
```

### Problemas identificados (a confirmar con telemetria)
1. **Sin validacion de resultados**: results vacios o sospechosos no se detectan — el agente puede generar charts con datos incorrectos
2. **Sin sanity checks**: numeros negativos, totales absurdos o periodos inexistentes pasan sin aviso
3. **Charts sin validacion**: data malformada crashea el chart en vez de mostrar fallback
4. **Pasos secuenciales**: 3-5 roundtrips LLM para preguntas complejas — mas pasos = mas riesgo de perder contexto
5. **Charts sin code-splitting**: Nivo completo + framer-motion en bundle inicial
6. **Sin telemetria**: no hay datos reales para priorizar ni detectar respuestas incorrectas
7. **Tokens de entrada**: system prompt (189 lineas) + schema doc (329 lineas) = ~6000+ tokens (secundario — no comprimir agresivamente)

### Decisiones de descarte (con justificacion)

| Propuesta | Descartada? | Razon |
|-----------|-------------|-------|
| Schema RAG dinamico (keyword retrieval) | Si | Schema tiene 9 tablas — chico. Un falso negativo en retrieval (no traer dim_funcion cuando preguntan por educacion) cuesta mas que inyectar todo. Mantener schema completo = maxima exactitud. |
| Compresion agresiva del schema | Si | Los 10 query examples son few-shot que ayudan al LLM a generar SQL correcto. Eliminarlos ahorra tokens pero reduce exactitud. Solo quitar columnas metadata (row_hash, loaded_at). |
| Reducir stepCount (5→4) | Si | El agente necesita espacio para razonar, verificar y corregir. Recortar pasos sacrifica comprobaciones. Mantener stepCount=5. |
| Reducir temperature | Si | Temperature mas baja = menos variabilidad, pero tambien menos capacidad exploratoria. Mantener default del modelo. |
| Capeo de puntos client-side | Si | Ya esta en las reglas del prompt (max 15 bars, max 8 pie slices). Si el LLM no respeta, fix = mejorar prompt + strict mode. |
| SQL guardrails AST (pg-parser) | Si | No necesario para demo. El regex actual + RPC read-only + RLS son suficientes. |
| LangGraph / orquestador externo | Si | Overkill. AI SDK 6 con ToolLoopAgent ya cubre el loop agentico. |
| Power BI integration | Si (scope separado) | Feature nueva, no optimizacion. |

---

## Plan de Implementacion

### Fase 0: Instrumentar (dia 1)

> Regla: no optimizar sin datos. Primero medir.

#### 0.1 Tabla `agent_telemetry`

**Archivo nuevo**: `etl-codex/sql/02_agent_telemetry.sql`

```sql
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
```

#### 0.2 Instrumentar `route.ts`

**Archivo**: `src/app/api/chat/route.ts`

Cambios:
- Capturar `performance.now()` al inicio del request
- Usar `onStepFinish` callback de AI SDK 6 para contar pasos y tokens
- Wrapear `executeSQL.execute()` con timing (ver Fase 1 para detalle del wrapper)
- Al finalizar el stream, insertar fila en `agent_telemetry` via Supabase
- Si el insert falla, `console.warn()` — nunca romper el response

```typescript
// Pseudocodigo del flow en route.ts
const t0 = performance.now();
let stepCount = 0;
let tokensIn = 0, tokensOut = 0;
const toolTimings: ToolTiming[] = [];

const result = streamText({
  // ... existing config ...
  onStepFinish: ({ usage }) => {
    stepCount++;
    if (usage) {
      tokensIn += usage.promptTokens ?? 0;
      tokensOut += usage.completionTokens ?? 0;
    }
  },
});

// Despues del stream (usar waitUntil si disponible en Vercel)
const telemetry = {
  conversation_id: conversationId,
  user_query: lastUserMessage,
  t_total_ms: Math.round(performance.now() - t0),
  step_count: stepCount,
  tokens_input: tokensIn,
  tokens_output: tokensOut,
  tool_calls: toolTimings,
  // ...
};
supabase.from("agent_telemetry").insert(telemetry); // fire-and-forget
```

#### 0.3 Archivo de preguntas benchmark

**Archivo nuevo**: `scripts/benchmark-questions.json`

```json
[
  {"id": "simple-1", "q": "Cuanto se gasto en total en 2024?", "type": "simple"},
  {"id": "simple-2", "q": "Top 5 jurisdicciones por devengado en 2024", "type": "simple"},
  {"id": "simple-3", "q": "Que porcentaje ejecuto Salud en 2024?", "type": "simple"},
  {"id": "simple-4", "q": "Gasto mensual de Capital Humano en 2024", "type": "simple"},
  {"id": "simple-5", "q": "Distribucion por fuente de financiamiento 2024", "type": "simple"},
  {"id": "complex-1", "q": "Compare educacion vs salud de 2019 a 2024", "type": "complex"},
  {"id": "complex-2", "q": "Que jurisdiccion tiene mayor subejecucion en 2024?", "type": "complex"},
  {"id": "complex-3", "q": "Como evoluciono el gasto en defensa entre Macri y Milei?", "type": "complex"},
  {"id": "complex-4", "q": "Cuanto representan las transferencias sobre el total por anio?", "type": "complex"},
  {"id": "complex-5", "q": "Mostrame la serie mensual de 2024 deflactada por IPC", "type": "complex"}
]
```

Uso: checklist manual despues de cada fase. Automatizar despues de Fase 1.

#### 0.4 Queries de analisis de telemetria

```sql
-- Latencia promedio por etapa
SELECT
  COUNT(*) AS total_queries,
  ROUND(AVG(t_total_ms)) AS avg_total_ms,
  ROUND(AVG(t_first_token_ms)) AS avg_ttft_ms,
  ROUND(AVG(t_db_total_ms)) AS avg_db_ms,
  ROUND(AVG(step_count), 1) AS avg_steps,
  ROUND(AVG(tokens_input)) AS avg_tokens_in,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t_total_ms)) AS p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t_total_ms)) AS p95_ms
FROM agent_telemetry
WHERE created_at > NOW() - INTERVAL '7 days';

-- Preguntas mas lentas
SELECT user_query, t_total_ms, step_count, sql_queries, tokens_input
FROM agent_telemetry
ORDER BY t_total_ms DESC LIMIT 10;

-- Distribucion de pasos
SELECT step_count, COUNT(*) AS freq
FROM agent_telemetry
GROUP BY 1 ORDER BY 1;

-- Errores recientes
SELECT user_query, error_message, created_at
FROM agent_telemetry
WHERE had_error = true
ORDER BY created_at DESC LIMIT 10;
```

---

### Fase 1: Exactitud del Agente (dia 2-3)

> Prioridad: que las respuestas, numeros y graficos sean correctos.
> Todos estos cambios pueden hacerse en paralelo.

#### 1.1 Sanity check post-SQL (PRIORIDAD ALTA)

**Problema**: Results vacios o sospechosos no se detectan. El LLM puede generar charts con datos incorrectos, o intentar retry ciego sin contexto del error.

**Solucion**: Agregar validacion dentro de `executeSQL.execute()`:

```typescript
// Dentro del return de executeSQL.execute()
const warnings: string[] = [];

if (rows.length === 0) {
  warnings.push(
    "La query no devolvio resultados. Posibles causas: " +
    "filtro de periodo incorrecto, nombre de dimension mal escrito, " +
    "o datos no cargados para ese anio."
  );
}

if (rows.length >= PREVIEW_LIMIT) {
  warnings.push(
    `Resultados truncados a ${PREVIEW_LIMIT} filas. ` +
    "Usa agregacion (SUM/GROUP BY) para datos mas concisos."
  );
}

// Chequeo de magnitudes en columnas numericas
const numericCols = Object.keys(rows[0] ?? {}).filter(
  k => typeof rows[0][k] === "number"
);
for (const col of numericCols) {
  const vals = rows.map(r => r[col] as number).filter(v => v != null);
  if (vals.some(v => v < 0)) {
    warnings.push(
      `Columna "${col}" tiene valores negativos. ` +
      "En presupuesto esto puede indicar reducciones o ajustes."
    );
  }
  // Detectar montos que parecen no estar en millones
  const max = Math.max(...vals.map(Math.abs));
  if (max > 1e15) {
    warnings.push(
      `Columna "${col}" tiene valores muy grandes (${max}). ` +
      "Verificar si la query necesita /1000000 para expresar en millones."
    );
  }
}

return {
  explanation,
  rowCount: rows.length,
  data: rows.slice(0, PREVIEW_LIMIT),
  sql: query,
  truncated: rows.length > PREVIEW_LIMIT,
  warnings, // <-- NUEVO: el LLM recibe contexto para corregir
};
```

**Impacto**: El LLM recibe warnings contextuales y puede ajustar su query o interpretar correctamente los datos. Reduce respuestas incorrectas.

**Archivos a modificar**:
- `src/lib/ai/tools.ts` — executeSQL.execute()

#### 1.2 Chart normalizer — validacion + formateo + fallback

**Problema**: Montos sin formatear (1234567890 se muestra como "1.2e9"). Charts crashean con data malformada. El usuario ve un grafico roto o numeros incomprensibles.

**Solucion**: Crear `src/lib/chart-utils.ts`:

```typescript
/**
 * Formatea un monto en millones de pesos a formato legible.
 */
export function formatBudgetAmount(millions: number): string {
  if (Math.abs(millions) >= 1_000_000) {
    return `${(millions / 1_000_000).toFixed(1)} B`;  // billones
  }
  if (Math.abs(millions) >= 1_000) {
    return `${(millions / 1_000).toFixed(1)} MM`;      // miles de millones
  }
  return `${millions.toFixed(0)} M`;                    // millones
}

/**
 * Valida que un chart tenga data renderizable.
 * Si no, retorna fallback para mostrar tabla en vez de chart roto.
 */
export function validateChartData(chart: ChartConfig): {
  valid: boolean;
  fallbackReason?: string;
} {
  if (!chart.data) return { valid: false, fallbackReason: "Sin datos" };

  if (chart.type === "bar" && Array.isArray(chart.data) && chart.data.length === 0) {
    return { valid: false, fallbackReason: "Array de barras vacio" };
  }

  if (chart.type === "sankey") {
    const d = chart.data as { nodes?: unknown[]; links?: unknown[] };
    if (!d.nodes?.length || !d.links?.length) {
      return { valid: false, fallbackReason: "Sankey sin nodos o links" };
    }
  }

  // Verificar que haya al menos un valor numerico
  if (Array.isArray(chart.data) && chart.data.length > 0) {
    const hasNumeric = chart.data.some((d: Record<string, unknown>) =>
      Object.values(d).some(v => typeof v === "number" && !isNaN(v))
    );
    if (!hasNumeric) {
      return { valid: false, fallbackReason: "Datos sin valores numericos" };
    }
  }

  return { valid: true };
}
```

Uso en el renderer: si `validateChartData` retorna `valid: false`, mostrar tabla con los datos raw en vez de chart roto.

**Archivos nuevos**:
- `src/lib/chart-utils.ts`

**Archivos a modificar**:
- `src/components/dashboard/dashboard-panel.tsx` — usar validateChartData antes de renderizar
- `src/components/charts/*.tsx` — usar formatBudgetAmount en axis tick formatters

#### 1.3 strict: true en tools

**Problema**: Si el modelo genera JSON malformado para generateDashboard, el SDK intenta retry.

**Solucion**:
```typescript
// En src/lib/ai/tools.ts
export const generateDashboard = tool({
  description: `...`,
  inputSchema: z.object({ ... }),
  experimental_strict: true, // AI SDK 6 syntax — verificar docs exactos
});
```

**Nota**: Si Gemini no soporta strict mode, el flag se ignora silentemente. No hay downside.

**Archivos a modificar**:
- `src/lib/ai/tools.ts` — agregar strict a las 3 tools

#### 1.4 Limpiar schema doc (conservador — NO agresivo)

**Problema**: El schema doc tiene 329 lineas + 10 query examples. Son muchos tokens, pero los examples son few-shot que ayudan al LLM a generar SQL correcto.

**Solucion CONSERVADORA** (no sacrificar exactitud):
- Eliminar solo columnas metadata que el LLM no usa: `source_file`, `loaded_at`, `row_hash`
- Mantener TODOS los 10 query examples (son few-shot criticos para exactitud)
- Compactar formato de dimensiones (tabla unica en vez de secciones separadas)
- NO mover ni eliminar ejemplos complejos (comparaciones inter-anio, IPC, etc.)

**Target**: de ~329 lineas a ~260 lineas (~20% reduccion, conservadora)

**Archivos a modificar**:
- `schema/presupuesto-nacion.md` — limpiar metadata, compactar formato
- `src/lib/ai/prompts.ts` — sin cambios (sigue inyectando schema completo)

#### 1.5 Code-splitting charts + React.memo + disable animations

**Problema**: Nivo + framer-motion se cargan completos. Charts se re-renderizan durante streaming.

**Solucion A — Dynamic imports**:

```typescript
// En src/components/dashboard/dashboard-panel.tsx o tool-ui-renderer.tsx
import dynamic from "next/dynamic";

const BudgetBar = dynamic(() => import("@/components/charts/budget-bar"), { ssr: false });
const BudgetSankey = dynamic(() => import("@/components/charts/budget-sankey"), { ssr: false });
const BudgetTreemap = dynamic(() => import("@/components/charts/budget-treemap"), { ssr: false });
const BudgetLine = dynamic(() => import("@/components/charts/budget-line"), { ssr: false });
const BudgetPie = dynamic(() => import("@/components/charts/budget-pie"), { ssr: false });
```

**Solucion B — React.memo en cada chart**:

```typescript
// En cada archivo src/components/charts/budget-*.tsx
function BudgetBarInner({ data, config }: Props) { /* ... */ }
export default React.memo(BudgetBarInner);
```

**Solucion C — Disable animations**:

```typescript
// En cada chart Nivo
<ResponsiveBar
  animate={false}
  // ... rest of props
/>
```

**Archivos a modificar**:
- `src/components/dashboard/dashboard-panel.tsx` — dynamic imports
- `src/components/charts/budget-bar.tsx` — memo + animate={false}
- `src/components/charts/budget-sankey.tsx` — memo + animate={false}
- `src/components/charts/budget-treemap.tsx` — memo + animate={false}
- `src/components/charts/budget-line.tsx` — memo (si existe)
- `src/components/charts/budget-pie.tsx` — memo (si existe)

---

### Fase 2: Arquitectura para Exactitud (semana 2)

> Cambios que requieren mas codigo. El objetivo es que el agente obtenga
> datos completos y correctos, no solo que sea rapido.

#### 2.1 Tool `planQueries` — datos completos de una vez

**Problema**: Preguntas complejas hacen 2-3 `executeSQL` secuenciales. En cada paso el LLM puede perder contexto de lo que busca, generando comparaciones incompletas o datos inconsistentes.

**Solucion**: 4ta tool que acepta un array de queries y las ejecuta con `Promise.all`. El beneficio principal es **exactitud**: el LLM planifica todas las queries necesarias de una vez, asegurando que tiene todos los datos antes de generar el dashboard.

**Archivo**: `src/lib/ai/tools.ts`

```typescript
export const planQueries = tool({
  description: `Planifica y ejecuta multiples queries SQL en paralelo.
Usa esta tool cuando necesites datos de 2 o mas consultas distintas para responder
(ej: comparar anios, cruzar dimensiones).
Es mas eficiente que llamar executeSQL multiples veces.
Cada query debe ser SELECT valida y tener un label descriptivo.`,
  inputSchema: z.object({
    queries: z.array(z.object({
      query: z.string().describe("Query SQL SELECT valida"),
      label: z.string().describe("Nombre descriptivo del resultado"),
    })).min(2).max(5),
  }),
  execute: async ({ queries }) => {
    const supabase = createServerSupabaseClient();

    // Validar todas las queries primero
    for (const q of queries) {
      const norm = q.query.trim().toUpperCase();
      if (!norm.startsWith("SELECT") && !norm.startsWith("WITH")) {
        return { error: `Query "${q.label}": solo SELECT/WITH permitidas.` };
      }
      if (/\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\b/i.test(q.query)) {
        return { error: `Query "${q.label}": contiene comandos no permitidos.` };
      }
    }

    // Ejecutar en paralelo
    const results = await Promise.all(
      queries.map(async (q) => {
        const start = performance.now();
        const { data, error } = await supabase.rpc("execute_readonly_query", {
          sql_query: q.query,
        });
        const rows = Array.isArray(data) ? data : [];
        const warnings: string[] = [];
        if (rows.length === 0) {
          warnings.push("Sin resultados. Verificar filtros.");
        }
        return {
          label: q.label,
          rowCount: rows.length,
          data: rows.slice(0, 200),
          latency_ms: Math.round(performance.now() - start),
          error: error?.message ?? null,
          warnings,
        };
      })
    );

    return { results };
  },
});
```

**Registrar en route.ts**:
```typescript
tools: { executeSQL, planQueries, generateDashboard, rememberFact },
// Total: 4 tools (dentro del limite de 5)
```

**Actualizar prompt**: Agregar instruccion de cuando usar planQueries vs executeSQL.

**Archivos a modificar**:
- `src/lib/ai/tools.ts` — nueva tool
- `src/app/api/chat/route.ts` — registrar
- `src/lib/ai/prompts.ts` — instruir uso

**Impacto**: El agente obtiene todos los datos que necesita en una sola tool call, eliminando el riesgo de generar dashboards con datos parciales. Beneficio secundario: de 3-4 pasos a 2 pasos en preguntas complejas.

#### 2.2 Materialized Views pre-agregadas

**Problema**: Cada query scanea la fact table particionada (~500K filas/anio).

**Solucion**: 3 vistas materializadas. Se crean una vez y se refrescan con el ETL.

**Archivo nuevo**: `etl-codex/sql/02_materialized_views.sql`

```sql
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

-- RLS (lectura publica)
ALTER TABLE mv_gasto_anual_jurisdiccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE mv_serie_mensual ENABLE ROW LEVEL SECURITY;
ALTER TABLE mv_gasto_finalidad_funcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "public_read_mv1" ON mv_gasto_anual_jurisdiccion
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY IF NOT EXISTS "public_read_mv2" ON mv_serie_mensual
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY IF NOT EXISTS "public_read_mv3" ON mv_gasto_finalidad_funcion
  FOR SELECT TO anon, authenticated USING (true);
```

**Documentar en schema doc**:
```markdown
## Vistas Rapidas (pre-agregadas, usar siempre que sea posible)

- `mv_gasto_anual_jurisdiccion`: devengado + vigente por anio y jurisdiccion
- `mv_serie_mensual`: devengado + vigente mensual agregado
- `mv_gasto_finalidad_funcion`: devengado + vigente por finalidad/funcion y anio

Estas vistas son mucho mas rapidas que consultar fact_credito_devengado_mensual directamente.
Usar para: totales por anio, rankings de jurisdicciones, series temporales, analisis funcional.
```

**Archivos a crear/modificar**:
- `etl-codex/sql/02_materialized_views.sql` — nuevo
- `schema/presupuesto-nacion.md` — documentar MVs

#### 2.3 Region co-located

**Problema**: Si Vercel y Supabase estan en regiones distintas, cada RPC suma ~100ms de latencia de red.

**Verificar**:
```bash
# Ver region de Supabase
# Dashboard > Project Settings > General > Region

# Configurar Vercel en misma region
```

**Archivo**: `vercel.json` (crear si no existe)
```json
{
  "regions": ["iad1"]
}
```

**Impacto**: -100-200ms por query si estaban desalineados.

---

### Fase 3: Condicional (solo si la telemetria lo justifica)

> No implementar hasta tener datos de Fase 0. Thresholds para activar:

| Mejora | Activar si... | Complejidad |
|--------|---------------|-------------|
| Golden queries (few-shot desde pgvector) | SQL incorrecto >10% de requests | Media |
| Schema RAG dinamico | TTFT >3s consistentemente | Alta |
| pg-parser AST validation | Deteccion de SQL peligroso en telemetria | Baja |
| Migrar charts a ECharts Canvas | Render time >500ms en >20% de charts | Alta |
| Auto-inject LIMIT en queries | Queries sin LIMIT causan timeouts | Baja |
| Allowlist de tablas/columnas | El agente intenta acceder a tablas fuera de scope | Media |

---

## Listado completo de archivos

### Archivos nuevos (5)
| # | Archivo | Fase | Contenido |
|---|---------|------|-----------|
| 1 | `etl-codex/sql/02_agent_telemetry.sql` | 0 | Tabla agent_telemetry + RLS |
| 2 | `scripts/benchmark-questions.json` | 0 | 10 preguntas de benchmark |
| 3 | `src/lib/chart-utils.ts` | 1 | formatBudgetAmount + validateChartData |
| 4 | `etl-codex/sql/03_materialized_views.sql` | 2 | 3 MVs + indices + RLS |
| 5 | `vercel.json` | 2 | Region co-location (si no existe) |

### Archivos modificados (8)
| # | Archivo | Fase | Cambio |
|---|---------|------|--------|
| 1 | `src/app/api/chat/route.ts` | 0,2 | Telemetria + onStepFinish, planQueries |
| 2 | `src/lib/ai/tools.ts` | 1,2 | Sanity checks, strict mode, planQueries tool |
| 3 | `src/lib/ai/prompts.ts` | 2 | Instrucciones planQueries |
| 4 | `schema/presupuesto-nacion.md` | 1,2 | Limpiar metadata, documentar MVs |
| 5 | `src/components/dashboard/dashboard-panel.tsx` | 1 | Dynamic imports, validateChartData |
| 6 | `src/components/charts/budget-bar.tsx` | 1 | React.memo, animate={false}, formatBudgetAmount |
| 7 | `src/components/charts/budget-sankey.tsx` | 1 | React.memo, animate={false} |
| 8 | `src/components/charts/budget-treemap.tsx` | 1 | React.memo, animate={false} |

---

## Checklist de migracion

### Pre-deploy
- [ ] Crear tabla `agent_telemetry` en Supabase (SQL Editor)
- [ ] Verificar que `onStepFinish` funciona con Gemini en AI SDK 6
- [ ] Verificar que `strict: true` (o `experimental_strict`) no rompe Gemini
- [ ] Testear las 10 preguntas benchmark manualmente — **verificar que los numeros sean correctos**
- [ ] Verificar que charts con `animate={false}` siguen viendose bien
- [ ] Verificar que sanity checks no producen false positives molestos
- [ ] Confirmar que stepCount sigue en 5 (no se redujo)

### Post-deploy
- [ ] Verificar telemetria: al menos 1 fila en `agent_telemetry` despues de 1 pregunta
- [ ] Correr las 10 benchmark questions — priorizar que **respuestas sean correctas**
- [ ] Registrar SQL accuracy (% de queries que devuelven datos esperados)
- [ ] Registrar chart validity (% de charts que renderizan sin error)
- [ ] Verificar que `planQueries` se usa para preguntas complejas
- [ ] Comparar numeros del dashboard contra datos conocidos (cruce manual)

### Rollback
- Si `strict: true` causa errores: remover el flag (sin impacto)
- Si sanity checks confunden al LLM: ajustar wording del warning, no eliminar
- Si `planQueries` no se usa: no pasa nada (el agente elige sus tools)
- Si charts sin animacion se ven mal: restaurar `animate={true}`
- Si chart-utils fallback se activa demasiado: ajustar thresholds de validateChartData

---

## Metricas de exito

> Prioridad 1: Exactitud. Prioridad 2: Latencia.

| Metrica | Actual (estimado) | Target Fase 1 | Target Fase 2 |
|---------|-------------------|---------------|---------------|
| **SQL accuracy** | **desconocida** | **baseline medida** | **>90%** |
| **Charts validos** | **desconocida** | **>95% (no crasheos)** | **>98%** |
| **Numeros correctos** | **desconocida** | **sanity checks activos** | **0 false positives** |
| p50 simple | ~6s | ~5s (no prioridad) | <4s |
| p95 complejo | ~18s | ~15s (no prioridad) | <10s |
| Pasos promedio | ~3.5 | mantener (5 max) | ~2.5 (via planQueries) |
| tokens_input promedio | ~6000 | ~5500 (limpieza leve) | ~5500 |
| stepCount maximo | 5 | **5 (no reducir)** | **5 (no reducir)** |

---

## Fuentes validadas (busqueda web 2026-02-07)

- [AI SDK 6 — ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK 6 — Tool Calling strict mode](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK 6 blog post](https://vercel.com/blog/ai-sdk-6)
- [Supabase — Materialized Views](https://dev.to/kovidr/optimize-read-performance-in-supabase-with-postgres-materialized-views-12k5)
- [Text-to-SQL Production: Semantic Layer](https://medium.com/@kapildevkhatik2/text-to-sql-is-finally-production-ready-building-a-semantic-layer-for-genbi-0127c1127574)
- [pg-parser WASM](https://github.com/supabase-community/pg-parser) — disponible para Fase 3
- [Golden SQLs — Dataherald](https://dataherald.readthedocs.io/en/latest/api.golden_sql.html) — disponible para Fase 3
- [ECharts tree-shaking](https://apache.github.io/echarts-handbook/en/basics/import/) — disponible para Fase 3
- [Top React Chart Libraries 2026](https://dev.to/basecampxd/top-7-react-chart-libraries-for-2026-features-use-cases-and-benchmarks-412c)
- [Supabase Connection Management](https://supabase.com/docs/guides/database/connection-management)
- [Tool Calls Are Expensive](https://reillywood.com/blog/tool-calls-are-expensive-and-finite/)
- [AI Elements (Vercel)](https://vercel.com/changelog/introducing-ai-elements)
