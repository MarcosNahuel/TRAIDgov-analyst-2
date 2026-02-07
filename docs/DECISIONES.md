# Decisiones Tecnicas - TRAIDgov Analyst

Registro de decisiones de arquitectura y tecnologia tomadas durante el desarrollo.

## 1. AI SDK v6 (paquete `ai@6.0.74`)

**Contexto**: AI SDK v5+ introdujo cambios breaking significativos respecto a v4.

**Decisiones**:
- `tool()` usa `inputSchema` en lugar de `parameters`
- `streamText` usa `stopWhen: stepCountIs(5)` en lugar de `maxSteps: 5`
- Response se genera con `toUIMessageStreamResponse()` en lugar de `toDataStreamResponse()`
- `useChat()` sin argumentos: el default `DefaultChatTransport` ya apunta a `/api/chat`
- `sendMessage({ text })` para enviar mensajes (no `handleSubmit`)
- Messages usan `parts[]` array con tipos `text`, `tool-<toolName>`, etc.
- Tool states: `input-streaming`, `input-available`, `output-available`, `output-error`

**Zod v4 vs v3**:
- Se instalo `zod@4.x` pero AI SDK requiere tipos compatibles con v3
- Solucion: `import { z } from "zod/v3"` (subpath export de compatibilidad)

## 2. Arquitectura "Minimal Agent"

**Contexto**: Patron de Vercel "We Removed 80% of Our Agent's Tools".

**Decision**: Solo 2 tools:
1. `executeSQL` - Ejecuta queries SELECT read-only via Supabase RPC
2. `generateVisual` - Genera config JSON para Nivo (sin execute, frontend renderiza)

**Alternativas descartadas**:
- Multiple tools especializados (getJurisdicciones, getGastos, etc.)
- RAG con embeddings para el schema
- Agent con planning/reasoning separado

**Razon**: El schema doc inyectado como system prompt le da al LLM todo el contexto que necesita para generar SQL libre.

## 3. Schema como Contexto (no como Tool)

**Decision**: El archivo `schema/presupuesto-nacion.md` se lee al iniciar el server y se inyecta en el system prompt.

**Ventajas**:
- El LLM tiene todo el contexto sin tool calls extra
- Menor latencia (no hay round-trip para entender el schema)
- El schema doc incluye reglas de negocio, JOINs y ejemplos

## 4. Supabase RPC `execute_readonly_query`

**Decision**: Usar una funcion PostgreSQL SECURITY DEFINER con timeout de 10s.

**Seguridad**:
- Valida que la query empiece con SELECT
- Bloquea DDL/DML keywords en el server tambien
- Row Level Security habilitado en todas las tablas
- Role de anon solo puede leer

## 5. Nivo para Visualizaciones

**Decision**: Nivo en lugar de Recharts, Chart.js o D3 directo.

**Razon**:
- Sankey diagram nativo (critico para flujos de presupuesto)
- TreeMap nativo (critico para jerarquias)
- API declarativa (JSON config → chart)
- Excelente soporte de temas oscuros
- SSR-compatible con `serverExternalPackages` en Next.js

## 6. Dataset Anual (no Mensual)

**Decision**: Usar `credito-anual-2024.zip` de MECON como fuente principal.

**URL**: `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-anual-2024.zip`

**Razon**: El usuario solicito datos anuales. El dataset contiene la distribucion acumulada de creditos con todos los clasificadores.

**Fallback**: Si el anual no esta disponible, se descarga el mensual.

## 7. Framer Motion para Animaciones

**Decision**: Usar framer-motion para transiciones de UI.

**Donde se usa**:
- Stagger animation en lista de mensajes
- Fade-in del hero/landing
- Transicion de suggested questions

## 8. Tailwind CSS 4.0 + Shadcn/UI

**Decision**: Tailwind 4 con CSS-first config, Shadcn para componentes base.

**Componentes instalados**: button, card, input, scroll-area, skeleton, badge

---

*Ultima actualizacion: 2026-02-06*
