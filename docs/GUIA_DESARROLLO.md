# GUIA COMPLETA DE DESARROLLO: TRAIDgov Analyst

> Desde la investigación de endpoints hasta código y testing
> Fecha: 2026-02-06 | Versión: 1.0

---

## Indice

1. [Investigación: Fuentes de Datos Presupuestarios](#1-investigación-fuentes-de-datos-presupuestarios)
2. [ETL: Pipeline de Datos](#2-etl-pipeline-de-datos)
3. [Base de Datos: Supabase + Star Schema](#3-base-de-datos-supabase--star-schema)
4. [Schema Doc: Contexto para el LLM](#4-schema-doc-contexto-para-el-llm)
5. [Backend: API Route + AI SDK](#5-backend-api-route--ai-sdk)
6. [Frontend: Chat + Generative UI + Nivo](#6-frontend-chat--generative-ui--nivo)
7. [Testing y Validación](#7-testing-y-validación)
8. [Deploy en Vercel](#8-deploy-en-vercel)
9. [Lecciones Aprendidas de SQL-AGENT-NEW](#9-lecciones-aprendidas-de-sql-agent-new)
10. [Referencias](#10-referencias)

---

## 1. Investigación: Fuentes de Datos Presupuestarios

### 1.1 Portal Presupuesto Abierto

**URL principal:** https://www.presupuestoabierto.gob.ar/

El portal del Ministerio de Economía expone datos del presupuesto nacional en dos formatos:

#### API REST

**Base URL:** `https://www.presupuestoabierto.gob.ar/api/v1/`

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/v1/credito` | GET | Crédito presupuestario (vigente, devengado, pagado) |
| `/api/v1/programacion_fisica` | GET | Metas físicas de programas |
| `/api/v1/recurso` | GET | Recursos (ingresos) |

**Parámetros comunes:**

| Parámetro | Tipo | Ejemplo | Descripción |
|-----------|------|---------|-------------|
| `ejercicio` | int | 2024 | Año fiscal |
| `jurisdiccion_id` | int | 80 | ID del ministerio |
| `programa_id` | int | 1 | ID del programa |
| `inciso_id` | int | 1 | Tipo de gasto |
| `fuente_financiamiento_id` | int | 11 | Fuente de fondos |

**Ejemplo de request:**
```bash
curl "https://www.presupuestoabierto.gob.ar/api/v1/credito?ejercicio=2024&jurisdiccion_id=80"
```

**Limitaciones conocidas:**
- Rate limiting (no documentado oficialmente)
- Optimizada para consultas específicas, NO para agregaciones masivas
- Puede tener retraso de días/semanas vs. datos oficiales
- No tiene endpoint de "última actualización"

**Documentación API:** https://presupuesto-abierto.argentina.apidocs.ar/

#### Datasets Masivos (CSV/ZIP)

**Portal:** https://datos.gob.ar/

**URL de descarga directa:**
```
https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/{AÑO}/credito-mensual-{AÑO}.zip
```

**Ejemplo:**
```
https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-mensual-2024.zip
```

**Contenido del ZIP:**
- 1 archivo CSV (~445 MB para 2024)
- ~476,000 registros (mensualizado)
- 57 columnas

**Ventajas sobre API:**
- Datos atómicos completos
- Permite modelado dimensional
- Sin rate limiting
- Descarga única, procesamiento local

**Desventajas:**
- Puede tener 1-2 semanas de retraso
- Formato puede variar entre años
- Encoding mixto (UTF-8 / Latin-1)

### 1.2 Estructura de los Datos

El CSV de crédito mensual contiene 57 columnas organizadas en jerarquías:

#### Jerarquía Administrativa (8 niveles)

```
sector (2)
  └─ subsector
      └─ caracter (4: Admin Central, Organismos Descentralizados, etc.)
          └─ jurisdiccion (23 ministerios/poderes)
              └─ subjurisdiccion
                  └─ entidad
                      └─ servicio (742)
                          └─ unidad_ejecutora
```

#### Jerarquía Programática (5 niveles)

```
programa
  └─ subprograma
      └─ proyecto
          └─ actividad (742)
              └─ obra
```

#### Jerarquía Funcional (2 niveles)

```
finalidad (6: Administración, Servicios Sociales, etc.)
  └─ funcion (30: Educación, Salud, Defensa, etc.)
```

#### Clasificador Económico (4 niveles)

```
inciso (8: Gastos en Personal, Bienes de Consumo, etc.)
  └─ principal
      └─ parcial
          └─ subparcial
              └─ clasificador_economico_8_digitos
```

#### Métricas Financieras

| Campo | Concepto | Significado |
|-------|----------|-------------|
| `credito_presupuestado` | Presupuesto Inicial | Aprobado por Congreso (Ley de Presupuesto) |
| `credito_vigente` | Presupuesto Actual | Inicial + modificaciones (DNU, Decisiones Administrativas) |
| `credito_comprometido` | Comprometido | Reserva de crédito por contrato/orden de compra |
| `credito_devengado` | Devengado | Obligación de pago (bien/servicio recibido) |
| `credito_pagado` | Pagado | Salida efectiva de fondos del Tesoro |

#### Indicadores Derivados

| Indicador | Fórmula | Significado |
|-----------|---------|-------------|
| **Subejecución** | `1 - (devengado / vigente)` | % de presupuesto no ejecutado. Señal política. |
| **Deuda Flotante** | `devengado - pagado` | Obligaciones no pagadas. Estrés financiero. |
| **Modificación presupuestaria** | `vigente - presupuestado` | Cuánto cambió el presupuesto vs. ley original. |
| **Tasa de compromiso** | `comprometido / vigente` | % del presupuesto ya comprometido. |

### 1.3 Glosario Presupuestario

**Fuente oficial:** https://www.presupuestoabierto.gob.ar/sici/pdf/glosario.pdf

| Término | Definición |
|---------|------------|
| **Ejercicio** | Año fiscal (enero-diciembre) |
| **Jurisdicción** | Unidad de mayor nivel (Ministerio, Poder, etc.) |
| **Programa** | Unidad operativa que produce bienes/servicios |
| **Inciso** | Clasificador económico del gasto |
| **Fuente de financiamiento** | Origen de los fondos (Tesoro, Crédito Externo, etc.) |
| **Devengado** | Momento en que nace la obligación de pago |
| **DNU** | Decreto de Necesidad y Urgencia (modifica presupuesto) |

---

## 2. ETL: Pipeline de Datos

### 2.1 Proceso de Extracción

El ETL existente (Python, `agente nacion.py`) sigue estos pasos:

```
1. DOWNLOAD
   URL: https://dgsiaf-repo.mecon.gob.ar/.../credito-mensual-2024.zip
   → Descargar ZIP (~100 MB comprimido)
   → Extraer CSV (~445 MB)

2. PARSE
   → Leer CSV con pandas (low_memory=False)
   → Detectar encoding (UTF-8 o Latin-1)
   → Identificar 57 columnas

3. TRANSFORM
   → Generar IDs únicos: concatenación de columnas clave
   → Separar en 19 DataFrames de dimensiones (drop_duplicates)
   → Preparar DataFrame de hechos

4. LOAD
   → Cargar dimensiones en ORDEN JERÁRQUICO (respetar FKs)
   → Upsert con on_conflict para idempotencia
   → Cargar tabla de hechos en batches de 100
   → Limpiar archivos temporales
```

### 2.2 Orden de Carga de Dimensiones (CRITICO)

Las dimensiones deben cargarse en orden jerárquico para respetar foreign keys:

```python
TABLAS_DIMENSIONES = [
    # 1. Clasificador económico (de padre a hijo)
    ('dim_inciso', ['inciso_id', 'inciso_desc']),
    ('dim_principal', ['inciso_id', 'principal_id', 'principal_desc']),
    ('dim_parcial', ['principal_id', 'parcial_id', 'parcial_desc']),
    ('dim_subparcial', ['parcial_id', 'subparcial_id', 'subparcial_desc']),

    # 2. Estructura administrativa
    ('dim_jurisdiccion', ['jurisdiccion_id', 'jurisdiccion_desc']),
    ('dim_subjurisdiccion', ['jurisdiccion_id', 'subjurisdiccion_id', '...']),
    ('dim_entidad', ['subjurisdiccion_id', 'entidad_id', 'entidad_desc']),
    ('dim_servicio', ['entidad_id', 'servicio_id', 'servicio_desc']),

    # 3. Estructura programática
    ('dim_programa', ['servicio_id', 'programa_id', 'programa_desc']),
    ('dim_subprograma', ['programa_id', 'subprograma_id', '...']),
    ('dim_proyecto', ['subprograma_id', 'proyecto_id', '...']),
    ('dim_actividad', ['proyecto_id', 'actividad_id', '...']),
    ('dim_obra', ['actividad_id', 'obra_id', 'obra_desc']),

    # 4. Estructura funcional
    ('dim_finalidad', ['finalidad_id', 'finalidad_desc']),
    ('dim_funcion', ['finalidad_id', 'funcion_id', 'funcion_desc']),
]
```

### 2.3 Adaptación a TypeScript (Next.js)

Para el nuevo proyecto, el ETL se escribe en TypeScript como un script standalone:

```typescript
// scripts/seed-database.ts
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function downloadAndExtract(year: number): Promise<string> {
  const url = `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/${year}/credito-mensual-${year}.zip`;
  // Descargar ZIP, extraer CSV, retornar path
}

async function loadDimension(tableName: string, columns: string[], rows: any[]) {
  // Dedup por columns[0] (ID)
  // Upsert en batches de 100
  const { error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: 'id_unico' });
}

async function seedDatabase() {
  const csvPath = await downloadAndExtract(2024);
  // Parsear CSV
  // Cargar dimensiones en orden
  // Cargar tabla de hechos
}

seedDatabase();
```

**Ejecución:**
```bash
npx tsx scripts/seed-database.ts
```

---

## 3. Base de Datos: Supabase + Star Schema

### 3.1 Configuración Inicial de Supabase

```bash
# Crear proyecto en https://supabase.com/dashboard
# O usar CLI:
npx supabase init
npx supabase start  # local
```

**Extensiones requeridas (ejecutar en SQL Editor):**

```sql
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector para embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- Búsqueda por trigramas
CREATE EXTENSION IF NOT EXISTS unaccent;    -- Normalización de acentos
```

### 3.2 Read-Only Role (SEGURIDAD)

```sql
-- Crear rol de solo lectura para el agente
CREATE ROLE analyst_readonly WITH LOGIN PASSWORD 'secure_password_here';

-- Permisos solo SELECT
GRANT USAGE ON SCHEMA public TO analyst_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analyst_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analyst_readonly;

-- Timeout para queries (evitar long-running)
ALTER ROLE analyst_readonly SET statement_timeout = '15000';  -- 15 segundos
```

### 3.3 Row Level Security (RLS)

```sql
-- Habilitar RLS en tabla de hechos
ALTER TABLE presupuesto_nacion_2024 ENABLE ROW LEVEL SECURITY;

-- Policy: todos pueden leer (datos públicos)
CREATE POLICY "Datos presupuestarios son públicos"
ON presupuesto_nacion_2024
FOR SELECT
TO authenticated, anon
USING (true);

-- Repetir para cada dimensión
```

### 3.4 Índices para Performance

```sql
-- Índice compuesto para las agregaciones más frecuentes
CREATE INDEX idx_presup_jurisdiccion_mes
ON presupuesto_nacion_2024 (ejercicio_presupuestario, jurisdiccion_id, impacto_presupuestario_mes);

-- Índice para búsqueda por programa
CREATE INDEX idx_presup_programa
ON presupuesto_nacion_2024 (programa_id, inciso_id);

-- Índice para búsqueda por finalidad/función
CREATE INDEX idx_presup_funcional
ON presupuesto_nacion_2024 (finalidad_id, funcion_id);

-- Full text search en dimensiones
CREATE INDEX idx_jurisdiccion_text
ON dim_jurisdiccion USING GIN (to_tsvector('spanish', jurisdiccion_desc));
```

### 3.5 Tablas Auxiliares

```sql
-- Historial de conversaciones
CREATE TABLE chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Golden Artifacts (cache de queries exitosas)
CREATE TABLE golden_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_query TEXT NOT NULL,
    sql_query TEXT NOT NULL,
    chart_type TEXT,
    chart_config JSONB,
    result_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(1536)
);

-- Función de búsqueda semántica
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
```

---

## 4. Schema Doc: Contexto para el LLM

### 4.1 Filosofía (Paper Vercel)

En vez de crear tools especializadas para schema lookup, le damos al LLM el schema completo como contexto. El archivo `schema/presupuesto-nacion.md` se inyecta en el system prompt.

**Referencia:** [We Removed 80% of Our Agent's Tools](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools)

> "The files contain dimension definitions, measure calculations, and join relationships."
> "The model makes better choices when we stop making choices for it."

### 4.2 Estructura del Schema Doc

El archivo `schema/presupuesto-nacion.md` debe contener:

1. **Tabla de hechos** con todos los campos y tipos SQL
2. **Cada dimensión** con su PK, descripción y JOIN key
3. **Ejemplos de JOINs** correctos
4. **Reglas SQL** (unaccent, comillas dobles, NUMERIC)
5. **10-15 queries de ejemplo** con el resultado esperado
6. **Glosario** para que el LLM entienda el dominio

### 4.3 Inyección en el System Prompt

```typescript
// src/lib/ai/prompts.ts
import { readFileSync } from 'fs';
import { join } from 'path';

export function getSystemPrompt(): string {
  const schemaDoc = readFileSync(
    join(process.cwd(), 'schema', 'presupuesto-nacion.md'),
    'utf-8'
  );

  return `Sos el Analista Principal de Presupuesto de la Nación Argentina.
Tu objetivo es revelar la verdad financiera en los datos de presupuestoabierto.gob.ar.

## Reglas
1. SIEMPRE usá executeSQL para obtener datos antes de responder.
2. Diferenciá entre Crédito Vigente (promesa) y Devengado (realidad).
3. Si la respuesta implica flujos o jerarquías, usá generateVisual.
4. Los montos están en MILLONES de pesos. Siempre aclaralo.
5. Si hay subejecución (vigente >> devengado), destacalo como señal de alerta.

## Schema de la Base de Datos
${schemaDoc}

## Formato de respuesta
- Hablá en español argentino
- Sé conciso y directo
- Citá los números exactos de la query
- Si generás un gráfico, explicá qué muestra
`;
}
```

---

## 5. Backend: API Route + AI SDK

### 5.1 Configuración del AI SDK 5.0

```typescript
// src/lib/ai/config.ts
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

export function getModel() {
  const provider = process.env.AI_PROVIDER || 'anthropic';

  if (provider === 'google') {
    return google(process.env.AI_MODEL || 'gemini-2.0-flash');
  }

  return anthropic(process.env.AI_MODEL || 'claude-sonnet-4-5-20250929');
}
```

### 5.2 Definición de Tools

```typescript
// src/lib/ai/tools.ts
import { z } from 'zod';
import { tool } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // read-only via RLS
);

export const executeSQL = tool({
  description: `Ejecuta una query SQL SELECT contra la base de datos del
    Presupuesto Nacional Argentino. Solo SELECT permitido. Los resultados
    están en millones de pesos.`,
  parameters: z.object({
    query: z.string().describe('Query SQL SELECT válida para PostgreSQL'),
    explanation: z.string().describe('Qué busca esta query en 1 línea'),
  }),
  execute: async ({ query, explanation }) => {
    // Validación básica: solo SELECT
    const normalized = query.trim().toUpperCase();
    if (!normalized.startsWith('SELECT')) {
      return { error: 'Solo queries SELECT están permitidas.' };
    }

    try {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        sql_query: query,
      });

      if (error) {
        return {
          error: error.message,
          hint: 'Revisá el nombre de tablas y columnas en el schema.',
        };
      }

      return {
        explanation,
        rowCount: data?.length || 0,
        data: data?.slice(0, 100), // Limitar a 100 filas
      };
    } catch (e: any) {
      return { error: e.message };
    }
  },
});

export const generateVisual = tool({
  description: `Genera una configuración JSON para un gráfico Nivo.
    Usar cuando la respuesta se beneficia de una visualización.
    Tipos: sankey (flujos de dinero), treemap (jerarquías),
    bar (rankings/comparaciones), line (tendencias temporales).`,
  parameters: z.object({
    chartType: z.enum(['sankey', 'treemap', 'bar', 'line', 'heatmap']),
    title: z.string().describe('Título descriptivo del gráfico'),
    description: z.string().describe('Qué insight muestra este gráfico'),
    data: z.any().describe('Payload JSON específico para Nivo'),
    config: z.object({
      colors: z.array(z.string()).optional(),
      valueFormat: z.string().optional(),
      layout: z.enum(['horizontal', 'vertical']).optional(),
    }).optional(),
  }),
  // No execute: el frontend renderiza directamente
});
```

### 5.3 API Route Principal

```typescript
// src/app/api/chat/route.ts
import { streamText } from 'ai';
import { getModel } from '@/lib/ai/config';
import { executeSQL, generateVisual } from '@/lib/ai/tools';
import { getSystemPrompt } from '@/lib/ai/prompts';

export const maxDuration = 30; // Vercel timeout

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: getModel(),
    system: getSystemPrompt(),
    messages,
    tools: {
      executeSQL,
      generateVisual,
    },
    maxSteps: 5, // Permite: query → analizar → visualizar
  });

  return result.toDataStreamResponse();
}
```

### 5.4 Función RPC en Supabase (para executeSQL)

```sql
-- Crear función que ejecuta queries de solo lectura
CREATE OR REPLACE FUNCTION execute_readonly_query(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10000'  -- 10 segundos max
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Validar que sea SELECT
    IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%') THEN
        RAISE EXCEPTION 'Solo queries SELECT permitidas';
    END IF;

    -- Validar que no contenga comandos peligrosos
    IF sql_query ~* '(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)' THEN
        RAISE EXCEPTION 'Query contiene comandos no permitidos';
    END IF;

    EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql_query || ') t'
    INTO result;

    RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- Dar permiso al rol anon
GRANT EXECUTE ON FUNCTION execute_readonly_query TO anon;
```

---

## 6. Frontend: Chat + Generative UI + Nivo

### 6.1 Hook useChat

```typescript
// src/app/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { MessageList } from '@/components/ai/message-list';

export default function HomePage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    maxSteps: 5,
  });

  return (
    <div className="flex h-screen">
      {/* Panel de chat */}
      <div className="flex-1 flex flex-col">
        <MessageList messages={messages} />
        <form onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Preguntá sobre el presupuesto..."
          />
        </form>
      </div>
    </div>
  );
}
```

### 6.2 Renderizado de Tool Invocations (Generative UI)

```typescript
// src/components/ai/tool-ui-renderer.tsx
'use client';

import { ToolInvocation } from 'ai';
import { BudgetSankey } from '@/components/charts/budget-sankey';
import { BudgetTreemap } from '@/components/charts/budget-treemap';
import { BudgetBar } from '@/components/charts/budget-bar';
import { DataTable } from '@/components/ui/data-table';

export function ToolUIRenderer({ toolInvocation }: { toolInvocation: ToolInvocation }) {
  const { toolName, state } = toolInvocation;

  // Loading state
  if (state !== 'result') {
    return (
      <div className="animate-pulse bg-zinc-800 rounded-lg p-4 h-64">
        <p className="text-zinc-400">
          {toolName === 'executeSQL' ? 'Ejecutando consulta...' : 'Generando visualización...'}
        </p>
      </div>
    );
  }

  const { result } = toolInvocation;

  switch (toolName) {
    case 'executeSQL':
      if (result.error) {
        return <div className="text-red-400 p-4 bg-red-900/20 rounded-lg">{result.error}</div>;
      }
      return <DataTable data={result.data} title={result.explanation} />;

    case 'generateVisual':
      switch (result.chartType) {
        case 'sankey':
          return <BudgetSankey data={result.data} title={result.title} />;
        case 'treemap':
          return <BudgetTreemap data={result.data} title={result.title} />;
        case 'bar':
          return <BudgetBar data={result.data} title={result.title} />;
        default:
          return <DataTable data={result.data} title={result.title} />;
      }

    default:
      return null;
  }
}
```

### 6.3 Componentes Nivo

#### BudgetSankey (flujos de dinero)

```typescript
// src/components/charts/budget-sankey.tsx
'use client';

import { ResponsiveSankey } from '@nivo/sankey';

interface BudgetSankeyProps {
  data: { nodes: any[]; links: any[] };
  title: string;
}

export function BudgetSankey({ data, title }: BudgetSankeyProps) {
  // Validación defensiva: filtrar ciclos
  const safeData = {
    nodes: data.nodes || [],
    links: (data.links || []).filter(
      (link: any) => link.source !== link.target
    ),
  };

  return (
    <div className="w-full h-[500px] bg-zinc-900 rounded-lg p-4">
      <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
      <ResponsiveSankey
        data={safeData}
        margin={{ top: 20, right: 160, bottom: 20, left: 50 }}
        align="justify"
        colors={{ scheme: 'purple_orange' }}
        nodeOpacity={1}
        nodeThickness={18}
        linkOpacity={0.5}
        linkHoverOpacity={0.8}
        enableLinkGradient
        labelPosition="outside"
        labelTextColor={{ from: 'color', modifiers: [['brighter', 1]] }}
        theme={{
          text: { fill: '#ffffff' },
          tooltip: { container: { background: '#1a1a1a', color: '#fff' } },
        }}
      />
    </div>
  );
}
```

#### BudgetTreemap (jerarquías de gasto)

```typescript
// src/components/charts/budget-treemap.tsx
'use client';

import { ResponsiveTreeMap } from '@nivo/treemap';

interface BudgetTreemapProps {
  data: any;
  title: string;
}

export function BudgetTreemap({ data, title }: BudgetTreemapProps) {
  return (
    <div className="w-full h-[500px] bg-zinc-900 rounded-lg p-4">
      <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
      <ResponsiveTreeMap
        data={data}
        identity="name"
        value="value"
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        labelSkipSize={12}
        labelTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
        parentLabelTextColor={{ from: 'color', modifiers: [['darker', 3]] }}
        colors={{ scheme: 'purple_orange' }}
        borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
        theme={{
          tooltip: { container: { background: '#1a1a1a', color: '#fff' } },
        }}
      />
    </div>
  );
}
```

---

## 7. Testing y Validación

### 7.1 Batería de Preguntas

| # | Pregunta | Tipo esperado | Complejidad |
|---|----------|---------------|-------------|
| 1 | "Cuánto gastó el Ministerio de Salud en 2024?" | SQL + texto | Baja |
| 2 | "Mostrame el flujo de fondos por jurisdicción" | SQL + Sankey | Alta |
| 3 | "Qué jurisdicción tiene mayor subejecución?" | SQL + cálculo | Media |
| 4 | "Comparame gastos en personal vs bienes de capital" | SQL + Bar | Media |
| 5 | "Evolución mensual del gasto total" | SQL + Line | Media |
| 6 | "Top 10 programas con mayor ejecución" | SQL + Bar | Baja |
| 7 | "Cuánto se destinó a educación vs defensa?" | SQL + comparación | Baja |
| 8 | "Cuál es la deuda flotante por ministerio?" | SQL + cálculo derivado | Alta |
| 9 | "Distribución del gasto por finalidad" | SQL + Treemap | Media |
| 10 | "Cuánto representa cada fuente de financiamiento?" | SQL + Pie/Bar | Baja |
| 11 | "Qué programas de Salud tienen más presupuesto?" | SQL + filtro + ranking | Media |
| 12 | "Cuánto se ejecutó de lo presupuestado originalmente?" | SQL + % | Baja |
| 13 | "Mostrame Defensa desglosado por inciso" | SQL + Treemap | Media |
| 14 | "Qué mes tuvo mayor ejecución?" | SQL + agregación | Baja |
| 15 | "Explicame la diferencia entre vigente y devengado" | Texto (sin SQL) | Baja |
| 16 | "Cómo se distribuye el gasto en las provincias?" | SQL + mapa/bar | Alta |
| 17 | "Cuánto se paga en intereses de deuda?" | SQL + filtro específico | Media |
| 18 | "Qué porcentaje del gasto va a servicios sociales?" | SQL + cálculo | Media |
| 19 | "Comparame el presupuesto de Educación 2024 por programa" | SQL + bar detallado | Alta |
| 20 | "Cuánto gasta cada ministerio por empleado?" | SQL + cálculo cruzado | Alta |

### 7.2 Métricas de Éxito

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Tasa de éxito SQL | >90% | Queries que ejecutan sin error / total |
| Precisión de datos | >95% | Verificar vs. portal oficial |
| Latencia P50 | <5s | Medir en Vercel Analytics |
| Latencia P95 | <15s | Medir en Vercel Analytics |
| Gráficos renderizados | >90% | Visualizaciones que renderizan / total generadas |
| Satisfacción de respuesta | >85% | Evaluación manual de 20 preguntas |

### 7.3 Testing Manual

```bash
# 1. Ejecutar localmente
npm run dev

# 2. Abrir http://localhost:3000

# 3. Hacer las 20 preguntas de la batería

# 4. Para cada pregunta, verificar:
#    - ¿SQL ejecutó correctamente?
#    - ¿Los datos son precisos?
#    - ¿El gráfico renderizó?
#    - ¿La narrativa es coherente?
#    - ¿El tiempo de respuesta fue aceptable?

# 5. Documentar resultados en docs/TESTING_RESULTS.md
```

---

## 8. Deploy en Vercel

### 8.1 Setup

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Link al proyecto
vercel link

# Configurar variables de entorno
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add GOOGLE_GENERATIVE_AI_API_KEY
vercel env add AI_PROVIDER
vercel env add AI_MODEL

# Deploy
vercel --prod
```

### 8.2 Configuración de next.config.ts

```typescript
// next.config.ts
const nextConfig = {
  cacheComponents: true,  // Next.js 16 Cache Components

  // Timeout para API routes (streaming)
  serverExternalPackages: ['@nivo/sankey', '@nivo/treemap'],

  // Headers de seguridad
  async headers() {
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

export default nextConfig;
```

### 8.3 Vercel.json (opcional)

```json
{
  "functions": {
    "src/app/api/chat/route.ts": {
      "maxDuration": 30
    }
  }
}
```

---

## 9. Lecciones Aprendidas de SQL-AGENT-NEW

### 9.1 Qué funcionó bien

| Aspecto | Lección | Cómo aplicar |
|---------|---------|--------------|
| **Heurísticas** | Bypass de LLM para clasificación → 98% más rápido | No aplica (Vercel pattern no usa router) |
| **SSE Streaming** | Mejor UX que esperar respuesta completa | Usar `streamText()` de AI SDK |
| **DataPayload tipado** | Pydantic schemas evitaron errores | Usar Zod schemas para tools |
| **Agent Timeline** | Usuarios valoran ver qué hace el agente | Mostrar pasos via tool invocations |
| **Preguntas sugeridas** | Reducen fricción inicial | Implementar hero con sugerencias |

### 9.2 Qué NO funcionó bien

| Problema | Impacto | Solución en nuevo proyecto |
|----------|---------|---------------------------|
| **Allowlist rígido** | Solo 20 queries posibles | SQL libre (patrón Vercel) |
| **FastAPI + Docker** | Complejidad de deploy, dependencia de VPS | 100% Vercel serverless |
| **LangGraph overhead** | Complejidad innecesaria para el caso de uso | Agente simple con AI SDK |
| **Multi-agente** | 3 agentes = 3x latencia cuando todos usan LLM | 1 solo agente con 2 tools |
| **Cache de Redis** | Otra dependencia a mantener | Cache Components de Next.js 16 |
| **Recharts limitado** | Sin Sankey para flujos presupuestarios | Nivo con Sankey nativo |

### 9.3 Evolución arquitectónica

```
v1 (n8n):        Orchestrator → Switch → 3 sub-agents → QuickChart.io
                  Pros: Visual, no-code
                  Cons: Lento, dependencia VPS, charts estáticos

v2 (SQL-AGENT):  FastAPI → LangGraph → 3 agents → Recharts
                  Pros: Rápido (heurísticas), interactivo
                  Cons: Allowlist rígido, Docker/VPS, complejo

v3 (TRAIDgov):   Next.js API Route → AI SDK → 2 tools → Nivo
                  Pros: Simple, serverless, flexible, Sankey
                  Cons: Confianza total en LLM para SQL
```

---

## 10. Referencias

### Documentación Oficial

| Recurso | URL |
|---------|-----|
| Next.js 16 | https://nextjs.org/blog/next-16 |
| AI SDK 5.0 | https://ai-sdk.dev/docs |
| Generative UI | https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces |
| Supabase JS | https://supabase.com/docs/reference/javascript |
| pgvector | https://supabase.com/docs/guides/database/extensions/pgvector |
| Nivo Sankey | https://nivo.rocks/sankey/ |
| Nivo Treemap | https://nivo.rocks/treemap/ |

### Papers y Artículos

| Recurso | URL |
|---------|-----|
| Vercel: 80% tools removed | https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools |
| Presupuesto Abierto API | https://presupuesto-abierto.argentina.apidocs.ar/ |
| Datos.gob.ar | https://datos.gob.ar/ |
| NIST AI RMF | https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf |

### Proyectos Anteriores (Internos)

| Proyecto | Ubicación |
|----------|-----------|
| n8n Workflow Analista | `D:\OneDrive\GitHub\TRAIDgov\agente analista 8 feb (1).json` |
| SQL-AGENT-NEW | `D:\OneDrive\GitHub\SQL-AGENT-NEW` |
| ETL Python | `I:\Mi unidad\N8N\AGENTE PRESUPUESTO NACION\agente nacion.py` |
| Spec Deep Research | `D:\OneDrive\GitHub\TRAIDgov\Arquitectura Vercel para Analista Presupuestario AI.md` |

---

*Documento generado el 2026-02-06. Basado en SQL-AGENT-NEW, n8n workflow, spec Deep Research, paper Vercel y Next.js 16.*
