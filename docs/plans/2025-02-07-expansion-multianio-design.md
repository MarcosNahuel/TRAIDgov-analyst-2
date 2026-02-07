# Plan: Expansion Multi-Anio + Agente Inteligente + Memoria

> Fecha: 2025-02-07
> Estado: Aprobado para implementacion
> Contexto: Brainstorming session con decisiones tomadas

---

## 1. Resumen Ejecutivo

Actualizar TRAIDgov-analyst para pasar de datos anuales 2024 a datos **mensuales multi-anio (2019-2025)** usando el nuevo ETL codex, implementar un agente que **piensa antes de consultar** (analiza, aclara, confirma), y agregar **memoria de chat** (persistencia de sesion) y **memoria permanente** (cross-session).

---

## 2. Decisiones de Arquitectura (Aprobadas)

| Decision | Elegida | Descartada | Razon |
|----------|---------|------------|-------|
| Metricas | Devengado + Vigente | Solo devengado / 5 metricas | Permite subejecucion (indicador estrella) sin explotar volumen |
| Dimensiones | 9 (6 base + finalidad + funcion + fuente) | 6 base / 19 completas | Cubre 95% de preguntas, permite analisis funcional |
| Migracion | Reemplazo total (corte limpio) | Coexistencia / View compatibilidad | Evita ambiguedad, el LLM apunta a 1 sola fact table |
| Anios | 2019-2025 (7 anios) | 2014-2025 / 2023-2025 | Balance: cubre Macri-AF-Milei, ~3.5M registros |
| Prompt | Schema doc unificado | Separado / Tool de contexto | Simple, 1 archivo, patron Vercel |
| UX | Actualizar preguntas + mantener UI | Selector de periodo / No tocar | Minimo cambio visual, maximo impacto |
| Agente | Pensar antes de consultar (prompt) | Tool de confirmacion | Prompt engineering, no agrega tools |
| Memoria chat | Supabase chat_sessions | localStorage / Sin memoria | Persistencia real, accesible cross-device |
| Memoria permanente | Supabase agent_memories + tool | Sin memoria / pgvector | Simple, pocas memorias, sin embeddings |

---

## 3. Estado Actual (Snapshot para contexto)

### 3.1 Archivos Clave y Su Estado

| Archivo | Lineas | Proposito |
|---------|--------|-----------|
| `src/app/api/chat/route.ts` | 24 | Endpoint POST, streamText, 2 tools |
| `src/lib/ai/tools.ts` | 119 | executeSQL + generateDashboard |
| `src/lib/ai/prompts.ts` | 135 | System prompt + schema doc injection |
| `src/lib/ai/config.ts` | 5 | Google Gemini 3 Flash |
| `src/lib/types.ts` | 52 | DashboardSpec, KpiCardData, ChartConfig, etc. |
| `src/app/page.tsx` | 234 | Chat + Dashboard layout, useChat, SUGGESTED_QUESTIONS |
| `src/components/ai/message-list.tsx` | 103 | Renderizado mensajes + tool progress |
| `src/lib/db/supabase.ts` | 20 | createServerSupabaseClient, createBrowserSupabaseClient |
| `schema/presupuesto-nacion.md` | 467 | Schema doc actual (solo 2024, 19 dims) |
| `etl-codex/sql/01_schema_core.sql` | 275 | Schema SQL nuevo (particionado, 6 dims + hist) |
| `etl-codex/scripts/etl-credito-devengado-core.ts` | ~400 | ETL multi-anio |
| `etl-codex/scripts/load-ipc.ts` | ~104 | Cargador de IPC INDEC |
| `etl-codex/scripts/_shared.ts` | ~139 | Utilidades compartidas (download, parse, etc.) |
| `etl-codex/schema/presupuesto-nacion-core-multianio.md` | 167 | Schema doc nuevo (base para actualizar) |

### 3.2 Base de Datos Actual

- Tabla de hechos: `presupuesto_nacion_2024` (119,413 registros, anual)
- 19 dimensiones con `id_unico TEXT PRIMARY KEY`
- Funcion RPC: `execute_readonly_query`
- 5 metricas: presupuestado, vigente, comprometido, devengado, pagado

### 3.3 LLM Actual

- Provider: Google (`@ai-sdk/google`)
- Modelo: `gemini-3-flash-preview`
- Tools: executeSQL (con execute), generateDashboard (sin execute, frontend-only)
- Max steps: 5

### 3.4 Chat Actual

- 100% efimero en memoria (React state via useChat)
- Sin persistencia de ningún tipo (ni localStorage, ni BD, ni sesiones)
- Preguntas sugeridas hardcodeadas para 2024

---

## 4. Cambios al Schema SQL

### 4.1 Modificar `etl-codex/sql/01_schema_core.sql`

Agregar estas tablas y columnas al schema existente:

#### 4.1.1 Nueva columna en fact table: `credito_vigente`

```sql
-- Agregar columna vigente a la fact table
-- NOTA: como la tabla es particionada y posiblemente vacia,
-- mejor DROP y recrear, o ALTER TABLE
ALTER TABLE fact_credito_devengado_mensual
  ADD COLUMN IF NOT EXISTS credito_vigente NUMERIC(24, 8) NOT NULL DEFAULT 0;
```

Alternativamente, si la tabla esta vacia, modificar el CREATE TABLE para incluir:
```sql
credito_devengado NUMERIC(24, 8) NOT NULL DEFAULT 0,
credito_vigente NUMERIC(24, 8) NOT NULL DEFAULT 0,
```

#### 4.1.2 Nuevas dimensiones: finalidad, funcion, fuente

```sql
-- Dimensiones actuales
CREATE TABLE IF NOT EXISTS dim_finalidad (
  finalidad_id TEXT PRIMARY KEY,
  finalidad_desc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_funcion (
  finalidad_id TEXT NOT NULL,
  funcion_id TEXT NOT NULL,
  funcion_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, funcion_id)
);

CREATE TABLE IF NOT EXISTS dim_fuente_financiamiento (
  fuente_financiamiento_id TEXT PRIMARY KEY,
  fuente_financiamiento_desc TEXT NOT NULL
);

-- Dimensiones historicas
CREATE TABLE IF NOT EXISTS dim_finalidad_hist (
  finalidad_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  finalidad_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_funcion_hist (
  finalidad_id TEXT NOT NULL,
  funcion_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  funcion_desc TEXT NOT NULL,
  PRIMARY KEY (finalidad_id, funcion_id, ejercicio_presupuestario)
);

CREATE TABLE IF NOT EXISTS dim_fuente_financiamiento_hist (
  fuente_financiamiento_id TEXT NOT NULL,
  ejercicio_presupuestario INTEGER NOT NULL,
  fuente_financiamiento_desc TEXT NOT NULL,
  PRIMARY KEY (fuente_financiamiento_id, ejercicio_presupuestario)
);
```

#### 4.1.3 Nuevas columnas FK en fact table

```sql
ALTER TABLE fact_credito_devengado_mensual
  ADD COLUMN IF NOT EXISTS finalidad_id TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS funcion_id TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS fuente_financiamiento_id TEXT NOT NULL DEFAULT '0';
```

#### 4.1.4 Indices para nuevas dimensiones

```sql
CREATE INDEX IF NOT EXISTS idx_fact_finalidad
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, finalidad_id);
CREATE INDEX IF NOT EXISTS idx_fact_funcion
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, finalidad_id, funcion_id);
CREATE INDEX IF NOT EXISTS idx_fact_fuente
  ON fact_credito_devengado_mensual (ejercicio_presupuestario, fuente_financiamiento_id);
```

#### 4.1.5 Tablas de conversaciones y memoria

```sql
-- ============================================================
-- GESTION DE CONVERSACIONES (inspirado en SQL-AGENT-NEW)
-- ============================================================

-- Conversaciones: cada una tiene metadata + mensajes completos
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Metadata visible en el sidebar
  title TEXT NOT NULL DEFAULT 'Nueva conversacion',   -- Nombre generado por la IA o editado por usuario
  last_insight TEXT,                                   -- Ultimo insight/conclusion del dashboard
  message_count INTEGER NOT NULL DEFAULT 0,            -- Cantidad de mensajes (user + assistant)

  -- Datos completos
  messages JSONB DEFAULT '[]'::jsonb,                  -- UIMessage[] serializado completo

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para listar conversaciones ordenadas
CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON conversations (updated_at DESC);

-- ============================================================
-- MEMORIA PERMANENTE (cross-session)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'preference',  -- 'preference' | 'fact' | 'correction'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS (lectura/escritura publica — sin auth por ahora)
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_conversations" ON conversations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_all_agent_memories" ON agent_memories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```

#### 4.1.6 Actualizar row_hash

El hash del grano CORE debe incluir las 3 nuevas dimensiones:
```
SHA1("{year}|{mes}|{jurisdiccion}|{servicio}|{programa}|{subprograma}|{inciso}|{ubicacion}|{finalidad}|{funcion}|{fuente}")
```

---

## 5. Cambios al ETL

### 5.1 Modificar `etl-codex/scripts/etl-credito-devengado-core.ts`

#### Cambios en el parse/agregacion:

1. **Agregar `credito_vigente`** al SUM en la agregacion del CSV
   - El CSV tiene columna `credito_vigente` — parsearla con `parseMoneyToScaledInt`
   - Sumarla al mismo grano que devengado

2. **Agregar 3 dimensiones al grano**:
   - `finalidad_id` + `finalidad_desc`
   - `funcion_id` + `funcion_desc`
   - `fuente_financiamiento_id` + `fuente_financiamiento_desc`
   - Estas columnas existen en el CSV de MECON

3. **Actualizar la composite key** del factMap:
   ```
   Antes:  mes|jurisdiccion|servicio|programa|subprograma|inciso|ubicacion
   Ahora:  mes|jurisdiccion|servicio|programa|subprograma|inciso|ubicacion|finalidad|funcion|fuente
   ```

4. **Agregar Maps de dimensiones** nuevas:
   - `dimFinalidad`, `dimFuncion`, `dimFuente` (actuales)
   - `dimFinalidadHist`, `dimFuncionHist`, `dimFuenteHist` (historicas)

5. **Actualizar upsert order** para incluir las 6 nuevas tablas (3 actual + 3 hist)

6. **Actualizar fact record generation** para incluir:
   - `credito_vigente` (formateado)
   - `finalidad_id`, `funcion_id`, `fuente_financiamiento_id`

7. **Actualizar row_hash** (SHA1 incluye 3 campos mas)

### 5.2 Ejecucion

```bash
# Cargar 2019-2025
npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2019 --to 2025

# Cargar IPC
npx tsx etl-codex/scripts/load-ipc.ts
```

---

## 6. Schema Doc (Reemplazo Completo)

### Archivo: `schema/presupuesto-nacion.md`

Reescribir completamente basandose en `etl-codex/schema/presupuesto-nacion-core-multianio.md` pero expandido con:

**Estructura del nuevo schema doc:**

```markdown
# Schema: Presupuesto Nacional Argentina (2019-2025)

## Tabla de Hechos: fact_credito_devengado_mensual
- Grano: anio + mes + jurisdiccion + servicio + programa + subprograma + inciso + ubicacion + finalidad + funcion + fuente
- Metricas: credito_devengado + credito_vigente (millones de pesos)
- Particionada por anio
- [columnas completas con tipos]

## Dimensiones (9 actuales)
- dim_jurisdiccion (PK: jurisdiccion_id)
- dim_servicio (PK: servicio_id)
- dim_programa (PK compuesta: servicio_id, programa_id)
- dim_subprograma (PK compuesta: servicio_id, programa_id, subprograma_id)
- dim_inciso (PK: inciso_id)
- dim_ubicacion_geografica (PK: ubicacion_geografica_id)
- dim_finalidad (PK: finalidad_id) [NUEVA]
- dim_funcion (PK compuesta: finalidad_id, funcion_id) [NUEVA]
- dim_fuente_financiamiento (PK: fuente_financiamiento_id) [NUEVA]
- [con JOINs documentados]

## Dimensiones Historicas (por anio)
- dim_*_hist con PK (id, ejercicio_presupuestario)
- Usar COALESCE(hist.desc, actual.desc) para nombre correcto por anio

## IPC (deflactacion)
- ipc_indice_mensual (periodo, ipc_indice)
- Formula: monto_real = monto_nominal * (ipc_base / ipc_periodo)

## Indicadores Derivados
- Tasa de ejecucion: devengado / NULLIF(vigente, 0) * 100
- Subejecucion: (1 - devengado / NULLIF(vigente, 0)) * 100
- [otros]

## Contexto Institucional por Gobierno
- 2019 (Macri): ~20 ministerios, estructura original
- 2020-2023 (Alberto Fernandez): ~20 ministerios, creaciones (Mujeres, Obras Publicas)
- 2024-2025 (Milei): 16 jurisdicciones, DNU 8/2023
  - Capital Humano (88) = Educacion + Desarrollo Social + Trabajo
  - Infraestructura (77) = Transporte + Obra Publica (eliminado Decreto 195/2024)

## Reglas SQL
1. SIEMPRE filtrar por ejercicio_presupuestario (performance, particiones)
2. Keys compuestas obligatorias para programa, subprograma, funcion
3. unaccent(lower(...)) para filtros de texto
4. NULLIF para divisiones
5. LIMIT para resultados grandes
6. Para comparaciones inter-anuales con inflacion: JOIN ipc_indice_mensual

## Queries Ejemplo (10-15)
- Total por anio
- Top jurisdicciones
- Serie mensual nominal
- Serie mensual deflactada (IPC)
- Subejecucion por jurisdiccion
- Gasto por finalidad/funcion
- Comparacion inter-anual
- Evolucion de un programa
- Gasto por provincia
- Distribucion por fuente de financiamiento
```

---

## 7. System Prompt (Reescritura)

### Archivo: `src/lib/ai/prompts.ts`

El system prompt debe incorporar 3 cambios fundamentales:

### 7.1 Flujo "Pensar antes de consultar"

```
## Flujo de trabajo OBLIGATORIO

### Paso 1: Analizar la pregunta
Antes de ejecutar cualquier query, evalua:
- Es la pregunta clara y sin ambiguedad?
- Sabes exactamente que tabla/dimension/periodo consultar?
- Hay algun contexto institucional que el usuario pueda no conocer?

### Paso 2: Decidir si aclarar o ejecutar

**Si la pregunta es CLARA** (ej: "Cuanto gasto Salud en 2024?"):
→ Decir brevemente que vas a consultar (1 linea)
→ Ejecutar executeSQL inmediatamente
→ Generar dashboard

**Si la pregunta es AMBIGUA** (cualquiera de estas senales):
- Entidad que cambio entre gobiernos (Educacion, Desarrollo Social, etc.)
- Sin periodo especificado
- Termino vago ("gasto social", "obra publica", "lo que se invirtio")
- Comparacion sin definir base (nominal vs real)
- Multiples interpretaciones posibles

→ Hacer 1-2 preguntas de clarificacion, breves y con opciones
→ Esperar respuesta del usuario
→ Luego ejecutar

### Paso 3: Indicar que vas a hacer
SIEMPRE, antes de executeSQL, decir en lenguaje natural y simple:
"Voy a consultar [que] para [periodo] [filtro si aplica]."

### Paso 4: Ejecutar y presentar
executeSQL → generateDashboard → conclusion

### Regla de oro
Si ya aclaraste algo en la conversacion (o esta en la memoria del usuario),
no volver a preguntar lo mismo.
```

### 7.2 Seccion de Memoria

```
## Memoria del usuario
[Se inyectan las ultimas 20 memorias de agent_memories aqui]
Ejemplo:
- "El usuario prefiere montos en pesos constantes de diciembre 2024"
- "El usuario trabaja en el sector educativo"
```

### 7.3 Contexto Multi-Anio y Multi-Gobierno

Reemplazar el contexto fijo "2024 Gobierno Milei" por una seccion que cubra los 3 gobiernos (2019-2025).

---

## 8. Cambios en Tools

### Archivo: `src/lib/ai/tools.ts`

### 8.1 executeSQL — Sin cambios funcionales

Solo actualizar la description para reflejar multi-anio:
```typescript
description: `Ejecuta una query SQL SELECT contra la base de datos del
Presupuesto Nacional Argentino (2019-2025, datos mensuales).
Solo queries SELECT permitidas. Los resultados estan en millones de pesos.
Usa esta herramienta para obtener datos antes de responder cualquier pregunta.`
```

### 8.2 generateDashboard — Sin cambios

Ya soporta todos los tipos de graficos necesarios (line para series temporales).

### 8.3 rememberFact — NUEVA tool (3ra tool)

```typescript
export const rememberFact = tool({
  description: `Guarda un hecho o preferencia del usuario para recordarlo en
futuras conversaciones. Usa esta herramienta cuando el usuario exprese:
- Una preferencia explicita ("siempre quiero ver en pesos constantes")
- Un contexto relevante ("trabajo en el Ministerio de Salud")
- Una correccion ("cuando digo educacion me refiero a la funcion, no jurisdiccion")
No guardes informacion obvia o redundante.`,
  inputSchema: z.object({
    content: z.string().describe("Hecho o preferencia a recordar, en 1 oracion"),
    category: z.enum(["preference", "fact", "correction"]),
  }),
  execute: async ({ content, category }) => {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("agent_memories")
      .insert({ content, category });
    if (error) return { saved: false, error: error.message };
    return { saved: true, content };
  },
});
```

---

## 9. Cambios en API Route

### Archivo: `src/app/api/chat/route.ts`

```typescript
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getModel } from "@/lib/ai/config";
import { executeSQL, generateDashboard, rememberFact } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompts";
import { loadMemories } from "@/lib/db/memories";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Cargar memorias permanentes para inyectar en prompt
  const memories = await loadMemories();

  const result = streamText({
    model: getModel(),
    system: getSystemPrompt(memories),
    messages: await convertToModelMessages(messages),
    tools: {
      executeSQL,
      generateDashboard,
      rememberFact,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
```

---

## 10. Gestion de Conversaciones (Completa)

### 10.0 Referencia: SQL-AGENT-NEW

El sistema anterior usaba localStorage + Supabase backend. Nosotros simplificamos: **todo en Supabase** (sin auth, sin localStorage para mensajes).

### 10.1 Modelo de datos: `conversations`

```typescript
// src/lib/types.ts — agregar estos tipos

export interface ConversationMeta {
  id: string;             // UUID
  title: string;          // Generado por IA o editado por usuario
  last_insight: string | null;  // Ultimo insight del dashboard
  message_count: number;  // Cant. mensajes
  created_at: string;     // ISO timestamp
  updated_at: string;     // ISO timestamp
}

export interface Conversation extends ConversationMeta {
  messages: unknown[];    // UIMessage[] serializado
}
```

### 10.2 `src/lib/db/conversations.ts` (NUEVO)

CRUD completo para conversaciones:

```typescript
import { createBrowserSupabaseClient } from "@/lib/db/supabase";
import type { ConversationMeta, Conversation } from "@/lib/types";

const supabase = () => createBrowserSupabaseClient();

// Crear conversacion nueva (retorna ID)
export async function createConversation(): Promise<string> {
  const { data, error } = await supabase()
    .from("conversations")
    .insert({ title: "Nueva conversacion" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// Cargar conversacion completa (con mensajes)
export async function loadConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase()
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Conversation;
}

// Guardar mensajes + actualizar metadata
export async function saveConversation(
  id: string,
  messages: unknown[],
  opts?: { title?: string; lastInsight?: string }
) {
  const update: Record<string, unknown> = {
    messages,
    message_count: messages.length,
    updated_at: new Date().toISOString(),
  };
  if (opts?.title) update.title = opts.title;
  if (opts?.lastInsight) update.last_insight = opts.lastInsight;

  await supabase().from("conversations").update(update).eq("id", id);
}

// Renombrar conversacion (edicion manual por usuario)
export async function renameConversation(id: string, title: string) {
  await supabase()
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// Listar conversaciones recientes (para sidebar)
// Solo metadata, sin mensajes (performance)
export async function listConversations(limit = 30): Promise<ConversationMeta[]> {
  const { data } = await supabase()
    .from("conversations")
    .select("id, title, last_insight, message_count, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data || []) as ConversationMeta[];
}

// Borrar conversacion
export async function deleteConversation(id: string) {
  await supabase().from("conversations").delete().eq("id", id);
}
```

### 10.3 `src/lib/db/memories.ts` (NUEVO)

```typescript
import { createServerSupabaseClient } from "@/lib/db/supabase";

export async function loadMemories(): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("agent_memories")
    .select("content, category")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];
  return data.map((m) => `[${m.category}] ${m.content}`);
}
```

### 10.4 Auto-naming por IA

El titulo de la conversacion lo genera la IA, NO es la primera pregunta textual (como en SQL-AGENT-NEW). El flujo es:

1. Usuario hace primera pregunta → se crea conversacion con title="Nueva conversacion"
2. Agente ejecuta query + genera dashboard
3. El `generateDashboard` produce un campo `conclusion` (1-2 oraciones con el insight)
4. **El frontend** extrae la `conclusion` del primer dashboard y la usa como:
   - `title` de la conversacion (truncado a 80 chars)
   - `last_insight` (completo)
5. En preguntas siguientes, `last_insight` se actualiza con cada nuevo dashboard

**Logica en page.tsx (pseudocodigo):**
```typescript
// Despues de recibir mensajes, extraer conclusion del ultimo dashboard
useEffect(() => {
  if (!conversationId || dashboards.length === 0) return;

  const lastDashboard = dashboards[dashboards.length - 1];
  const conclusion = lastDashboard.spec.conclusion;
  const isFirstDashboard = dashboards.length === 1 && currentTitle === "Nueva conversacion";

  saveConversation(conversationId, messages, {
    title: isFirstDashboard ? conclusion.slice(0, 80) : undefined,
    lastInsight: conclusion,
  });
}, [dashboards, messages]);
```

**El usuario puede editar el titulo manualmente** en cualquier momento:
- En el sidebar, click en el nombre → se convierte en input editable
- Enter o blur → guardar con `renameConversation()`

### 10.5 Hook `useConversations` (NUEVO)

```typescript
// src/hooks/useConversations.ts

import { useState, useEffect, useCallback } from "react";
import {
  createConversation,
  loadConversation,
  saveConversation,
  renameConversation,
  listConversations,
  deleteConversation,
} from "@/lib/db/conversations";
import type { ConversationMeta } from "@/lib/types";

const STORAGE_KEY = "traidgov_conversation_id";

export function useConversations() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [initialMessages, setInitialMessages] = useState<unknown[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al montar: cargar lista + restaurar sesion activa
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      const list = await listConversations();
      setConversations(list);

      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const conv = await loadConversation(savedId);
        if (conv && conv.messages.length > 0) {
          setConversationId(savedId);
          setInitialMessages(conv.messages);
        } else {
          // Sesion guardada pero vacia/borrada: crear nueva
          const newId = await createConversation();
          localStorage.setItem(STORAGE_KEY, newId);
          setConversationId(newId);
          setInitialMessages(null);
        }
      } else {
        // Primera visita: crear conversacion
        const newId = await createConversation();
        localStorage.setItem(STORAGE_KEY, newId);
        setConversationId(newId);
        setInitialMessages(null);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  // Nueva conversacion
  const startNew = useCallback(async () => {
    const newId = await createConversation();
    localStorage.setItem(STORAGE_KEY, newId);
    setConversationId(newId);
    setInitialMessages(null);
    // Refrescar lista
    const list = await listConversations();
    setConversations(list);
  }, []);

  // Continuar conversacion existente
  const continueConversation = useCallback(async (id: string) => {
    const conv = await loadConversation(id);
    if (!conv) return;
    localStorage.setItem(STORAGE_KEY, id);
    setConversationId(id);
    setInitialMessages(conv.messages);
  }, []);

  // Renombrar
  const rename = useCallback(async (id: string, title: string) => {
    await renameConversation(id, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  // Borrar
  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    // Si borramos la activa, crear nueva
    if (id === conversationId) {
      await startNew();
    }
  }, [conversationId, startNew]);

  // Guardar estado actual (llamar desde page.tsx despues de cada cambio de mensajes)
  const save = useCallback(
    async (messages: unknown[], opts?: { title?: string; lastInsight?: string }) => {
      if (!conversationId) return;
      await saveConversation(conversationId, messages, opts);
      // Refrescar lista para actualizar titulo/insight/count
      const list = await listConversations();
      setConversations(list);
    },
    [conversationId]
  );

  return {
    conversationId,
    conversations,
    initialMessages,
    isLoading,
    startNew,
    continueConversation,
    rename,
    remove,
    save,
  };
}
```

---

## 11. Cambios en Frontend

### 11.1 `src/app/page.tsx` — Gestion de conversaciones completa

**Cambios estructurales:**

1. **Layout 3 columnas:** Sidebar (240px) + Chat (380px) + Dashboard (flex-1)

```
┌──────────┬─────────────┬──────────────────────────────────┐
│ SIDEBAR  │ CHAT        │ DASHBOARD                        │
│ 240px    │ 380px       │ flex-1                           │
│          │             │                                  │
│ [+ New]  │ Messages    │ KPIs, Charts, Tables, Narrative  │
│          │             │                                  │
│ Conv 1   │             │                                  │
│ Conv 2   │             │                                  │
│ Conv 3   │ Input       │ Navigation                       │
│ ...      │             │                                  │
└──────────┴─────────────┴──────────────────────────────────┘
```

2. **SUGGESTED_QUESTIONS actualizado:**
```typescript
const SUGGESTED_QUESTIONS = [
  "Como evoluciono el gasto en educacion de 2019 a 2024?",
  "Cual fue la ejecucion presupuestaria de Salud el ultimo anio?",
  "Compare el gasto por finalidad entre 2019 y 2024",
  "Que jurisdiccion tiene mayor subejecucion en 2024?",
  "Mostrame la evolucion mensual del gasto total en 2024",
  "Cuanto representan las transferencias en el presupuesto?",
];
```

3. **Subtitulo:** `"Argentina 2024"` → `"Argentina 2019-2025"`

4. **Integracion con useConversations:**

```typescript
export default function HomePage() {
  const {
    conversationId, conversations, initialMessages, isLoading: convLoading,
    startNew, continueConversation, rename, remove, save,
  } = useConversations();

  // useChat con initialMessages para restaurar conversacion
  // IMPORTANTE: key={conversationId} para resetear el hook cuando cambia la conversacion
  const { messages, sendMessage, status } = useChat({
    key: conversationId,       // Reset hook al cambiar conversacion
    initialMessages,           // Hidratar mensajes guardados
  });

  // Auto-save despues de cada cambio de mensajes
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;

    // Extraer ultimo insight del dashboard mas reciente
    const lastDash = dashboards[dashboards.length - 1];
    const insight = lastDash?.spec?.conclusion;

    // Generar titulo si es la primera vez
    const currentConv = conversations.find(c => c.id === conversationId);
    const isNew = currentConv?.title === "Nueva conversacion" && insight;

    save(messages, {
      title: isNew ? insight.slice(0, 80) : undefined,
      lastInsight: insight || undefined,
    });
  }, [messages, dashboards]);

  // ... resto del render con sidebar
}
```

5. **Sidebar colapsable en mobile:**
   - Desktop: siempre visible (240px)
   - Mobile (<768px): oculto, toggle con boton hamburguesa en header

### 11.2 `src/components/chat/conversation-sidebar.tsx` (NUEVO)

**Componente completo con:**

| Elemento | Detalle |
|----------|---------|
| Header | Logo TRAIDGOV + boton "+ Nueva conversacion" |
| Lista | Conversaciones ordenadas por `updated_at DESC` |
| Cada item | Titulo (editable on click), fecha relativa, # preguntas, ultimo insight (1 linea truncada) |
| Item activo | Highlight violeta |
| Acciones hover | Boton editar nombre (lapiz), boton borrar (basura con confirmacion) |
| Estado vacio | "No hay conversaciones" + boton crear |
| Scroll | Overflow-y auto, max 30 conversaciones |

**Estructura de cada item en la lista:**

```
┌─────────────────────────────────┐
│ [titulo editable]           [x] │
│ 12 feb · 8 preguntas            │
│ "El gasto en educacion cayo..." │ ← last_insight truncado
└─────────────────────────────────┘
```

**Formato de fechas (smart, como SQL-AGENT-NEW):**
- Hoy → "Hoy, 14:30"
- Ayer → "Ayer, 14:30"
- <7 dias → "Miercoles, 14:30"
- >7 dias → "12 feb, 14:30"

**Edicion inline del titulo:**
- Click en titulo → se transforma en `<input>` con el valor actual
- Enter o blur → guardar con `rename(id, newTitle)`
- Escape → cancelar edicion

### 11.3 `src/components/ai/message-list.tsx` — Agregar rememberFact

Agregar handling para la nueva tool:
```typescript
// Tool rememberFact: no mostrar resultado, solo indicador de progreso
if (toolName === "rememberFact") {
  if (p.state === "output-available") return null;
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-zinc-500">
      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      Guardando en memoria...
    </div>
  );
}
```

### 11.4 Flujo completo de conversaciones (UX)

```
PRIMERA VISITA:
1. Se crea conversacion automaticamente
2. Hero con preguntas sugeridas
3. Usuario hace pregunta → respuesta + dashboard
4. Titulo se auto-genera del primer insight
5. Sidebar muestra la conversacion con titulo + insight

VOLVER AL DIA SIGUIENTE:
1. Se restaura ultima conversacion activa (localStorage tiene ID)
2. Mensajes se cargan de Supabase
3. Chat muestra toda la conversacion anterior
4. Dashboard muestra ultimo dashboard
5. Usuario puede seguir preguntando

NUEVA CONVERSACION:
1. Click "+ Nueva" en sidebar
2. Se crea nueva conversacion en Supabase
3. Chat se limpia, hero vuelve a aparecer
4. La anterior queda en el sidebar

CONTINUAR OTRA CONVERSACION:
1. Click en item del sidebar
2. Mensajes se cargan de Supabase
3. Chat muestra esa conversacion
4. Dashboard muestra el ultimo dashboard de esa conversacion

RENOMBRAR:
1. Click en titulo en sidebar → input editable
2. Escribir nuevo nombre → Enter
3. Se guarda en Supabase

BORRAR:
1. Click icono basura → confirmacion "Eliminar conversacion?"
2. Si confirma → delete de Supabase
3. Si era la activa → crear nueva automaticamente
```

---

## 12. Prompts.ts — System Prompt Completo (Estructura)

### Archivo: `src/lib/ai/prompts.ts`

```typescript
import { readFileSync } from "fs";
import { join } from "path";

let cachedSchemaDoc: string | null = null;

function getSchemaDoc(): string {
  if (cachedSchemaDoc) return cachedSchemaDoc;
  cachedSchemaDoc = readFileSync(
    join(process.cwd(), "schema", "presupuesto-nacion.md"),
    "utf-8"
  );
  return cachedSchemaDoc;
}

export function getSystemPrompt(memories: string[] = []): string {
  const schemaDoc = getSchemaDoc();

  const memoriesSection = memories.length > 0
    ? `## Memoria del usuario\nRecordas esto de conversaciones anteriores:\n${memories.map(m => `- ${m}`).join("\n")}\n\nUsa esta informacion para personalizar tus respuestas. No vuelvas a preguntar lo que ya sabes.\n`
    : "";

  return `Sos el Analista Principal de Presupuesto de la Nacion Argentina.
Tu objetivo es revelar la verdad financiera en los datos de presupuestoabierto.gob.ar (2019-2025).

## Flujo de trabajo OBLIGATORIO

### Paso 1: Analizar la pregunta
Antes de ejecutar cualquier query, evalua:
- Es la pregunta clara y sin ambiguedad?
- Sabes exactamente que tabla, dimension y periodo consultar?
- Hay contexto institucional que el usuario pueda no conocer?

### Paso 2: Decidir si aclarar o ejecutar

**Pregunta CLARA** (ej: "Cuanto gasto Salud en 2024?"):
- Decir brevemente que vas a consultar (1 linea natural)
- Ejecutar executeSQL inmediatamente
- Generar dashboard con generateDashboard

**Pregunta AMBIGUA** (senales):
- Entidad que cambio entre gobiernos (ej: "Ministerio de Educacion" no existe en 2024)
- Sin periodo especificado
- Termino vago ("gasto social", "obra publica")
- Comparacion sin definir base (nominal vs real, que anios)
- Multiples interpretaciones posibles

→ Hacer 1-2 preguntas de clarificacion, breves y con opciones concretas
→ Esperar respuesta
→ Luego ejecutar

### Paso 3: Indicar que vas a hacer
SIEMPRE, antes de executeSQL, decir en lenguaje natural y simple que vas a consultar.
Ejemplo: "Voy a consultar el gasto devengado mensual de Salud para 2023 y 2024."

### Paso 4: Ejecutar y presentar
executeSQL → analizar resultado → generateDashboard con KPIs, graficos y narrativa

### Regla de oro
Si ya aclaraste algo en la conversacion o esta en la memoria del usuario, no volver a preguntar.

## Reglas de Oro
1. **Datos ante todo**: SIEMPRE usa executeSQL antes de dar numeros.
2. **Dashboard siempre**: Despues de obtener datos, SIEMPRE usa generateDashboard.
3. **Contexto financiero**: Diferencia entre Vigente (promesa) y Devengado (realidad).
4. **Montos en millones**: Formatea: >1000M = "X miles de millones", >1B = "X billones".
5. **Subejecucion**: Si vigente >> devengado, senalalo. Formula: (1 - devengado/vigente) * 100.
6. **Inflacion**: Para comparaciones multi-anio, advertir que montos nominales no son comparables. Ofrecer deflactar con IPC si tiene sentido.
7. **Texto**: Usa unaccent(LOWER(...)) para filtros de texto en SQL.
8. **Seguridad**: Solo queries SELECT o WITH (CTEs).

## Memoria
Podes usar rememberFact para guardar preferencias o hechos del usuario que sean utiles para futuras conversaciones.
Ejemplos de cuando guardar:
- "Siempre quiero ver en pesos constantes"
- "Trabajo en el sector educativo"
- "Cuando digo educacion me refiero a la funcion presupuestaria"

${memoriesSection}

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
- **Capital Humano (88)** absorbe: Educacion, Desarrollo Social, Trabajo, Cultura, Mujeres/Genero. Domina con ANSES ($41B).
- **Infraestructura (77)** absorbe: Transporte, Obra Publica. Eliminado Decreto 195/2024 (funciones a Economia).
- **Economia (50)**: Energia (subsidios), Agricultura, Industria, Finanzas.
- **Jefatura de Gabinete (25)**: CONICET, ciencia, medios publicos.
- Si preguntan por "Ministerio de Educacion" en 2024+, aclarar que esta en Capital Humano.

## Keys Compuestas (CRITICO)
programa_id NO es globalmente unico.
- dim_programa: ON h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id
- dim_subprograma: ON h.servicio_id = sp.servicio_id AND h.programa_id = sp.programa_id AND h.subprograma_id = sp.subprograma_id
- dim_funcion: ON h.finalidad_id = fu.finalidad_id AND h.funcion_id = fu.funcion_id
Dimensiones simples (1 campo): dim_jurisdiccion, dim_inciso, dim_finalidad, dim_fuente_financiamiento, dim_ubicacion_geografica, dim_servicio.

## Formato de datos para graficos en generateDashboard
[mantener la seccion actual de formatos Nivo: sankey, treemap, bar, pie, line]

## Reglas anti-layout-break (OBLIGATORIAS)
[mantener la seccion actual: KPIs 2-4, Charts max 3, Bar max 15, etc.]

## Schema de la Base de Datos
${schemaDoc}
`;
}
```

---

## 13. Mapa Completo de Archivos a Modificar/Crear

### Archivos a MODIFICAR:

| # | Archivo | Cambios |
|---|---------|---------|
| 1 | `etl-codex/sql/01_schema_core.sql` | +credito_vigente, +3 dims, +3 dims hist, +conversations, +agent_memories, +RLS, +indices |
| 2 | `etl-codex/scripts/etl-credito-devengado-core.ts` | +vigente, +finalidad/funcion/fuente al parse, +6 dims maps, +row_hash expandido |
| 3 | `schema/presupuesto-nacion.md` | REESCRIBIR completo: multi-anio, 9 dims, vigente+devengado, IPC, contexto multi-gobierno |
| 4 | `src/lib/ai/prompts.ts` | REESCRIBIR: flujo pensar-antes-consultar, memorias, contexto multi-gobierno, firma getSystemPrompt(memories) |
| 5 | `src/lib/ai/tools.ts` | +rememberFact tool, actualizar description de executeSQL |
| 6 | `src/app/api/chat/route.ts` | +rememberFact en tools, +loadMemories, pasar memories a getSystemPrompt |
| 7 | `src/app/page.tsx` | Layout 3 columnas, useConversations, auto-save, auto-title, preguntas nuevas |
| 8 | `src/components/ai/message-list.tsx` | +handling rememberFact tool part |
| 9 | `src/lib/types.ts` | +ConversationMeta, +Conversation interfaces |

### Archivos a CREAR:

| # | Archivo | Proposito |
|---|---------|-----------|
| 10 | `src/lib/db/memories.ts` | loadMemories() - cargar memorias permanentes del server |
| 11 | `src/lib/db/conversations.ts` | CRUD conversaciones: create, load, save, rename, list, delete |
| 12 | `src/hooks/useConversations.ts` | Hook React: estado de conversaciones, auto-restore, CRUD wrappers |
| 13 | `src/components/chat/conversation-sidebar.tsx` | Sidebar: lista de conversaciones, edicion inline, borrado, nueva |

### Archivos SIN CAMBIOS:

- `src/lib/ai/config.ts` — Google Gemini 3 Flash sigue igual
- `src/lib/db/supabase.ts` — Ya tiene createServerSupabaseClient y createBrowserSupabaseClient
- `src/components/charts/*` — Todos los graficos Nivo siguen igual
- `src/components/dashboard/*` — Dashboard panel sigue igual
- `etl-codex/scripts/_shared.ts` — Utilidades compartidas sin cambios
- `etl-codex/scripts/load-ipc.ts` — Cargador IPC sin cambios

---

## 14. Orden de Implementacion (Fases)

### Fase 1: Schema SQL + ETL (Backend Data)
1. Modificar `etl-codex/sql/01_schema_core.sql` — agregar columnas, dims, tablas conversaciones/memoria
2. Ejecutar SQL en Supabase
3. Modificar `etl-codex/scripts/etl-credito-devengado-core.ts` — vigente + 3 dims
4. Ejecutar ETL: `npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2019 --to 2025`
5. Ejecutar IPC: `npx tsx etl-codex/scripts/load-ipc.ts`
6. Validar con queries de verificacion

### Fase 2: Schema Doc + Prompt (Cerebro del Agente)
7. Reescribir `schema/presupuesto-nacion.md`
8. Reescribir `src/lib/ai/prompts.ts` — flujo pensar-antes-consultar + memorias

### Fase 3: Tools + API (Backend App)
9. Crear `src/lib/db/memories.ts`
10. Modificar `src/lib/ai/tools.ts` — agregar rememberFact
11. Modificar `src/app/api/chat/route.ts` — memories + 3ra tool

### Fase 4: Gestion de Conversaciones (Frontend Core)
12. Agregar tipos a `src/lib/types.ts` — ConversationMeta, Conversation
13. Crear `src/lib/db/conversations.ts` — CRUD Supabase
14. Crear `src/hooks/useConversations.ts` — Hook completo con auto-restore
15. Crear `src/components/chat/conversation-sidebar.tsx` — Sidebar con edicion inline

### Fase 5: Integracion UI (Frontend Final)
16. Modificar `src/app/page.tsx`:
    - Layout 3 columnas (sidebar + chat + dashboard)
    - Integrar useConversations
    - Auto-save mensajes despues de cada respuesta
    - Auto-title con conclusion del primer dashboard
    - Preguntas sugeridas multi-anio
17. Modificar `src/components/ai/message-list.tsx` — rememberFact handling

### Fase 6: Verificacion
18. `npm run build` — sin errores
19. `npm run dev` — test manual:
    - Hacer pregunta → verificar que se guarda conversacion
    - Recargar pagina → verificar que se restaura
    - Crear nueva conversacion → verificar que la anterior queda en sidebar
    - Continuar conversacion anterior → verificar mensajes + dashboard
    - Renombrar conversacion → verificar que se actualiza
    - Borrar conversacion → verificar que desaparece
    - Preguntas multi-anio → verificar datos correctos
    - Pregunta ambigua → verificar que el agente aclara antes de consultar
    - Memoria permanente → nueva sesion recuerda preferencias

---

## 15. Queries de Verificacion Post-Migracion

```sql
-- 1. Conteo por anio
SELECT ejercicio_presupuestario, COUNT(*) AS filas
FROM fact_credito_devengado_mensual
GROUP BY 1 ORDER BY 1;

-- 2. Vigente total por anio (nueva metrica)
SELECT ejercicio_presupuestario,
       SUM(credito_vigente) AS vigente_total,
       SUM(credito_devengado) AS devengado_total
FROM fact_credito_devengado_mensual
GROUP BY 1 ORDER BY 1;

-- 3. Finalidades (nueva dimension)
SELECT f.finalidad_desc, SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
JOIN dim_finalidad f ON f.finalidad_id = h.finalidad_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 ORDER BY 2 DESC;

-- 4. Funciones (nueva dimension compuesta)
SELECT fi.finalidad_desc, fu.funcion_desc, SUM(h.credito_devengado)
FROM fact_credito_devengado_mensual h
JOIN dim_finalidad fi ON fi.finalidad_id = h.finalidad_id
JOIN dim_funcion fu ON fu.finalidad_id = h.finalidad_id AND fu.funcion_id = h.funcion_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;

-- 5. Subejecucion (devengado + vigente)
SELECT j.jurisdiccion_desc,
       SUM(h.credito_vigente) AS vigente,
       SUM(h.credito_devengado) AS devengado,
       ROUND((1 - SUM(h.credito_devengado) / NULLIF(SUM(h.credito_vigente), 0)) * 100, 1) AS pct_sub
FROM fact_credito_devengado_mensual h
JOIN dim_jurisdiccion j ON j.jurisdiccion_id = h.jurisdiccion_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 HAVING SUM(h.credito_vigente) > 0
ORDER BY pct_sub DESC;

-- 6. Fuentes de financiamiento (nueva dimension)
SELECT ff.fuente_financiamiento_desc, SUM(h.credito_devengado)
FROM fact_credito_devengado_mensual h
JOIN dim_fuente_financiamiento ff ON ff.fuente_financiamiento_id = h.fuente_financiamiento_id
WHERE h.ejercicio_presupuestario = 2024
GROUP BY 1 ORDER BY 2 DESC;

-- 7. Tablas de memoria (vacias al inicio)
SELECT COUNT(*) FROM chat_sessions;
SELECT COUNT(*) FROM agent_memories;
```

---

## 16. Riesgos y Mitigaciones

| Riesgo | Prob | Impacto | Mitigacion |
|--------|------|---------|------------|
| CSV 2019 tiene columnas distintas a 2024 | Alta | Medio | ETL ya detecta delimiter y normaliza. Agregar mapping de columnas faltantes. |
| ETL tarda mucho (7 anios × 500K rows) | Alta | Bajo | Es idempotente, se puede pausar y reiniciar. Correr fuera de horario. |
| Vigente no existe en CSVs viejos | Media | Medio | Verificar que la columna exista. Si no, poner 0 y documentar. |
| Prompt muy largo (schema + memorias) | Media | Medio | Schema doc <3000 tokens. Memorias max 20 entries. Gemini Flash soporta 1M tokens. |
| Supabase storage lleno (3.5M rows) | Baja | Alto | Plan Pro soporta 8GB. Estimar ~2GB para fact + dims. Monitorear. |
| Memorias se llenan de ruido | Baja | Bajo | El prompt dice "no guardes informacion obvia". Max 20 cargadas. Se puede limpiar manual. |
| Sesiones viejas acumulan storage | Baja | Bajo | No implementar limpieza automatica ahora. Manual cuando sea necesario. |

---

## 17. Lo Que NO Hacemos (YAGNI)

- Autenticacion de usuarios (todo anonimo, sin user_id)
- Embeddings / pgvector para memorias (pocas memorias, cargar todas)
- Edicion de memorias desde UI
- Exportacion de conversaciones a PDF/CSV
- Busqueda full-text de conversaciones
- Limpieza automatica de conversaciones/memorias viejas
- Tool de confirmacion (el flujo pensar-antes-consultar es solo prompt)
- Selector visual de periodo en la UI
- Materialized views (si performance es aceptable sin ellas)
- Datos pre-2019 (expandir despues si se necesita)
- Carpetas/tags para organizar conversaciones
- Compartir conversaciones entre usuarios
- Streaming del titulo (el titulo se genera post-response, no en tiempo real)

---

## 18. Como Retomar Este Plan en Nueva Ventana de Contexto

Para implementar desde una ventana limpia, decirle a Claude:

```
Lee docs/plans/2025-02-07-expansion-multianio-design.md y ejecuta la Fase N.
```

**Contexto critico que NO esta en el plan (leer si es necesario):**
- ETL actual completo: `etl-codex/scripts/etl-credito-devengado-core.ts`
- Schema SQL actual: `etl-codex/sql/01_schema_core.sql`
- Schema doc del ETL: `etl-codex/schema/presupuesto-nacion-core-multianio.md`
- Utilidades compartidas ETL: `etl-codex/scripts/_shared.ts`
- Instrucciones ETL: `etl-codex/docs/INSTRUCCIONES_SUPABASE_Y_ETL.md`
- App actual completa: `src/app/page.tsx`, `src/lib/ai/tools.ts`, `src/lib/ai/prompts.ts`

---

*Plan generado el 2025-02-07. Actualizado con gestion completa de conversaciones. Listo para implementacion.*
