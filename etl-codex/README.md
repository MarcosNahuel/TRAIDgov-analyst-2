# ETL Codex (2014-2026) - Credito Devengado (Core)

Este folder contiene:
- Investigaciones (diccionario de datos + fuentes).
- Definicion del **dataframe core** para analisis multi-anio mensual (2014-2026).
- SQL de schema (Supabase/Postgres) para cargar el core.
- Scripts TypeScript para ETL (descarga, parseo, agregacion, upsert) + carga de IPC.

## Dataframe Core (v1)

Grano (una fila):
`anio + mes + jurisdiccion + servicio + programa + subprograma + inciso + provincia`

Metrica:
- `credito_devengado` (solo esta por ahora).

Se excluyen (v1):
- `codigo_bapin_*`, `prestamo_externo_*`, `clasificador_economico_8_digitos_*`
- `principal/parcial/subparcial`, `fuente_financiamiento`, `finalidad/funcion`
- niveles administrativos que no se usan en analisis v1 (subjurisdiccion, entidad, unidad_ejecutora, etc.)

Detalles en `etl-codex/docs/DATAFRAME_V1.md`.

## Quickstart (alto nivel)

1. Ejecutar el SQL de schema en Supabase:
   - `etl-codex/sql/01_schema_core.sql`
2. Cargar el core (2014-2026):
   - `npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2014 --to 2026`
3. Cargar IPC (si queres deflactar):
   - `npx tsx etl-codex/scripts/load-ipc.ts`

## Documentos clave

- `etl-codex/docs/DATA_DICTIONARY_CREDITO_MENSUAL.md`: columnas del dataset y explicacion.
- `etl-codex/docs/VOLUMETRIA_Y_DISPONIBILIDAD_2014_2026.md`: anios disponibles + tamanios + conteos.
- `etl-codex/docs/SCD_NOMBRES_HISTORICOS.md`: como guardamos nombres historicos por anio.
- `etl-codex/schema/presupuesto-nacion-core-multianio.md`: contexto para el agente (SQL).
- `etl-codex/docs/INSTRUCCIONES_SUPABASE_Y_ETL.md`: pasos completos para ejecutar SQL en Supabase y correr el ETL.
