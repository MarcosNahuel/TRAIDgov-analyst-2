# PLAN DE IMPLEMENTACION: TRAIDgov Analyst

> Analista Presupuestario AI - Arquitectura Vercel-Native
> Fecha: 2026-02-06
> Versión: 1.0

---

## 1. Vision y Objetivos

### Qué estamos construyendo

Una plataforma web que permite a cualquier persona hacer preguntas en lenguaje natural sobre el Presupuesto Nacional Argentino y recibir respuestas con visualizaciones interactivas (Sankey, Treemap, barras, tablas).

### Objetivos medibles

| Objetivo | Métrica | Target |
|----------|---------|--------|
| Responder preguntas presupuestarias | Tasa de éxito | >95% |
| Tiempo de respuesta | Latencia P95 | <10 segundos |
| Calidad de SQL generado | Queries sin error | >90% |
| Visualizaciones correctas | Gráficos renderizados sin fallos | >95% |
| Sin infraestructura propia | Deploy | 100% Vercel + Supabase |

### Decisiones de arquitectura tomadas

| Decisión | Opción elegida | Alternativa descartada | Razón |
|----------|---------------|----------------------|-------|
| Backend | Next.js API Routes | FastAPI + Docker | Sin VPS, serverless puro |
| SQL | LLM genera SQL libre | Allowlist predefinido | Flexibilidad total (patrón Vercel) |
| Charts | Nivo | Recharts | Sankey nativo para flujos de dinero |
| Dataset | Presupuesto Nación (star schema) | Mendoza (tabla plana) | Más impactante como demo GovTech |
| Agente | 2 tools (executeSQL + generateVisual) | Multi-agente LangGraph | Principio "minimal agent" |
| Deploy | 100% Vercel | Vercel + EasyPanel | Eliminar dependencia de VPS |

---

## 2. Arquitectura

### Diagrama de alto nivel

```
┌──────────────────────────────────────────────────────────────────┐
│                         VERCEL (Edge + Serverless)                │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  app/api/chat/route.ts                                    │    │
│  │                                                            │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │            AI SDK 5.0 (streamText)                  │   │    │
│  │  │                                                      │   │    │
│  │  │  Context:                                            │   │    │
│  │  │    schema/presupuesto-nacion.md (inyectado)          │   │    │
│  │  │                                                      │   │    │
│  │  │  Tools:                                              │   │    │
│  │  │    ┌─────────────┐  ┌──────────────────┐            │   │    │
│  │  │    │ executeSQL   │  │ generateVisual    │            │   │    │
│  │  │    │ → Supabase   │  │ → Zod → Nivo JSON │            │   │    │
│  │  │    └─────────────┘  └──────────────────┘            │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  app/page.tsx (Client)                                    │    │
│  │                                                            │    │
│  │  useChat() → Tool Invocations → Generative UI            │    │
│  │                                                            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ Sankey   │ │ Treemap  │ │ BarChart │ │ Table    │    │    │
│  │  │ (Nivo)   │ │ (Nivo)   │ │ (Nivo)   │ │ (custom) │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL + pgvector)                │
│                                                                    │
│  ┌────────────────────────────────┐  ┌───────────────────────┐   │
│  │  presupuesto_nacion_2024       │  │  golden_artifacts      │   │
│  │  (fact table, 476K rows)       │  │  (cache semántico)     │   │
│  │                                │  │  embedding VECTOR(1536)│   │
│  ├────────────────────────────────┤  └───────────────────────┘   │
│  │  dim_jurisdiccion (23)         │  ┌───────────────────────┐   │
│  │  dim_programa                  │  │  chat_sessions         │   │
│  │  dim_inciso (8)                │  │  (historial)           │   │
│  │  dim_finalidad (6)             │  └───────────────────────┘   │
│  │  dim_funcion (30)              │                               │
│  │  + 14 dimensiones más          │                               │
│  └────────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de una consulta

```
Usuario: "Cuánto gastó el Ministerio de Salud en 2024?"
    │
    ▼
[1] app/api/chat/route.ts
    │  - Lee schema/presupuesto-nacion.md
    │  - Inyecta como system prompt context
    │  - Llama streamText() con 2 tools
    │
    ▼
[2] LLM (Claude Sonnet / Gemini Flash)
    │  - Lee el schema doc en context
    │  - Decide: necesita datos → tool executeSQL
    │  - Genera:
    │    SELECT j.jurisdiccion_desc,
    │           SUM(h.credito_devengado) AS total_devengado,
    │           SUM(h.credito_vigente) AS total_vigente
    │    FROM presupuesto_nacion_2024 h
    │    JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
    │    WHERE unaccent(LOWER(j.jurisdiccion_desc)) LIKE '%salud%'
    │    GROUP BY j.jurisdiccion_desc;
    │
    ▼
[3] Tool: executeSQL
    │  - Ejecuta en Supabase (read-only role)
    │  - Retorna: [{ jurisdiccion_desc: "Min. Salud", total_devengado: 5234.5, ... }]
    │
    ▼
[4] LLM decide: quiere visualizar → tool generateVisual
    │  - Genera config Nivo validada con Zod:
    │    { chartType: "bar", data: [...], title: "Ejecución Min. Salud 2024" }
    │
    ▼
[5] Client: useChat() recibe toolInvocation
    │  - tool === "generateVisual" → renderiza <BudgetBar data={result} />
    │  - Texto streaming: "El Ministerio de Salud devengó $5.234M..."
    │
    ▼
[6] Usuario ve: gráfico interactivo + narrativa
```

---

## 3. Fases de Implementación

### FASE 0: Setup del Proyecto (Día 1)

**Objetivo:** Proyecto Next.js 16 funcionando con todas las dependencias.

| Tarea | Detalle |
|-------|---------|
| 0.1 | `npx create-next-app@latest TRAIDgov-analyst --ts --tailwind --app --src-dir` |
| 0.2 | Instalar dependencias: `ai @ai-sdk/anthropic @ai-sdk/google @supabase/ssr @supabase/supabase-js @nivo/sankey @nivo/treemap @nivo/bar @nivo/core zod framer-motion` |
| 0.3 | Instalar Shadcn/UI: `npx shadcn@latest init` + componentes base (Card, Button, Input, Dialog) |
| 0.4 | Configurar `.env.local` con keys de Supabase y LLM |
| 0.5 | Mover `.mcp.json` y `.claude/` ya creados |
| 0.6 | Configurar `next.config.ts` con `cacheComponents: true` |
| 0.7 | Inicializar git: `git init && git add . && git commit -m "Initial setup"` |

**Verificación:**
```
✓ npm run dev → localhost:3000 funciona
✓ Tailwind renderiza correctamente
✓ Shadcn components disponibles
```

---

### FASE 1: Datos — ETL y Supabase (Días 2-3)

**Objetivo:** Star schema cargado en Supabase con datos del Presupuesto Nacional.

| Tarea | Detalle |
|-------|---------|
| 1.1 | Crear proyecto Supabase (o reutilizar existente) |
| 1.2 | Habilitar extensiones: `pgvector`, `pg_trgm`, `unaccent` |
| 1.3 | Crear schema SQL: tabla de hechos + 19 dimensiones (copiar de ETL existente `agente nacion.py`) |
| 1.4 | Crear read-only role: `CREATE ROLE analyst_readonly WITH LOGIN PASSWORD '...'; GRANT SELECT ON ALL TABLES...` |
| 1.5 | Adaptar script ETL a TypeScript: `scripts/seed-database.ts` (descargar ZIP MECON → parsear CSV → upsert Supabase) |
| 1.6 | Crear índices compuestos para queries rápidas |
| 1.7 | Crear tabla `golden_artifacts` con pgvector |
| 1.8 | Crear tabla `chat_sessions` para historial |
| 1.9 | Configurar RLS policies (read-only para anon) |
| 1.10 | Ejecutar seed y verificar datos |

**Schema SQL clave:**

```sql
-- Extensiones
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Tabla de hechos (desnormalizada para velocidad analítica)
CREATE TABLE presupuesto_nacion_2024 (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ejercicio_presupuestario INTEGER,
    impacto_presupuestario_mes INTEGER,
    jurisdiccion_id TEXT,
    programa_id TEXT,
    actividad_id TEXT,
    inciso_id TEXT,
    finalidad_id TEXT,
    funcion_id TEXT,
    fuente_financiamiento_id TEXT,
    ubicacion_geografica_id TEXT,
    credito_presupuestado NUMERIC(20, 2),
    credito_vigente NUMERIC(20, 2),
    credito_comprometido NUMERIC(20, 2),
    credito_devengado NUMERIC(20, 2),
    credito_pagado NUMERIC(20, 2),
    ultima_actualizacion_fecha TIMESTAMPTZ,
    source_file TEXT
);

-- Índices
CREATE INDEX idx_presup_agg ON presupuesto_nacion_2024
    (ejercicio_presupuestario, jurisdiccion_id, programa_id, inciso_id);
CREATE INDEX idx_presup_mes ON presupuesto_nacion_2024
    (impacto_presupuestario_mes);

-- Dimensiones (ejemplo)
CREATE TABLE dim_jurisdiccion (
    id_unico TEXT PRIMARY KEY,
    jurisdiccion_id TEXT NOT NULL,
    jurisdiccion_desc TEXT NOT NULL
);

-- Golden Artifacts (cache semántico)
CREATE TABLE golden_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_query TEXT NOT NULL,
    chart_type TEXT NOT NULL,
    chart_config JSONB NOT NULL,
    sql_query TEXT,
    validation_score FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(1536)
);
```

**Fuente de datos:**
- URL: `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-mensual-2024.zip`
- Alternativa API: `https://www.presupuestoabierto.gob.ar/api/v1/credito`

**Verificación:**
```
✓ SELECT count(*) FROM presupuesto_nacion_2024 → ~476,000
✓ SELECT count(*) FROM dim_jurisdiccion → 23
✓ Query de prueba con JOIN → resultados correctos
✓ RLS policy activa → anon solo puede SELECT
```

---

### FASE 2: Schema Doc — La "Única Herramienta que Importa" (Día 3)

**Objetivo:** Archivo `schema/presupuesto-nacion.md` que el LLM pueda leer para generar SQL correcto.

| Tarea | Detalle |
|-------|---------|
| 2.1 | Documentar tabla de hechos con todos los campos y tipos |
| 2.2 | Documentar las 19 dimensiones con sus JOINs |
| 2.3 | Escribir glosario presupuestario (vigente vs devengado vs pagado) |
| 2.4 | Incluir reglas de negocio (montos en millones, unaccent para filtros) |
| 2.5 | Agregar 10-15 queries de ejemplo (las que más se preguntan) |
| 2.6 | Documentar indicadores derivados (subejecución, deuda flotante) |
| 2.7 | Agregar jerarquías dimensionales (administrativa, programática, funcional, económica) |

**Estructura del archivo:**

```markdown
# Schema: Presupuesto Nacional Argentina 2024

## Tabla de Hechos
[campos, tipos, descripciones]

## Dimensiones
[cada dimensión con su JOIN key]

## Jerarquías
[4 jerarquías: administrativa, programática, funcional, económica]

## Glosario de Negocio
[definiciones de cada métrica]

## Indicadores Derivados
[subejecución, deuda flotante, etc.]

## Reglas SQL
[unaccent, comillas dobles, montos en millones]

## Queries de Ejemplo
[10-15 queries frecuentes con resultado esperado]
```

**Verificación:**
```
✓ Schema doc tiene < 3000 tokens (eficiente para context)
✓ Cada dimensión tiene su JOIN documentado
✓ Queries de ejemplo ejecutan correctamente en Supabase
```

---

### FASE 3: El Cerebro — API Route + AI SDK (Días 4-5)

**Objetivo:** `/api/chat` funcionando con streaming y 2 tools.

| Tarea | Detalle |
|-------|---------|
| 3.1 | Crear `src/lib/db/supabase.ts` — cliente Supabase SSR con `@supabase/ssr` |
| 3.2 | Crear `src/lib/ai/tools.ts` — definir 2 tools con Zod schemas |
| 3.3 | Crear `src/lib/ai/prompts.ts` — system prompt + inyección de schema doc |
| 3.4 | Crear `src/app/api/chat/route.ts` — endpoint principal con `streamText()` |
| 3.5 | Implementar tool `executeSQL`: validar que sea SELECT, ejecutar en Supabase, retornar JSON |
| 3.6 | Implementar tool `generateVisual`: Zod schema para Nivo config (sankey, treemap, bar) |
| 3.7 | Agregar retry con feedback: si SQL falla, el error se pasa al LLM para que corrija |
| 3.8 | Configurar multi-provider: Anthropic (primario) + Google (fallback) |

**Código clave — `tools.ts`:**

```typescript
import { z } from 'zod';
import { tool } from 'ai';

export const executeSQL = tool({
  description: 'Ejecuta una query SQL SELECT en la base de presupuesto nacional',
  parameters: z.object({
    query: z.string().describe('Query SQL SELECT válida'),
    explanation: z.string().describe('Explicación breve de qué busca esta query'),
  }),
  execute: async ({ query }) => {
    // Validar que sea SELECT
    // Ejecutar en Supabase con read-only role
    // Retornar resultados como JSON
  },
});

export const generateVisual = tool({
  description: 'Genera configuración para un gráfico Nivo',
  parameters: z.object({
    chartType: z.enum(['sankey', 'treemap', 'bar', 'line', 'heatmap']),
    title: z.string(),
    description: z.string(),
    data: z.any(), // Payload específico de Nivo
  }),
});
```

**Código clave — `route.ts`:**

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { executeSQL, generateVisual } from '@/lib/ai/tools';
import { getSystemPrompt } from '@/lib/ai/prompts';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: getSystemPrompt(), // Incluye schema doc
    messages,
    tools: { executeSQL, generateVisual },
    maxSteps: 5, // Permite multi-turn (query → visualizar)
  });

  return result.toDataStreamResponse();
}
```

**Verificación:**
```
✓ POST /api/chat con "Cuánto gastó Salud?" → SQL correcto
✓ Streaming funciona (texto progresivo)
✓ Tool executeSQL retorna datos
✓ Tool generateVisual retorna config Nivo válida
✓ Si SQL falla, el LLM recibe el error y corrige
```

---

### FASE 4: UI — Chat + Generative UI + Nivo (Días 6-8)

**Objetivo:** Interfaz conversacional con gráficos interactivos.

| Tarea | Detalle |
|-------|---------|
| 4.1 | Crear `src/app/page.tsx` — Layout principal (chat + panel de resultados) |
| 4.2 | Implementar `useChat()` de `@ai-sdk/react` |
| 4.3 | Crear `components/ai/message-list.tsx` — Renderizado de mensajes |
| 4.4 | Crear `components/ai/tool-ui-renderer.tsx` — Switch de toolInvocations |
| 4.5 | Crear `components/charts/budget-sankey.tsx` — Wrapper de `@nivo/sankey` |
| 4.6 | Crear `components/charts/budget-treemap.tsx` — Wrapper de `@nivo/treemap` |
| 4.7 | Crear `components/charts/budget-bar.tsx` — Wrapper de `@nivo/bar` |
| 4.8 | Crear `components/ui/data-table.tsx` — Tabla de resultados SQL |
| 4.9 | Crear `components/ui/kpi-card.tsx` — Tarjetas de métricas |
| 4.10 | Agregar Framer Motion para animaciones de entrada |
| 4.11 | Agregar preguntas sugeridas (hero section) |
| 4.12 | Dark mode con colores TRAID (#7c3aed púrpura, #db2777 rosa) |

**Patrón Generative UI via Tool Invocations:**

```tsx
// tool-ui-renderer.tsx
export function ToolUIRenderer({ toolInvocation }) {
  const { toolName, state, result } = toolInvocation;

  if (state !== 'result') return <LoadingSkeleton />;

  switch (toolName) {
    case 'executeSQL':
      return <DataTable data={result} />;
    case 'generateVisual':
      switch (result.chartType) {
        case 'sankey': return <BudgetSankey {...result} />;
        case 'treemap': return <BudgetTreemap {...result} />;
        case 'bar': return <BudgetBar {...result} />;
        default: return <DataTable data={result.data} />;
      }
    default:
      return null;
  }
}
```

**Verificación:**
```
✓ Chat funciona con streaming de texto
✓ Tool invocations renderizan gráficos Nivo
✓ Sankey muestra flujos de dinero correctamente
✓ Treemap muestra jerarquías de gasto
✓ Responsive (mobile + desktop)
✓ Animaciones suaves
✓ Preguntas sugeridas funcionan
```

---

### FASE 5: Polish y Features Avanzadas (Días 9-10)

| Tarea | Detalle |
|-------|---------|
| 5.1 | Historial de conversaciones (Supabase `chat_sessions`) |
| 5.2 | Golden Artifacts: guardar queries exitosas con embedding pgvector |
| 5.3 | Cache Components de Next.js 16 (`"use cache"`) para schema doc |
| 5.4 | Error handling visual (mensajes de error amigables) |
| 5.5 | Loading states con skeletons animados |
| 5.6 | Export a PNG de gráficos (html2canvas) |
| 5.7 | SEO y metadata para Open Graph |
| 5.8 | Branding TRAID GOV (logo, favicon, colores) |

---

### FASE 6: Deploy y Testing (Días 11-12)

| Tarea | Detalle |
|-------|---------|
| 6.1 | Deploy a Vercel: `vercel --prod` |
| 6.2 | Configurar variables de entorno en Vercel Dashboard |
| 6.3 | Configurar dominio personalizado (si aplica) |
| 6.4 | Test con 20 preguntas frecuentes sobre presupuesto |
| 6.5 | Test de edge cases: preguntas ambiguas, SQL complejo, gráficos grandes |
| 6.6 | Medir latencia P50/P95 |
| 6.7 | Documentar resultados en `docs/TESTING_RESULTS.md` |

**Batería de preguntas de testing:**

```
1. "Cuánto gastó el Ministerio de Salud en 2024?"
2. "Mostrame el flujo de fondos desde Tesoro Nacional hacia ministerios" (→ Sankey)
3. "Qué jurisdicción tiene mayor subejecución?"
4. "Comparame gastos en personal vs bienes de capital"
5. "Evolución mensual del gasto total"
6. "Top 10 programas con mayor ejecución presupuestaria"
7. "Cuánto se destinó a educación vs defensa?"
8. "Cuál es la deuda flotante actual?" (vigente - pagado)
9. "Mostrame la distribución del gasto por finalidad" (→ Treemap)
10. "Cuánto representa cada fuente de financiamiento?"
```

**Verificación:**
```
✓ Deploy exitoso en Vercel
✓ 18/20 preguntas respondidas correctamente (>90%)
✓ Latencia P95 < 10 segundos
✓ Gráficos renderizan sin errores
✓ Mobile responsive
```

---

## 4. Dependencias entre Fases

```
FASE 0 (Setup)
    │
    ▼
FASE 1 (Datos) ──────► FASE 2 (Schema Doc)
    │                        │
    └────────────┬───────────┘
                 ▼
           FASE 3 (API + AI)
                 │
                 ▼
           FASE 4 (UI + Nivo)
                 │
                 ▼
           FASE 5 (Polish)
                 │
                 ▼
           FASE 6 (Deploy + Test)
```

---

## 5. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| SQL injection via LLM | Media | Alto | Read-only role, statement_timeout, RLS |
| Alucinación de tablas/columnas | Baja | Medio | Schema doc exhaustivo, retry con error feedback |
| Timeout en Vercel (30s) | Media | Alto | Índices compuestos, LIMIT en queries, streaming |
| Nivo Sankey con datos mal formateados | Media | Medio | Validación Zod estricta, defensive rendering |
| Costo de API LLM | Baja | Bajo | Cache de Golden Artifacts, Gemini Flash como fallback |
| CSV de MECON cambia formato | Baja | Alto | Validación en ETL, alertas de schema drift |

---

## 6. Stack Final

```
┌─────────────────────────────────────────────────┐
│ FRONTEND                                         │
│ Next.js 16 + React 19.2 + Tailwind 4.0          │
│ Nivo (Sankey, Treemap, Bar)                      │
│ Shadcn/UI + Framer Motion                        │
│ AI SDK 5.0 (useChat)                             │
├─────────────────────────────────────────────────┤
│ BACKEND (API Routes)                             │
│ AI SDK 5.0 (streamText)                          │
│ Zod (validación de tools)                        │
│ @supabase/ssr (cliente DB)                       │
├─────────────────────────────────────────────────┤
│ LLM                                              │
│ Claude Sonnet 4.5 (primario)                     │
│ Gemini 2.0 Flash (fallback)                      │
├─────────────────────────────────────────────────┤
│ DATA                                             │
│ Supabase (PostgreSQL + pgvector + RLS)           │
│ Star Schema: 1 fact + 19 dimensions              │
│ ETL: TypeScript (descarga MECON → Supabase)      │
├─────────────────────────────────────────────────┤
│ DEPLOY                                           │
│ Vercel (100% serverless)                         │
│ Sin VPS, sin Docker, sin EasyPanel               │
└─────────────────────────────────────────────────┘
```

---

## 7. Evolución Futura (Post-MVP)

| Feature | Prioridad | Complejidad |
|---------|-----------|-------------|
| Multi-año (2020-2024) | Alta | Media |
| Presupuesto provincial (Mendoza) | Alta | Baja (ya existe data) |
| Voice agent (atención telefónica) | Media | Alta |
| Comparación entre jurisdicciones | Alta | Baja |
| Alertas de subejecución | Media | Media |
| API pública para terceros | Baja | Media |
| Golden Loop (validación visual automática) | Baja | Alta |
| Multi-idioma (English) | Baja | Baja |

---

*Plan generado el 2026-02-06. Basado en: brainstorming TRAID GOV, paper Vercel "80% tools removed", Next.js 16, SQL-AGENT-NEW, n8n workflow analista.*
