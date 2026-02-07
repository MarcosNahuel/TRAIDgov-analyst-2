# Diccionario de Datos - Dataset `credito-mensual-{ANIO}.zip` (MECON / Presupuesto Abierto)

Este documento describe **todas las columnas** observadas en el CSV mensual (57 columnas) y como se clasifican.

Nota: el dataset viene con pares `*_id` y `*_desc` (codigo + descripcion). En el modelo dimensional, los `*_id` viven en la tabla de hechos y los `*_desc` en dimensiones (con historico por anio cuando aplica).

## 1) Tiempo

Campos:
- `impacto_presupuestario_anio` (int): anio calendario en el cual impacta el credito.
- `impacto_presupuestario_mes` (int 1-12): mes calendario en el cual impacta el credito.
- `ejercicio_presupuestario` (int): ejercicio fiscal (anio presupuestario).
- `ultima_actualizacion_fecha` (text): leyenda de ultima actualizacion del ejercicio (viene textual).

Incluido en CORE v1:
- SI: `ejercicio_presupuestario`, `impacto_presupuestario_mes`
- NO: `impacto_presupuestario_anio` (redundante en practica si coincide con ejercicio, pero se puede reactivar)
- NO: `ultima_actualizacion_fecha` (se guarda solo como metadata de carga, no como dimension)

## 2) Jerarquia Administrativa (quien gasta)

Nivel macro:
- `sector_id`, `sector_desc`: Sector (ej. “Sector Publico Nacional no Financiero”).
- `subsector_id`, `subsector_desc`: Subsector (ej. “Administracion Nacional”).
- `caracter_id`, `caracter_desc`: Caracter del organismo (ej. Administracion Central / Descentralizados / Seguridad Social).

Instituciones (core institucional):
- `jurisdiccion_id`, `jurisdiccion_desc`: Jurisdiccion (ministerio/poder).
- `subjurisdiccion_id`, `subjurisdiccion_desc`: Subjurisdiccion (nivel intermedio).
- `entidad_id`, `entidad_desc`: Entidad (organismo/entidad dependiente).
- `servicio_id`, `servicio_desc`: Servicio (unidad administrativa que ejecuta).
- `unidad_ejecutora_id`, `unidad_ejecutora_desc`: Unidad ejecutora (nivel aun mas fino, no siempre cargado de forma consistente).

Incluido en CORE v1:
- SI: `jurisdiccion_id`, `jurisdiccion_desc`
- SI: `servicio_id`, `servicio_desc`
- NO (por ahora): `sector_*`, `subsector_*`, `caracter_*`
- NO (por ahora): `subjurisdiccion_*`, `entidad_*`, `unidad_ejecutora_*`

Razon:
- El analisis v1 prioriza **institucion** a nivel jurisdiccion y servicio. Los niveles intermedios se pueden reintroducir despues si aparecen preguntas que lo requieran.

## 3) Jerarquia Programatica (en que programa se gasta)

Campos:
- `programa_id`, `programa_desc`: Programa presupuestario.
- `subprograma_id`, `subprograma_desc`: Subprograma.
- `proyecto_id`, `proyecto_desc`: Proyecto.
- `actividad_id`, `actividad_desc`: Actividad.
- `obra_id`, `obra_desc`: Obra.

Incluido en CORE v1:
- SI: `programa_id`, `programa_desc`
- SI: `subprograma_id`, `subprograma_desc`
- NO (por ahora): `proyecto_*`, `actividad_*`, `obra_*`

Nota de keys:
- `programa_id` y `subprograma_id` no son globalmente unicos: para que no haya colisiones, en DB se modela con keys compuestas:
  - Programa: `(servicio_id, programa_id)`
  - Subprograma: `(servicio_id, programa_id, subprograma_id)`

## 4) Jerarquia Funcional (para que se gasta)

Campos:
- `finalidad_id`, `finalidad_desc`: Finalidad (macro proposito).
- `funcion_id`, `funcion_desc`: Funcion (detalle de finalidad).

Incluido en CORE v1:
- NO (por ahora): se deja afuera para mantener el core chico y centrado en inciso + instituciones.

## 5) Clasificador Economico (como se gasta)

Niveles:
- `inciso_id`, `inciso_desc`: Inciso (objeto del gasto, nivel mas narrativo).
- `principal_id`, `principal_desc`
- `parcial_id`, `parcial_desc`
- `subparcial_id`, `subparcial_desc`
- `clasificador_economico_8_digitos_id`, `clasificador_economico_8_digitos_desc`: nivel extremadamente fino (8 digitos).

Incluido en CORE v1:
- SI: `inciso_id`, `inciso_desc`
- NO (por ahora): `principal_*`, `parcial_*`, `subparcial_*`
- NO (explicitamente): `clasificador_economico_8_digitos_*`

Razon:
- El foco es **inciso** (describe mejor “en que se gasto” sin explotar el volumen ni complejidad).

## 6) Fuente de Financiamiento (con que se financia)

Campos:
- `fuente_financiamiento_id`, `fuente_financiamiento_desc`

Incluido en CORE v1:
- NO (por ahora).

## 7) Ubicacion Geografica (donde impacta)

Campos:
- `ubicacion_geografica_id`, `ubicacion_geografica_desc`

Incluido en CORE v1:
- SI.

Nota:
- La dimension incluye provincias y codigos especiales (ej. “Nacional”, “Interprovincial”, “No Clasificado”). En consultas “por provincia” conviene filtrar a las 24 provincias + CABA.

## 8) Identificadores de inversion y financiamiento externo (excluidos)

Campos:
- `prestamo_externo_id`, `prestamo_externo_desc`
- `codigo_bapin_id`, `codigo_bapin_desc`

Incluido en CORE v1:
- NO (explicitamente).

## 9) Metricas financieras (solo devengado en v1)

Campos numericos (en el dataset vienen en **millones de pesos** con decimales):
- `credito_presupuestado`
- `credito_vigente`
- `credito_comprometido`
- `credito_devengado`
- `credito_pagado`

Incluido en CORE v1:
- SI: `credito_devengado`
- NO (por ahora): resto de metricas.

Observacion (importante para series):
- En los CSV mensuales observados, los valores se comportan como **flujos/impacto del mes** (no acumulado): pueden subir o bajar mes a mes, y `credito_pagado` puede ser mayor o menor que `credito_devengado` en un mes dado.

Definiciones operativas (glosario):
- **Comprometido**: reserva/preafectacion del credito.
- **Devengado**: nace la obligacion de pago (bien/servicio recibido).
- **Pagado**: salida efectiva de fondos.

## 10) Resumen de inclusion (CORE v1)

Incluidos:
- Tiempo: `ejercicio_presupuestario`, `impacto_presupuestario_mes`
- Institucional: `jurisdiccion_id`, `servicio_id`
- Programatico: `programa_id`, `subprograma_id`
- Economico: `inciso_id`
- Geografico: `ubicacion_geografica_id`
- Hecho: `credito_devengado`

Excluidos:
- Todo el resto (por ahora), incluyendo BAPIN/prestamos/clasificador 8 digitos.

## Anexo A - Lista completa de campos (57) y decision v1

| Campo CSV | Grupo | Que es | CORE v1 |
|---|---|---|---|
| `impacto_presupuestario_anio` | Tiempo | Anio calendario de impacto | No |
| `impacto_presupuestario_mes` | Tiempo | Mes calendario de impacto (1-12) | Si |
| `ejercicio_presupuestario` | Tiempo | Ejercicio fiscal (anio) | Si |
| `sector_id` | Admin | Sector (codigo) | No |
| `sector_desc` | Admin | Sector (descripcion) | No |
| `subsector_id` | Admin | Subsector (codigo) | No |
| `subsector_desc` | Admin | Subsector (descripcion) | No |
| `caracter_id` | Admin | Caracter del organismo (codigo) | No |
| `caracter_desc` | Admin | Caracter del organismo (descripcion) | No |
| `jurisdiccion_id` | Institucional | Jurisdiccion (codigo) | Si |
| `jurisdiccion_desc` | Institucional | Jurisdiccion (descripcion) | Si (en dims) |
| `subjurisdiccion_id` | Institucional | Subjurisdiccion (codigo) | No |
| `subjurisdiccion_desc` | Institucional | Subjurisdiccion (descripcion) | No |
| `entidad_id` | Institucional | Entidad (codigo) | No |
| `entidad_desc` | Institucional | Entidad (descripcion) | No |
| `servicio_id` | Institucional | Servicio (codigo) | Si |
| `servicio_desc` | Institucional | Servicio (descripcion) | Si (en dims) |
| `programa_id` | Programatica | Programa (codigo) | Si |
| `programa_desc` | Programatica | Programa (descripcion) | Si (en dims) |
| `subprograma_id` | Programatica | Subprograma (codigo) | Si |
| `subprograma_desc` | Programatica | Subprograma (descripcion) | Si (en dims) |
| `proyecto_id` | Programatica | Proyecto (codigo) | No |
| `proyecto_desc` | Programatica | Proyecto (descripcion) | No |
| `actividad_id` | Programatica | Actividad (codigo) | No |
| `actividad_desc` | Programatica | Actividad (descripcion) | No |
| `obra_id` | Programatica | Obra (codigo) | No |
| `obra_desc` | Programatica | Obra (descripcion) | No |
| `finalidad_id` | Funcional | Finalidad (codigo) | No |
| `finalidad_desc` | Funcional | Finalidad (descripcion) | No |
| `funcion_id` | Funcional | Funcion (codigo) | No |
| `funcion_desc` | Funcional | Funcion (descripcion) | No |
| `inciso_id` | Economica | Inciso (codigo) | Si |
| `inciso_desc` | Economica | Inciso (descripcion) | Si (en dims) |
| `principal_id` | Economica | Principal (codigo) | No |
| `principal_desc` | Economica | Principal (descripcion) | No |
| `parcial_id` | Economica | Parcial (codigo) | No |
| `parcial_desc` | Economica | Parcial (descripcion) | No |
| `subparcial_id` | Economica | Subparcial (codigo) | No |
| `subparcial_desc` | Economica | Subparcial (descripcion) | No |
| `clasificador_economico_8_digitos_id` | Economica | Objeto del gasto 8 digitos (codigo) | No (excluido) |
| `clasificador_economico_8_digitos_desc` | Economica | Objeto del gasto 8 digitos (descripcion) | No (excluido) |
| `fuente_financiamiento_id` | Financiamiento | Fuente (codigo) | No |
| `fuente_financiamiento_desc` | Financiamiento | Fuente (descripcion) | No |
| `ubicacion_geografica_id` | Geografica | Ubicacion (codigo) | Si |
| `ubicacion_geografica_desc` | Geografica | Ubicacion (descripcion) | Si (en dims) |
| `unidad_ejecutora_id` | Admin | Unidad ejecutora (codigo) | No |
| `unidad_ejecutora_desc` | Admin | Unidad ejecutora (descripcion) | No |
| `prestamo_externo_id` | Externo | Prestamo externo (codigo) | No (excluido) |
| `prestamo_externo_desc` | Externo | Prestamo externo (descripcion) | No (excluido) |
| `codigo_bapin_id` | Inversion | Codigo BAPIN (codigo) | No (excluido) |
| `codigo_bapin_desc` | Inversion | Codigo BAPIN (descripcion) | No (excluido) |
| `credito_presupuestado` | Metricas | Credito presupuestado (millones) | No |
| `credito_vigente` | Metricas | Credito vigente (millones) | No |
| `credito_comprometido` | Metricas | Credito comprometido (millones) | No |
| `credito_devengado` | Metricas | Credito devengado (millones) | Si |
| `credito_pagado` | Metricas | Credito pagado (millones) | No |
| `ultima_actualizacion_fecha` | Metadata | Texto de ultima actualizacion del ejercicio | No |

## Fuentes / referencias

En `etl-codex/docs/FUENTES_Y_REFERENCIAS.md` se listan links a:
- Metadatos del dataset (campos y descripcion) en datos.gob.ar.
- Glosario Presupuesto Abierto (definiciones de comprometido/devengado/pagado).
- Manual de clasificadores presupuestarios (inciso y jerarquias).
