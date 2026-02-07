# Diseño: Layout Split — Chat + Dashboard Panel

> Fecha: 2026-02-06
> Basado en: SQL-AGENT-NEW (referencia), brainstorming session
> Estado: Aprobado para implementación

---

## Resumen Ejecutivo

Transformar TRAIDgov Analyst de un layout single-column (chat con gráficos inline) a un layout split horizontal:
- **Panel izquierdo (380px):** Chat conversacional con respuestas simples de texto
- **Panel derecho (flex-1):** Dashboard completo con KPIs, gráficos Nivo, análisis narrativo, tablas con export, y navegación entre insights

## Decisiones de Diseño

| Decisión | Elegido | Alternativa descartada |
|----------|---------|----------------------|
| Layout | Split horizontal (380px + flex-1) | Single column actual |
| Panel derecho | Todo completo (KPIs + charts + narrative + tables) | Mínimo viable |
| Arquitectura de tools | DashboardSpec unificado (2 tools) | 3 tools granulares |
| Estilo visual | Híbrido (zinc-950 base + glass cards) | OLED black puro |
| Tipos de gráficos | 5 tipos (bar, sankey, treemap, pie, line) | Solo 3 actuales |

---

## 1. Arquitectura de Tools

### Tool 1: `executeSQL` (sin cambios)
- Query SQL SELECT → Supabase → JSON results
- Validación de seguridad (solo SELECT/WITH)

### Tool 2: `generateDashboard` (reemplaza `generateVisual`)
- El LLM genera un DashboardSpec completo en una sola tool call
- Incluye: KPIs, charts, tablas, narrativa AI
- Se renderiza completo en el panel derecho

**Flujo:**
```
Usuario pregunta → LLM → executeSQL (datos) → generateDashboard (spec) → Panel derecho
                     └→ texto simple (conclusion) → Chat izquierdo
```

---

## 2. DashboardSpec — Contrato LLM ↔ UI

```typescript
interface DashboardSpec {
  title: string              // "Gasto del Ministerio de Salud 2024"
  conclusion: string         // Resumen corto (también va al chat)

  kpis: KpiCard[]            // 2-4 tarjetas de métricas principales
  charts: ChartConfig[]      // 1-3 gráficos Nivo
  tables: TableConfig[]      // 0-1 tablas con datos crudos
  narrative: Narrative        // Análisis AI profundo
}

interface KpiCard {
  label: string              // "Crédito Devengado"
  value: number              // 1234567890
  format: "currency" | "number" | "percent"
  delta?: number             // % cambio (ej: -15.3)
  trend?: "up" | "down" | "neutral"
}

interface ChartConfig {
  type: "bar" | "sankey" | "treemap" | "pie" | "line"
  title: string
  data: any                  // Payload específico de cada tipo Nivo
  config?: {
    layout?: "horizontal" | "vertical"
    colors?: string[]
    keys?: string[]
    indexBy?: string
  }
}

interface TableConfig {
  title: string
  columns: string[]
  rows: Record<string, any>[]
  downloadable: boolean      // Habilita CSV/Excel
}

interface Narrative {
  headline: string           // Conclusión principal
  summary: string            // Resumen ejecutivo
  insights: string[]         // Bullets detallados
  callouts?: string[]        // Alertas/recomendaciones
}
```

---

## 3. Layout — Panel Izquierdo (Chat)

**Ancho:** 380px fijo
**Contenido:**

```
┌─────────────────────────┐
│ 🏛️ TRAIDgov             │  Header: logo + estado conexión
│ Analista Presupuestario  │
├─────────────────────────┤
│                         │
│ 👤 Mensaje usuario      │  Burbuja derecha (accent)
│                         │
│ 🤖 Respuesta texto      │  Burbuja izquierda (gris)
│  simple, conciso        │  = conclusion del DashboardSpec
│                         │
│ [Timeline agente]       │  Mientras procesa: pasos del agente
│                         │
├─────────────────────────┤
│ [Preguntá sobre...   🔵]│  Input sticky al fondo
└─────────────────────────┘
```

**Comportamiento:**
- Sin gráficos inline. Solo texto.
- La `conclusion` del DashboardSpec se muestra como respuesta del chat.
- Chat vacío → preguntas sugeridas (6 tarjetas).
- Scroll automático al último mensaje.
- Timeline del agente mientras procesa (ícono + step name).

---

## 4. Layout — Panel Derecho (Dashboard)

**Ancho:** flex-1 (resto del viewport)
**Contenido:**

```
┌──────────────────────────────────────────────┐
│ ◀ Insight 2 de 3 ▶              Trace: abc123│  NavigationHeader
├──────────────────────────────────────────────┤
│ ✨ Título del Dashboard                      │
│                                              │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │  KPI Cards (grid 2-4 cols)
│ │Vigente │ │Deveng. │ │Ejec. % │ │Pagado  │ │
│ │$1.4B   │ │$1.2B   │ │85.3%   │ │$1.1B   │ │
│ └────────┘ └────────┘ └────────┘ └────────┘ │
│                                              │
│ ┌──────────────────┐ ┌──────────────────┐    │  Charts (grid responsive)
│ │ Nivo Bar/Sankey  │ │ Nivo Pie/Line    │    │
│ │                  │ │                  │    │
│ └──────────────────┘ └──────────────────┘    │
│                                              │
│ ┌────────────────────────────────────────┐   │  NarrativePanel
│ │ 🧠 Análisis AI                        │   │
│ │ CONCLUSIÓN: ...                       │   │
│ │ RESUMEN: ...                          │   │
│ │ • Insight 1                           │   │
│ │ ⚠️ Alerta: subejecución              │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ ┌────────────────────────────────────────┐   │  DataTable + export
│ │ 📋 Datos detallados    [⬇CSV] [⬇XLS] │   │
│ │ | Col1 | Col2 | Col3 |                │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**Navegación de Insights:**
- Cada pregunta genera un nuevo "insight" (DashboardSpec)
- Se apilan en un array `dashboards[]`
- Flechas ◀▶ para navegar entre dashboards anteriores
- Texto "Insight X de Y" centrado
- Auto-navega al último insight al recibir respuesta nueva

---

## 5. Componentes a Crear/Modificar

### Nuevos componentes:

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| `DashboardPanel` | `src/components/dashboard/dashboard-panel.tsx` | Orquestador del panel derecho |
| `InsightNavigation` | `src/components/dashboard/insight-navigation.tsx` | "Insight X de Y" con flechas |
| `KpiCardGrid` | `src/components/dashboard/kpi-card-grid.tsx` | Grid de 2-4 KPI cards animadas |
| `NarrativePanel` | `src/components/dashboard/narrative-panel.tsx` | Análisis AI (headline, insights, callouts) |
| `DataTableExport` | `src/components/dashboard/data-table-export.tsx` | Tabla con botones CSV/Excel |
| `BudgetPie` | `src/components/charts/budget-pie.tsx` | Nivo Pie chart (nuevo) |
| `BudgetLine` | `src/components/charts/budget-line.tsx` | Nivo Line chart (nuevo) |
| `ChartRenderer` | `src/components/dashboard/chart-renderer.tsx` | Switch que delega al chart correcto |
| `AgentTimeline` | `src/components/ai/agent-timeline.tsx` | Pasos del agente mientras procesa |

### Componentes a modificar:

| Componente | Cambio |
|------------|--------|
| `page.tsx` | Layout split horizontal (de single column a 2 paneles) |
| `tool-ui-renderer.tsx` | Manejar nuevo tool `generateDashboard` |
| `tools.ts` | Reemplazar `generateVisual` por `generateDashboard` |
| `prompts.ts` | Actualizar system prompt con formato DashboardSpec |
| `message-list.tsx` | Simplificar (solo texto, sin tool renders inline) |

### Componentes existentes sin cambios:
- `budget-sankey.tsx`, `budget-treemap.tsx`, `budget-bar.tsx` (se reutilizan)
- Componentes Shadcn UI

---

## 6. Estilo Visual — Híbrido

**Base:** zinc-950 (actual, sobrio/institucional)
**Mejoras:**
- Glass morphism cards para KPIs y charts (backdrop-blur, border sutil)
- Accent colors: violet-600 (TRAID), emerald-500 (positivo), red-500 (negativo)
- Framer Motion: fade-in + slide-up en componentes del dashboard
- Border glow sutil en cards hover

**NO incluir:**
- Fondo negro puro (#000)
- Neon glow effects
- Exceso de transparencias

---

## 7. Dependencias npm a agregar

```bash
npm install @nivo/pie @nivo/line xlsx
```

- `@nivo/pie` — Gráfico de torta/dona
- `@nivo/line` — Gráfico de líneas temporales
- `xlsx` — Export a Excel (alternativa: generar CSV nativo sin dependencia)

---

## 8. Plan de Implementación (orden)

1. **Tipos** — Definir `DashboardSpec` y tipos relacionados en `types.ts`
2. **Tool** — Crear `generateDashboard` tool (reemplazar `generateVisual`)
3. **Prompts** — Actualizar system prompt con formato DashboardSpec
4. **Layout** — Refactorizar `page.tsx` a layout split
5. **Dashboard Panel** — `DashboardPanel` + `InsightNavigation`
6. **KPI Cards** — `KpiCardGrid` con animaciones
7. **Chart Renderer** — Switch + nuevos charts (Pie, Line)
8. **Narrative** — `NarrativePanel`
9. **Data Table** — `DataTableExport` con CSV/Excel
10. **Agent Timeline** — Feedback visual mientras procesa
11. **Polish** — Estilos glass, animaciones, responsive

---

*Diseño validado en sesión de brainstorming 2026-02-06*
