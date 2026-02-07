# Volumetria y Disponibilidad (2014-2026) - `credito-mensual-{ANIO}.zip`

## 1) Anios disponibles (MECON / dgsiaf-repo)

URL patron:
`https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/{ANIO}/credito-mensual-{ANIO}.zip`

Tabla (HEAD request a febrero 2026):

| Anio | HTTP | ZIP (bytes) | Last-Modified (GMT) | Observacion |
|---:|:---:|---:|---|---|
| 2014 | 200 | 18,567,298 | 2024-06-18 13:17 | ok |
| 2015 | 200 | 18,942,794 | 2024-06-18 13:17 | ok |
| 2016 | 200 | 17,694,725 | 2024-06-18 13:18 | ok |
| 2017 | 200 | 18,400,328 | 2024-06-18 13:23 | ok |
| 2018 | 200 | 17,833,622 | 2024-06-18 13:19 | ok |
| 2019 | 200 | 16,602,043 | 2024-06-18 13:19 | ok |
| 2020 | 200 | 14,570,424 | 2024-06-18 13:20 | ok |
| 2021 | 200 | 17,294,947 | 2024-06-18 13:20 | ok |
| 2022 | 200 | 19,279,800 | 2024-06-18 13:21 | ok |
| 2023 | 200 | 18,920,851 | 2024-07-07 10:31 | ok |
| 2024 | 200 | 15,799,698 | 2025-07-04 10:42 | ok |
| 2025 | 200 | 15,098,964 | 2025-12-31 10:33 | ok |
| 2026 | 200 | 2,101,098 | 2026-02-06 10:30 | **parcial** (hasta ahora solo mes 1) |

## 2) Cantidad de filas (mediciones locales)

Conteo de filas en CSV (sin contar header) para algunos anios:

| Anio | Filas CSV |
|---:|---:|
| 2014 | 598,077 |
| 2024 | 493,323 |
| 2025 | 469,612 |
| 2026 | 68,911 |

Interpretacion:
- 2014-2025: orden ~450k-600k filas por anio (mensual).
- 2026: dataset chico porque el ejercicio esta en curso (actualizado al 04 Feb 2026 en el CSV).

## 3) Impacto en DB segun Dataframe Core v1

El CORE v1 agrega el dataset al grano:
`anio + mes + jurisdiccion + servicio + programa + subprograma + inciso + ubicacion`.

Ejemplo (2024):
- Filas CSV: 493,323
- Combinaciones unicas en CORE v1: ~61,108
- Reduccion: ~8.1x menos filas

Estimacion 2014-2025:
- Si el orden de magnitud es similar a 2024: ~60k filas core por anio
- Total 2014-2025 (12 anios): ~720k filas
- 2026 suma poco (parcial)

Esto es compatible con Supabase Pro sin estresar storage y mejora mucho latencias de queries.

## 4) Unidades de monto

En los CSV observados, los creditos estan en **millones de pesos** (y con decimales, frecuentemente hasta 8).

Implicancias:
- En DB conviene `NUMERIC(24,8)` para no perder precision.
- Si en algun analisis se necesita “pesos” (no millones), multiplicar por 1,000,000.

