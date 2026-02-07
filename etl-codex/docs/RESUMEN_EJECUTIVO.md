# Resumen Ejecutivo (CORE v1)

## Que vamos a construir

Una base multi-anio mensual (2014-2026) enfocada en:
- **Instituciones**: jurisdiccion y servicio.
- **Incisos**: el clasificador mas explicativo de “en que se gasto”.
- **Programas**: programa y subprograma.
- **Tiempo**: anio/mes.
- **Geografia**: ubicacion geografica (provincia / codigos especiales).

Metrica (v1):
- **solo** `credito_devengado` (millones de pesos).

## Por que CORE (vs FULL CSV)

El CSV mensual trae ~450k-600k filas por anio. Al quedarnos con el grano CORE (y sumar el resto), el volumen cae fuerte:
- Ejemplo 2024: ~493k filas CSV -> ~61k filas CORE.

Resultado:
- DB mas chica, barata y rapida.
- Queries mas faciles para el agente (menos joins, menos cardinalidad).

## Historico de nombres

Guardamos `*_desc` por anio (tablas `*_hist`) para evitar que renombres institucionales/programaticos rompan analisis historico.

Ver: `etl-codex/docs/SCD_NOMBRES_HISTORICOS.md`.

## IPC

Se agrega tabla `ipc_indice_mensual` para deflactar en SQL.
Ojo: las series oficiales comparables suelen arrancar en 2016/2017; 2014-2015 requiere decision metodologica.

## Entregables

- Diccionario de datos: `etl-codex/docs/DATA_DICTIONARY_CREDITO_MENSUAL.md`
- Volumetria: `etl-codex/docs/VOLUMETRIA_Y_DISPONIBILIDAD_2014_2026.md`
- Schema SQL: `etl-codex/sql/01_schema_core.sql`
- ETL: `etl-codex/scripts/etl-credito-devengado-core.ts`
- IPC loader: `etl-codex/scripts/load-ipc.ts`
- Schema doc para el agente: `etl-codex/schema/presupuesto-nacion-core-multianio.md`

