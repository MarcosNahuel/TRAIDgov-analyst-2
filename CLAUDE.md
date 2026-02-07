# TRAIDgov Analyst - Analista Presupuestario AI

> Plataforma de inteligencia financiera pública con IA conversacional.
> Deploy 100% Vercel (serverless). Sin VPS.

## Quick Context

| Aspecto | Valor |
|---------|-------|
| **Proyecto** | Analista Presupuestario Nacional Argentina |
| **Stack** | Next.js 16 + Supabase + AI SDK 5.0 + Nivo |
| **Arquitectura** | "Minimal Agent" (Vercel pattern: 2 tools) |
| **Dataset** | Presupuesto Nación 2024 (476K registros, Star Schema) |
| **Padre** | TRAID GOV (división GovTech de TRAID Agency) |
| **Repo raíz** | `D:\OneDrive\GitHub\TRAIDgov` |

## Filosofía: "The Minimal Agent"

Basado en [Vercel: We Removed 80% of Our Agent's Tools](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools):

> "The best agents might be the ones with the fewest tools."
> "Start with the simplest possible architecture. Model + file system + goal."

**Solo 2 tools:**
1. `executeSQL` → Ejecuta queries en Supabase (read-only)
2. `generateVisual` → Genera configuración Nivo (Sankey, Treemap, Bar)

**El schema presupuestario se inyecta como contexto**, no como tool.
Ver `schema/presupuesto-nacion.md` para la documentación semántica completa.

## Estructura del Proyecto

```
TRAIDgov-analyst/
├── .claude/                    # Claude Code config
│   └── settings.local.json
├── .mcp.json                   # MCP servers (context7, vercel, etc.)
├── schema/                     # Schema docs (inyectados como context al LLM)
│   └── presupuesto-nacion.md   # Diccionario de datos + JOINs + reglas
├── docs/                       # Documentación de desarrollo
│   └── GUIA_DESARROLLO.md      # Guía completa: endpoints → código → testing
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts    # Endpoint principal (AI SDK streamText)
│   │   ├── page.tsx            # UI principal (chat + dashboard)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ai/
│   │   │   ├── message-list.tsx
│   │   │   └── tool-ui-renderer.tsx  # Switch para renderizar Nivo
│   │   ├── charts/
│   │   │   ├── budget-sankey.tsx     # Flujos de dinero
│   │   │   ├── budget-treemap.tsx    # Jerarquías de gasto
│   │   │   ├── budget-bar.tsx        # Rankings y comparaciones
│   │   │   └── budget-calendar.tsx   # Heatmap temporal
│   │   └── ui/                       # Shadcn components
│   └── lib/
│       ├── ai/
│       │   ├── tools.ts              # 2 tools (executeSQL + generateVisual)
│       │   └── prompts.ts            # System prompt + schema injection
│       ├── db/
│       │   └── supabase.ts           # Cliente Supabase (SSR)
│       └── types.ts
├── scripts/
│   └── seed-database.ts              # ETL: CSV → Supabase
├── CLAUDE.md                         # Este archivo
├── PLAN.md                           # Plan de implementación
└── package.json
```

## Stack Técnico

| Capa | Tecnología | Versión |
|------|------------|---------|
| **Framework** | Next.js | 16 |
| **Runtime** | React | 19.2 |
| **AI** | Vercel AI SDK | 5.0 |
| **LLM** | Claude Sonnet 4.5 / Gemini 2.0 Flash | Latest |
| **DB** | Supabase (PostgreSQL + pgvector) | Latest |
| **Charts** | Nivo | Latest |
| **Styling** | Tailwind CSS 4.0 + Shadcn/UI | Latest |
| **Animations** | Framer Motion | 11+ |
| **Deploy** | Vercel | Serverless |

## Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build
npm run build

# ETL: cargar datos presupuestarios
npx tsx scripts/seed-database.ts

# Lint
npm run lint
```

## Variables de Entorno (.env.local)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# LLM (elegir uno o ambos)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Vercel AI SDK
AI_PROVIDER=anthropic  # o "google"
AI_MODEL=claude-sonnet-4-5-20250929  # o "gemini-2.0-flash"
```

## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/chat` | POST | Chat streaming con AI SDK (streamText) |

## Supabase Schema

### Tabla de hechos
- `presupuesto_nacion_2024` → 476,012 registros

### Dimensiones (19 tablas)
- `dim_jurisdiccion` (23 ministerios)
- `dim_programa`, `dim_actividad`, `dim_obra`
- `dim_inciso` (8 tipos de gasto)
- `dim_finalidad` (6), `dim_funcion` (30)
- `dim_servicio` (742), `dim_entidad`
- Y 10 más...

### Métricas
- `credito_presupuestado` → Inicial del Congreso
- `credito_vigente` → Ajustado (DNU)
- `credito_devengado` → Gasto real
- `credito_pagado` → Salida del Tesoro

**Schema completo:** `schema/presupuesto-nacion.md`

## Documentación Clave

| Archivo | Propósito |
|---------|-----------|
| `PLAN.md` | Plan de implementación completo |
| `docs/GUIA_DESARROLLO.md` | Guía desde investigación hasta testing |
| `schema/presupuesto-nacion.md` | Diccionario de datos para el LLM |
| `Arquitectura Vercel para Analista Presupuestario AI.md` | Spec técnica original |

## Contexto de Proyectos Anteriores

| Proyecto | Qué se aprendió | Qué se reutiliza |
|----------|-----------------|-------------------|
| **n8n workflow** | Orquestación multi-agente, QuickChart.io | Prompts de SQL Agent, lógica de dimensiones |
| **SQL-AGENT-NEW** | Heurísticas para bypass LLM, SSE streaming | Patrón de streaming, componentes de dashboard |
| **Spec Deep Research** | Generative UI, Golden Loop, Nivo | Arquitectura de tools, schema design |

## MCP Servers Disponibles

Ver `.mcp.json` para configuración completa:
- **context7** → Documentación de Next.js, AI SDK, Supabase, Nivo
- **next-devtools** → Debug de Next.js 16
- **vercel** → Deploy y gestión
- **supabase** → Base de datos y auth
- **github** → Gestión del repo

## Principios de Trabajo

1. **Minimal Agent**: Solo 2 tools. El contexto es el schema doc, no más tools.
2. **Confianza en el modelo**: El LLM genera SQL libre. Sin allowlist.
3. **Schema como código**: `schema/presupuesto-nacion.md` es la fuente de verdad.
4. **Generative UI**: Tool invocations → componentes Nivo en el cliente.
5. **100% Serverless**: Sin VPS, sin Docker, sin FastAPI. Solo Vercel.
6. **Seguridad por diseño**: Read-only role en Supabase, RLS policies.

---

*Última actualización: 2026-02-06*
