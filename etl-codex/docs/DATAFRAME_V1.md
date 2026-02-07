# Dataframe Core v1 (2014-2026) - Definicion y Alcance

## Objetivo

Tener una base multi-anio mensual (2014-2026) **chica, performante y explicable**, enfocada en:
- **Instituciones** (jurisdiccion y servicio).
- **Incisos** (en que se gasto).
- **Programas** (programa y subprograma).
- **Tiempo** (anio/mes).
- **Geografia** (provincia / ubicacion geografica).

Y con **una sola metrica** por ahora:
- `credito_devengado`

Nota:
- En el dataset mensual, `credito_devengado` se comporta como **flujo del mes** (no acumulado).

## Grano (una fila)

Una fila representa el **devengado** para una combinacion unica de:

- `ejercicio_presupuestario` (anio)
- `impacto_presupuestario_mes` (mes)
- `jurisdiccion_id`
- `servicio_id`
- `programa_id`
- `subprograma_id`
- `inciso_id`
- `ubicacion_geografica_id`

Si el CSV original trae mas detalle (por ejemplo `fuente_financiamiento`, `principal`, `parcial`, etc.), en v1 **se agrega (SUM)** al grano anterior.

## Columnas que se guardan (v1)

### Hechos (fact)
- `ejercicio_presupuestario`
- `impacto_presupuestario_mes`
- `jurisdiccion_id`
- `servicio_id`
- `programa_id`
- `subprograma_id`
- `inciso_id`
- `ubicacion_geografica_id`
- `credito_devengado`
- `source_file`, `loaded_at`, `row_hash` (idempotencia y trazabilidad)

### Dimensiones (dims)
Se guardan tablas dimension con descripciones:
- `dim_jurisdiccion`, `dim_jurisdiccion_hist`
- `dim_servicio`, `dim_servicio_hist`
- `dim_programa`, `dim_programa_hist`
- `dim_subprograma`, `dim_subprograma_hist`
- `dim_inciso`, `dim_inciso_hist`
- `dim_ubicacion_geografica`, `dim_ubicacion_geografica_hist`

## Columnas excluidas (v1)

Excluidas explicitamente:
- `codigo_bapin_*` (BAPIN)
- `prestamo_externo_*`
- `clasificador_economico_8_digitos_*`

Excluidas por foco del analisis v1:
- `credito_presupuestado`, `credito_vigente`, `credito_comprometido`, `credito_pagado`
- `finalidad_*`, `funcion_*`
- `fuente_financiamiento_*`
- niveles administrativos no requeridos: `sector`, `subsector`, `caracter`, `subjurisdiccion`, `entidad`, `unidad_ejecutora`
- niveles programaticos mas finos: `proyecto`, `actividad`, `obra`
- niveles economicos mas finos: `principal`, `parcial`, `subparcial`

## Por que este recorte funciona

- Reduce fuertemente el volumen (en 2024 el CSV tiene ~493k filas, pero el core por grano elegido tiene ~61k combinaciones unicas).
- Mantiene lo mas explicativo para narrativa publica:
  - **quien** (jurisdiccion/servicio),
  - **en que** (inciso),
  - **para que operativo** (programa/subprograma),
  - **cuando** (anio/mes),
  - **donde** (provincia).

## Riesgos / tradeoffs (a tener presentes)

- Al excluir `fuente_financiamiento`, se pierde la capacidad de separar gasto por Tesoro vs credito vs otros.
- Al excluir `principal/parcial/subparcial`, se pierde detalle fino dentro del inciso.
- Si algun `*_id` fuera reutilizado con distinto significado entre anios, agrupar por `*_id` puede mezclar conceptos. Por eso se incorpora el enfoque de **nombres historicos por anio** (ver `etl-codex/docs/SCD_NOMBRES_HISTORICOS.md`).
