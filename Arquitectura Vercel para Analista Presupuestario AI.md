# **SPEC.md: Arquitectura Maestra del Analista Presupuestario Argentino con IA**

## **1\. Visión Ejecutiva y Filosofía Arquitectónica**

### **1.1 Introducción y Alcance**

Este documento constituye la especificación técnica definitiva ("Master Technical Specification") para el desarrollo del **Argentine Budget AI Analyst**, una plataforma de inteligencia financiera diseñada para democratizar, visualizar y auditar en tiempo real el Presupuesto de la Administración Pública Nacional de la República Argentina.

La arquitectura propuesta marca una ruptura fundamental con los paradigmas tradicionales de "Chat-to-SQL". En lugar de depender de agentes SQL frágiles que ejecutan consultas opacas contra bases de datos estáticas, diseñamos un sistema **"Vercel Native"** que integra Inteligencia Artificial Generativa, renderizado de interfaz de usuario en el cliente (Generative UI) y un ciclo de validación visual autónomo. El objetivo no es solo responder preguntas, sino construir narrativas visuales interactivas que expliquen el flujo de fondos públicos, desde la asignación legislativa hasta la ejecución física y financiera.1

El núcleo de esta transformación reside en la adopción del ecosistema **Vercel AI SDK 4.0** y **Next.js 15**, abandonando las arquitecturas monolíticas en favor de una infraestructura serverless distribuida. La persistencia de datos se delega a **Supabase**, utilizando PostgreSQL no solo como almacén relacional, sino como motor vectorial (pgvector) para dotar al agente de una memoria semántica de largo plazo.3

### **1.2 Filosofía "Generative UI" y la Evolución de StreamUI**

El requerimiento original solicitaba explícitamente el uso de streamUI. Sin embargo, como Arquitecto Distinguido, es imperativo alinear la implementación con la realidad actual del ecosistema Vercel. La función streamUI, parte del paquete experimental RSC (React Server Components) del AI SDK, se encuentra actualmente en un estado de desarrollo pausado y transición, presentando limitaciones en el manejo de llamadas a herramientas paralelas y persistencia de estado.5

Por consiguiente, esta arquitectura implementará el patrón de **"Generative UI via Tool Invocations"**, que representa el estándar de producción actual en el AI SDK 4.0/5.0.7 Este enfoque desacopla la generación de datos (en el servidor mediante streamText y herramientas Zod) de la renderización visual (en el cliente mediante useChat y componentes React). Esto garantiza:

1. **Estabilidad:** Evita las aristas experimentales de los streams de componentes de servidor puros.  
2. **Interactividad:** Permite que los gráficos (Nivo Sankeys, Treemaps) mantengan interactividad completa en el cliente (tooltips, filtros, animaciones), algo que es complejo de gestionar con componentes transmitidos desde el servidor.  
3. **Tipado Estricto:** Utiliza esquemas Zod para garantizar que la IA no solo "imagine" una visualización, sino que construya una estructura de datos válida que el frontend pueda consumir sin errores.9

### **1.3 Innovación Crítica: "The Self-Correcting Documentation Loop"**

El mayor riesgo en los agentes de análisis financiero es la alucinación visual: generar un gráfico que parece correcto pero cuyos datos no cuadran, o cuya estructura (ej. un diagrama de Sankey) contiene ciclos lógicos imposibles.

Para mitigar esto, introducimos el **Ciclo de Documentación Autocorrectiva**. Este subsistema asíncrono actúa como un "Crítico Visual". Cuando el agente propone una visualización compleja, un proceso en segundo plano (Headless Browser) renderiza el gráfico, captura una imagen y la somete a un juicio de visión artificial. Si el gráfico es legible y preciso, se guarda como un "Golden Artifact" (Artefacto Dorado) en la base de datos vectorial. Futuras consultas semánticamente similares recuperarán este artefacto validado en lugar de intentar generar uno nuevo desde cero, reduciendo la latencia y garantizando la consistencia.11

## ---

**2\. Estrategia de Datos e Ingeniería ETL**

El éxito del Analista depende de la calidad y granularidad de los datos subyacentes. El portal presupuestoabierto.gob.ar y el catálogo de datos abiertos datos.gob.ar ofrecen múltiples vías de ingestión, cada una con compensaciones específicas entre frescura y volumetría.

### **2.1 Análisis de Fuentes de Datos**

La investigación identifica dos vectores principales de datos:

1. **API REST de Presupuesto Abierto (/api/v1/...):**  
   * **Ventajas:** Proporciona acceso a cortes específicos y metadatos actualizados.  
   * **Limitaciones:** La documentación indica que está optimizada para "automatizar análisis frecuentes" pero puede sufrir limitaciones de tasa o rendimiento en agregaciones masivas a nivel nacional.1 Los endpoints clave incluyen /api/v1/credito y /api/v1/programacion\_fisica.  
   * **Uso en Arquitectura:** Validación en tiempo real ("Live Check") y consultas de metadatos específicos (ej. buscar el ID de un programa específico).  
2. **Datasets Masivos (CSV/ZIP):**  
   * **Ventajas:** Contienen la granularidad atómica necesaria para el análisis profundo. Los archivos "Crédito Presupuestario" incluyen desgalses por jurisdiccion, entidad, programa, actividad, objeto\_gasto, fuente\_financiamiento y ubicacion\_geografica.  
   * **Estructura:** Los archivos CSV suelen estar normalizados, pero presentan desafíos como inconsistencias en nombres de columnas entre años (2018 vs 2024\) y codificación de caracteres.16  
   * **Uso en Arquitectura:** Fuente primaria de verdad (OLAP). Estos datos alimentarán la base de datos PostgreSQL en Supabase.

### **2.2 Diccionario de Datos y Mapeo Semántico**

Para que el Agente AI comprenda el presupuesto, debemos mapear los términos técnicos a conceptos semánticos.

| Campo Técnico (CSV/API) | Concepto de Negocio | Descripción y Uso |
| :---- | :---- | :---- |
| ejercicio\_presupuestario | Año Fiscal | Fundamental para series de tiempo y comparación interanual. |
| jurisdiccion\_id / desc | Ministerio / Poder | Nivel más alto de agrupación (ej. Ministerio de Salud). |
| programa\_id / desc | Política Pública | Unidad operativa de asignación de recursos (ej. Vacunación). |
| actividad\_id / desc | Acción Específica | Desglose fino dentro de un programa. |
| inciso\_id / desc | Tipo de Gasto | Clasificador económico (ej. Gastos en Personal, Bienes de Consumo). Crucial para Treemaps. |
| credito\_presupuestado | Presupuesto Inicial | Lo aprobado por la Ley de Presupuesto del Congreso. |
| credito\_vigente | Presupuesto Actual | El presupuesto inicial \+ modificaciones (DNU, Decisiones Administrativas). |
| credito\_devengado | Gasto Ejecutado | El momento en que nace la obligación de pago (el bien/servicio fue recibido). Es la métrica real de ejecución. |
| credito\_pagado | Gasto Pagado | Salida efectiva de fondos del Tesoro. La diferencia con el devengado genera la "Deuda Flotante". |

**Insight de Segundo Orden:** La diferencia entre credito\_vigente y credito\_devengado indica el nivel de subejecución presupuestaria, un indicador político clave. La diferencia entre devengado y pagado indica estrés financiero o retrasos en pagos a proveedores. El Agente debe ser instruido para calcular y resaltar estas brechas automáticamente.2

### **2.3 Pipeline ETL Híbrido**

Implementaremos un proceso de ingestión robusto utilizando **Node.js Streams** para manejar la carga masiva en Supabase sin saturar la memoria de las funciones serverless.

#### **2.3.1 Ingesta Masiva (Batch Processing)**

Utilizaremos scripts programados (Cron Jobs en Vercel) que:

1. Verifican la fecha de actualización de los datasets en datos.gob.ar.20  
2. Descargan los archivos ZIP/CSV comprimidos.  
3. Utilizan pg-copy-streams para realizar un COPY directo a tablas temporales en Supabase.  
4. Ejecutan procedimientos almacenados SQL para normalizar y upsertar (insertar o actualizar) los datos en la tabla maestra budget\_executions.  
5. Actualizan los índices de búsqueda de texto completo (tsvector) para permitir búsquedas rápidas por palabras clave.21

#### **2.3.2 Validación en Tiempo Real (On-Demand)**

Dado que los CSV pueden tener un retraso de días o semanas, el Agente tendrá una herramienta checkRealTimeStatus. Si el usuario pregunta por un evento muy reciente, el Agente consultará la API /api/v1/credito para obtener el dato más fresco posible y contrastarlo con el dato histórico del CSV.14

### **2.4 Schema SQL en Supabase**

El esquema de base de datos está diseñado para soportar tanto consultas analíticas rápidas (OLAP) como búsqueda semántica (Vector).

SQL

\-- Extensión para vectores (embeddings)  
CREATE EXTENSION IF NOT EXISTS vector;  
\-- Extensión para búsqueda de texto rápido (trigramas)  
CREATE EXTENSION IF NOT EXISTS pg\_trgm;

\-- Tabla Maestra de Ejecución Presupuestaria (Desnormalizada para velocidad)  
CREATE TABLE budget\_executions (  
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  
    year INTEGER NOT NULL,  
      
    \-- Clasificadores Institucionales y Programáticos  
    jurisdiction\_id TEXT,  
    jurisdiction\_desc TEXT,  
    entity\_id TEXT,          \-- Organismo Descentralizado  
    entity\_desc TEXT,  
    program\_id TEXT,  
    program\_desc TEXT,  
    activity\_id TEXT,  
    activity\_desc TEXT,  
      
    \-- Clasificadores Económicos y Financieros  
    expense\_category\_id TEXT, \-- Inciso (ej. 1 \- Gastos en Personal)  
    expense\_category\_desc TEXT,  
    financing\_source\_id TEXT, \-- Fuente de Financiamiento  
    financing\_source\_desc TEXT,  
      
    \-- Métricas Financieras (Numeric para precisión monetaria)  
    budget\_original NUMERIC(20, 2), \-- Crédito Inicial  
    budget\_current NUMERIC(20, 2),  \-- Crédito Vigente  
    committed NUMERIC(20, 2),       \-- Compromiso  
    accrued NUMERIC(20, 2),         \-- Devengado  
    paid NUMERIC(20, 2),            \-- Pagado  
      
    \-- Metadatos de Auditoría  
    last\_updated TIMESTAMPTZ DEFAULT NOW(),  
    source\_file TEXT  
);

\-- Índices Compuestos para Agregaciones Rápidas  
CREATE INDEX idx\_budget\_agg\_fast ON budget\_executions (year, jurisdiction\_desc, program\_desc);  
CREATE INDEX idx\_budget\_full\_text ON budget\_executions USING GIN (to\_tsvector('spanish', jurisdiction\_desc |

| ' ' |  
| program\_desc |  
| ' ' |  
| activity\_desc));

\-- Tabla de Artefactos Dorados (Memoria Visual)  
CREATE TABLE golden\_artifacts (  
    id UUID DEFAULT gen\_random\_uuid() PRIMARY KEY,  
    user\_query TEXT NOT NULL,                \-- La pregunta original del usuario  
    chart\_type TEXT NOT NULL,                \-- 'sankey', 'treemap', 'bar\_race'  
    chart\_config JSONB NOT NULL,             \-- La configuración JSON validada para Nivo  
      
    \-- Métricas de Validación  
    validation\_score FLOAT,                  \-- Puntaje otorgado por el Agente de Navegación (0.0 \- 1.0)  
    validation\_log TEXT,                     \-- Comentarios del validador (ej. "Texto superpuesto corregido")  
    created\_at TIMESTAMPTZ DEFAULT NOW(),  
      
    \-- Embedding Semántico para RAG  
    embedding VECTOR(1536)                   \-- Generado por text-embedding-3-small  
);

\-- Función de Búsqueda de Artefactos (Hybrid Search)  
CREATE OR REPLACE FUNCTION match\_golden\_artifacts (  
  query\_embedding VECTOR(1536),  
  match\_threshold FLOAT,  
  match\_count INT  
)  
RETURNS TABLE (  
  id UUID,  
  user\_query TEXT,  
  chart\_config JSONB,  
  similarity FLOAT  
)  
LANGUAGE plpgsql  
AS $$  
BEGIN  
  RETURN QUERY  
  SELECT  
    golden\_artifacts.id,  
    golden\_artifacts.user\_query,  
    golden\_artifacts.chart\_config,  
    1 \- (golden\_artifacts.embedding \<=\> query\_embedding) AS similarity  
  FROM golden\_artifacts  
  WHERE 1 \- (golden\_artifacts.embedding \<=\> query\_embedding) \> match\_threshold  
  ORDER BY golden\_artifacts.embedding \<=\> query\_embedding  
  LIMIT match\_count;  
END;  
$$;

## ---

**3\. Arquitectura del Agente AI (Vercel AI SDK)**

Esta sección define el cerebro del sistema. Utilizaremos el Vercel AI SDK 4.0/5.0 en su modalidad Core para la lógica del servidor y UI para la interacción del cliente.

### **3.1 Patrón de "Generative UI" via Tool Invocations**

Contrario al patrón experimental de transmitir componentes de servidor (streamUI), adoptaremos un enfoque robusto basado en **Herramientas Tipadas (Typed Tools)**.

1. **Intención:** El usuario solicita "Muéstrame cómo se distribuye el presupuesto del Ministerio de Educación".  
2. **Razonamiento (Server):** El LLM (GPT-4o o Claude 3.5 Sonnet) analiza la intención y decide invocar la herramienta generateBudgetSankey.  
3. **Ejecución de Herramienta (Server):**  
   * La herramienta ejecuta una consulta SQL agregada en Supabase (ej. SUM(devengado) agrupado por programa).  
   * La herramienta retorna un objeto JSON estructurado con los nodos y enlaces (nodes, links) requeridos por el gráfico Sankey.  
4. **Respuesta (Client):** El hook useChat recibe la toolInvocation.  
5. **Renderizado (Client):** El componente ChatInterface detecta que la herramienta invocada fue generateBudgetSankey y renderiza el componente local \<BudgetSankey data={toolInvocation.result} /\>.

Este enfoque garantiza que la lógica de renderizado visual permanezca en el cliente, aprovechando las capacidades de animación y eventos del navegador, mientras que la lógica de datos pesada reside en el servidor.22

### **3.2 Definición de Herramientas (Zod Schemas)**

Las herramientas son la interfaz entre el lenguaje natural y el sistema técnico. Utilizaremos zod para validar estrictamente las entradas y salidas.

#### **Herramienta 1: queryBudgetDB (Consultas SQL Seguras)**

Permite al Agente explorar los datos crudos antes de visualizar.

TypeScript

import { z } from 'zod';

export const queryBudgetDBSchema \= z.object({  
  year: z.number().describe("Año fiscal a consultar (ej. 2024, 2025)."),  
  groupBy: z.enum(\['jurisdiction', 'program', 'expense\_category'\]).describe("Nivel de agregación."),  
  metric: z.enum(\['budget\_current', 'accrued', 'paid'\]).describe("Métrica financiera a sumar."),  
  filters: z.array(z.object({  
    column: z.string(),  
    operator: z.enum(\['eq', 'neq', 'gt', 'lt'\]),  
    value: z.union(\[z.string(), z.number()\])  
  })).optional().describe("Filtros opcionales SQL-like.")  
});

#### **Herramienta 2: generateVisualConfig (Generación de UI)**

Esta herramienta es el corazón de la UI Generativa. No retorna texto, sino una configuración de gráfico.

TypeScript

export const generateVisualConfigSchema \= z.object({  
  chartType: z.enum(\['sankey', 'treemap', 'bar\_race', 'calendar\_heatmap'\]),  
  title: z.string().describe("Título descriptivo del gráfico."),  
  description: z.string().describe("Explicación breve del insight financiero."),  
  data: z.any().describe("El payload JSON específico para la librería Nivo."),  
  config: z.object({  
    colors: z.array(z.string()).optional(),  
    valueFormat: z.string().optional() // ej. "currency"  
  })  
});

### **3.3 Estrategia de Prompting (System Prompt)**

El prompt del sistema debe configurar al modelo como un experto en finanzas públicas argentinas, no como un asistente genérico.

**System Prompt (Extracto):**

"Actúa como el Analista Principal de Presupuesto de la Nación Argentina. Tu objetivo es revelar la verdad financiera oculta en los datos de presupuestoabierto.gob.ar.

**Reglas de Oro:**

1. **Datos ante todo:** Nunca adivines. Utiliza queryBudgetDB para obtener hechos antes de responder.  
2. **Contexto Financiero:** Diferencia siempre entre 'Crédito Vigente' (promesa) y 'Devengado' (realidad). La subejecución es una señal de alerta que debes destacar.  
3. **Pensamiento Visual:** Si la respuesta implica flujos de dinero, jerarquías o comparaciones, DEBES usar la herramienta generateVisualConfig. No expliques con texto lo que puedes mostrar con un Sankey.  
4. **Validación:** Antes de generar un gráfico, verifica si existe un 'Golden Artifact' similar utilizando searchGoldenArtifacts para asegurar consistencia visual."

## ---

**4\. El Ciclo de Documentación Autocorrectiva ("Golden Loop")**

Esta es la innovación central que diferencia a este proyecto de una simple demo. Los LLMs a menudo generan configuraciones JSON inválidas para visualizaciones complejas (ej. nodos huérfanos en un Sankey o sumas que no cuadran en un Treemap). El "Golden Loop" es un mecanismo de control de calidad autónomo.

### **4.1 Flujo de Trabajo del Browser Agent**

Este proceso ocurre de manera asíncrona o "lazy" (perezosa) tras una interacción exitosa, o de manera proactiva durante la noche para pre-generar vistas comunes.

1. **Disparo:** El sistema identifica una consulta de usuario frecuente o compleja (ej. "Flujo de fondos a Universidades").  
2. **Generación de Candidato:** El Agente AI genera la configuración JSON para un gráfico Nivo.  
3. **Renderizado Headless (Puppeteer):**  
   * Se invoca una Vercel Function que ejecuta @sparticuz/chromium (versión ligera de Chromium para serverless).12  
   * Esta función carga una página HTML mínima que contiene solo el componente Nivo y le inyecta el JSON candidato.  
   * Se captura una captura de pantalla (screenshot) de alta resolución.  
4. **Juicio de Visión (Visual Validation):**  
   * La imagen se envía a un modelo multimodal (GPT-4o Vision).  
   * **Prompt de Validación:** "¿Es este gráfico legible? ¿Se superponen las etiquetas? ¿Hay nodos desconectados? ¿La suma de los flujos de entrada iguala a los de salida?"  
5. **Promoción o Corrección:**  
   * **Pasa:** El JSON se etiqueta como "Golden Artifact", se genera su embedding y se guarda en Supabase.  
   * **Falla:** El feedback visual (ej. "Texto ilegible en nodo X") se devuelve al Agente para que regenere el JSON con parámetros corregidos (ej. aumentar la altura del gráfico o simplificar los nodos).

### **4.2 Selección Tecnológica: Puppeteer vs. BrowserUse**

Para el entorno Vercel, la elección técnica debe ser pragmática:

* **Puppeteer:** Es la elección correcta para el ciclo interno de validación. Al ser una librería de Node.js, se integra nativamente en las Vercel Serverless Functions sin infraestructura externa compleja. Usaremos puppeteer-core y @sparticuz/chromium para mantenernos dentro del límite de tamaño de 50MB de AWS Lambda/Vercel.25  
* **BrowserUse:** Es una herramienta poderosa basada en Python y LangChain para la navegación agentica.11 Se reservará **exclusivamente** para tareas externas de descubrimiento de datos (ej. navegar el portal presupuestoabierto.gob.ar para detectar nuevos CSVs si la API falla), ejecutándose en un entorno separado (como un contenedor Docker en Railway o Modal), ya que el runtime de Python en Vercel tiene limitaciones para ejecutar navegadores completos.

## ---

**5\. Stack de UI/UX y Visualización Financiera**

La elección de la librería de gráficos es crítica. Los datos financieros requieren precisión y manejo de jerarquías complejas.

### **5.1 Nivo: El Estándar para React D3**

Tras evaluar Recharts, Visx y Nivo 27, seleccionamos **Nivo** por las siguientes razones:

1. **Soporte Nativo de Sankey:** Nivo posee una de las mejores implementaciones de diagramas de Sankey para React, vital para mostrar el flujo "Origen (Impuestos) \-\> Destino (Ministerios) \-\> Impacto (Obras)".29 Recharts carece de soporte robusto para Sankey.  
2. **API Declarativa:** Nivo expone propiedades de alto nivel (data, margin, colors) que son mucho más fáciles de alucinar correctamente por un LLM que las primitivas de bajo nivel de Visx (donde el LLM tendría que calcular escalas D3 manualmente).  
3. **Renderizado Isomórfico:** Nivo soporta renderizado en servidor (SSR) y cliente, alineándose con Next.js 15\.

### **5.2 Componentes Clave**

Diseñaremos wrappers específicos en src/components/charts:

* **BudgetSankey.tsx:** Maneja flujos. Debe incluir lógica defensiva para filtrar ciclos (A-\>B-\>A) que rompen el renderizado D3.29  
* **BudgetTreemap.tsx:** Para visualizar la jerarquía del gasto (Jurisdicción \-\> Programa \-\> Actividad).  
* **TimeSeriesLine.tsx:** Para la evolución de la inflación vs. ejecución presupuestaria.

Todos los componentes utilizarán **Shadcn/UI** para los contenedores (Cards, Dialogs) para mantener una estética profesional y consistente.

## ---

**6\. Guía de Implementación y Estructura**

### **6.1 Estructura de Directorios (Next.js 15 App Router)**

/src  
  /app  
    /api  
      /chat  
        route.ts              \# Endpoint principal del Agente (streamText)  
      /cron  
        ingest.ts             \# Ingesta programada de datos  
      /validate-chart  
        route.ts              \# Endpoint de Puppeteer para el Golden Loop  
    /dashboard  
      page.tsx                \# Interfaz principal  
    layout.tsx  
  /components  
    /ai  
      message-list.tsx        \# Renderizado de mensajes (User/AI)  
      tool-ui-renderer.tsx    \# Switch para renderizar gráficos según toolInvocation  
    /charts  
      budget-sankey.tsx       \# Wrapper de Nivo Sankey  
      budget-treemap.tsx      \# Wrapper de Nivo Treemap  
    /ui                       \# Componentes Shadcn (Button, Card, etc.)  
  /lib  
    /ai  
      sdk-config.ts           \# Configuración del Vercel AI SDK  
      tools.ts                \# Definiciones Zod de las herramientas  
      prompts.ts              \# System Prompts y Few-Shot examples  
    /db  
      schema.ts               \# Tipos de Supabase  
      queries.ts              \# Funciones de acceso a datos  
    /validation  
      browser-agent.ts        \# Lógica de control de Puppeteer  
  /scripts  
    seed-database.ts          \# Script inicial de carga de datos  
  SPEC.md                     \# Este documento

### **6.2 Hoja de Ruta de Implementación**

#### **Fase 1: Cimientos de Datos (Semanas 1-2)**

1. Levantar proyecto Next.js 15\.  
2. Configurar Supabase y habilitar pgvector.  
3. Desarrollar scripts/seed-database.ts para parsear los CSVs de 2024/2025 y poblar budget\_executions.  
4. Crear índices SQL para asegurar queries de agregación sub-500ms.

#### **Fase 2: El Cerebro del Agente (Semanas 3-4)**

1. Implementar app/api/chat/route.ts con Vercel AI SDK.  
2. Definir herramientas Zod en lib/ai/tools.ts.  
3. Conectar el Agente a la base de datos: el Agente debe ser capaz de responder "¿Cuánto gastó el Ministerio de Salud en 2024?" usando SQL generado.

#### **Fase 3: Generative UI y Visualización (Semanas 5-6)**

1. Implementar componentes Nivo (BudgetSankey, BudgetTreemap).  
2. Integrar useChat en el frontend.  
3. Conectar la herramienta generateVisualConfig para que el frontend intercepte la llamada y renderice el gráfico real.

#### **Fase 4: El Ciclo de Calidad (Semana 7\)**

1. Implementar la Vercel Function con Puppeteer.  
2. Crear la lógica de "Auto-Correction": si el usuario reporta un gráfico roto o si el validador nocturno falla, el sistema debe marcar ese prompt como "requiere revisión".

## ---

**7\. Estrategia de Prompting Avanzada**

El éxito del agente depende de cómo se le instruye. Utilizaremos **Chain-of-Thought (CoT)** implícito en las herramientas.

**Ejemplo de Prompt de Sistema para Manejo de Errores SQL:**

"Si la herramienta queryBudgetDB retorna un error de sintaxis SQL, NO te disculpes simplemente. Analiza el error, corrige la consulta (ej. verifica nombres de columnas en el esquema provisto) y reintenta automáticamente hasta 2 veces antes de informar al usuario."

**Ejemplo de Inyección de Contexto (RAG):**

"El usuario pregunta sobre 'Gastos Reservados'. Buscando en golden\_artifacts, encontré una visualización validada (ID: xyz) que muestra la evolución de estos gastos en Inteligencia. Uso esta configuración base y actualizo solo los valores con los datos del año en curso."

## ---

**8\. Conclusión**

La arquitectura aquí definida posiciona al **Argentine Budget AI Analyst** no como un simple chatbot, sino como una herramienta de auditoría ciudadana de grado profesional. Al combinar la infraestructura de borde de **Vercel** con la capacidad analítica de **Supabase** y la seguridad visual del **Golden Loop**, eliminamos las barreras técnicas para entender el presupuesto nacional.

El uso estratégico de **Generative UI** mediante invocación de herramientas transforma filas de CSVs ininteligibles en historias visuales claras, cumpliendo la promesa final del Gobierno Abierto: que los datos no solo sean públicos, sino comprensibles.

#### **Obras citadas**

1. Presupuesto Abierto \- Argentina.gob.ar, fecha de acceso: febrero 6, 2026, [https://www.argentina.gob.ar/economia/sechacienda/dgsiaf/boletin-trimestral-iv-2022/presupuesto-abierto](https://www.argentina.gob.ar/economia/sechacienda/dgsiaf/boletin-trimestral-iv-2022/presupuesto-abierto)  
2. Presupuesto Abierto | Sitio del ciudadano \- Inicio, fecha de acceso: febrero 6, 2026, [https://www.presupuestoabierto.gob.ar/](https://www.presupuestoabierto.gob.ar/)  
3. Introducing Analytics Buckets \- Supabase, fecha de acceso: febrero 6, 2026, [https://supabase.com/blog/introducing-analytics-buckets](https://supabase.com/blog/introducing-analytics-buckets)  
4. pgvector: Embeddings and vector similarity | Supabase Docs, fecha de acceso: febrero 6, 2026, [https://supabase.com/docs/guides/database/extensions/pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)  
5. Generative UI Chatbot with React Server Components \- Vercel, fecha de acceso: febrero 6, 2026, [https://vercel.com/templates/next.js/rsc-genui](https://vercel.com/templates/next.js/rsc-genui)  
6. Migrate AI SDK 3.4 to 4.0, fecha de acceso: febrero 6, 2026, [https://ai-sdk.dev/docs/migration-guides/migration-guide-4-0](https://ai-sdk.dev/docs/migration-guides/migration-guide-4-0)  
7. Migrate AI SDK 4.x to 5.0, fecha de acceso: febrero 6, 2026, [https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0)  
8. Generative User Interfaces \- AI SDK UI, fecha de acceso: febrero 6, 2026, [https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)  
9. AI SDK \- Vercel, fecha de acceso: febrero 6, 2026, [https://vercel.com/docs/ai-sdk](https://vercel.com/docs/ai-sdk)  
10. AI SDK Core: Generating Structured Data, fecha de acceso: febrero 6, 2026, [https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)  
11. Browser-Use: Open-Source AI Agent For Web Automation \- Labellerr, fecha de acceso: febrero 6, 2026, [https://www.labellerr.com/blog/browser-use-agent/](https://www.labellerr.com/blog/browser-use-agent/)  
12. Puppeteer on Vercel, fecha de acceso: febrero 6, 2026, [https://vercel.com/templates/next.js/puppeteer-on-vercel](https://vercel.com/templates/next.js/puppeteer-on-vercel)  
13. Build a Personalized AI Assistant with Postgres \- Supabase, fecha de acceso: febrero 6, 2026, [https://supabase.com/blog/natural-db](https://supabase.com/blog/natural-db)  
14. Presupuesto Abierto, fecha de acceso: febrero 6, 2026, [https://presupuesto-abierto.argentina.apidocs.ar/](https://presupuesto-abierto.argentina.apidocs.ar/)  
15. API \- Presupuesto Abierto, fecha de acceso: febrero 6, 2026, [https://www.presupuestoabierto.gob.ar/api/](https://www.presupuestoabierto.gob.ar/api/)  
16. Indicadores agregados de Datos Abiertos de Subsecretaría de Presupuesto (series), fecha de acceso: febrero 6, 2026, [https://www.datos.gob.ar/dataset/jgm-indicadores-red-datos-abiertos-administracion-publica-nacional-apn/archivo/jgm\_16.33](https://www.datos.gob.ar/dataset/jgm-indicadores-red-datos-abiertos-administracion-publica-nacional-apn/archivo/jgm_16.33)  
17. Presupuesto de gastos y su ejecución detallada \- agrupación mensual 2019, fecha de acceso: febrero 6, 2026, [https://datos.gob.ar/dataset/sspre-presupuesto-administracion-publica-nacional-2019/archivo/sspre\_164](https://datos.gob.ar/dataset/sspre-presupuesto-administracion-publica-nacional-2019/archivo/sspre_164)  
18. Open Data Editor in Action: Democratising housing data analysis in Argentina, fecha de acceso: febrero 6, 2026, [https://blog.okfn.org/2025/07/02/open-data-editor-in-action-democratising-housing-data-analysis-in-argentina/](https://blog.okfn.org/2025/07/02/open-data-editor-in-action-democratising-housing-data-analysis-in-argentina/)  
19. GLOSARIO \- Presupuesto Abierto, fecha de acceso: febrero 6, 2026, [https://www.presupuestoabierto.gob.ar/sici/pdf/glosario.pdf](https://www.presupuestoabierto.gob.ar/sici/pdf/glosario.pdf)  
20. Serie anual gastos, recursos y PIB \- Datos Argentina, fecha de acceso: febrero 6, 2026, [https://datos.gob.ar/ar/dataset/sspre-presupuesto-administracion-publica-nacional/archivo/sspre\_195](https://datos.gob.ar/ar/dataset/sspre-presupuesto-administracion-publica-nacional/archivo/sspre_195)  
21. Hybrid search | Supabase Docs, fecha de acceso: febrero 6, 2026, [https://supabase.com/docs/guides/ai/hybrid-search](https://supabase.com/docs/guides/ai/hybrid-search)  
22. NextJS's Amazing New Streaming Server Actions | by Jack Herrington \- Medium, fecha de acceso: febrero 6, 2026, [https://jherr2020.medium.com/nextjss-amazing-new-streaming-server-actions-ef4f6e2b1ca2](https://jherr2020.medium.com/nextjss-amazing-new-streaming-server-actions-ef4f6e2b1ca2)  
23. How to build unified AI interfaces using the Vercel AI SDK \- LogRocket Blog, fecha de acceso: febrero 6, 2026, [https://blog.logrocket.com/unified-ai-interfaces-vercel-sdk/](https://blog.logrocket.com/unified-ai-interfaces-vercel-sdk/)  
24. Tool Use | Vercel Academy, fecha de acceso: febrero 6, 2026, [https://vercel.com/academy/ai-sdk/tool-use](https://vercel.com/academy/ai-sdk/tool-use)  
25. Deploying Puppeteer with Next.js on Vercel, fecha de acceso: febrero 6, 2026, [https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel)  
26. BrowserUse \- Web Automation Library for AI Agents \- NashTech Blog, fecha de acceso: febrero 6, 2026, [https://blog.nashtechglobal.com/browseruse-web-automation-library-for-ai-agents/](https://blog.nashtechglobal.com/browseruse-web-automation-library-for-ai-agents/)  
27. Best React chart libraries (2025 update): Features, performance & use cases, fecha de acceso: febrero 6, 2026, [https://blog.logrocket.com/best-react-chart-libraries-2025/](https://blog.logrocket.com/best-react-chart-libraries-2025/)  
28. @visx/hierarchy examples \- CodeSandbox, fecha de acceso: febrero 6, 2026, [https://codesandbox.io/examples/package/@visx/hierarchy](https://codesandbox.io/examples/package/@visx/hierarchy)  
29. Sankey chart \- nivo, fecha de acceso: febrero 6, 2026, [https://nivo.rocks/sankey/](https://nivo.rocks/sankey/)