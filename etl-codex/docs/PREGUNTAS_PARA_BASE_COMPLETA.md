# Preguntas para Definir la Base “Completa” (futuras iteraciones)

Este documento lista decisiones que suelen aparecer despues de tener el CORE v1 andando.

## 1) Metricas

1. ¿Necesitamos solo `devengado` o tambien `pagado` (para deuda flotante) y/o `vigente` (para subejecucion)?
2. Si agregamos mas metricas, ¿queremos:
   - guardar todas en la fact (wide table), o
   - una fact “larga” (metric_name, metric_value)?
3. ¿Nos importa separar “flujo mensual” vs “acumulado” si el dataset tuviera ambos en algun anio?

## 2) Economico (inciso vs detalle)

1. ¿Alcanza con `inciso` o vamos a necesitar `principal/parcial/subparcial`?
2. ¿Hay casos de uso para el `clasificador_economico_8_digitos`? (por lo general explota volumen y complejidad).

## 3) Institucional (nivel de detalle)

1. ¿Necesitamos bajar de `servicio` a `unidad_ejecutora`?
2. ¿Necesitamos los niveles `subjurisdiccion`/`entidad` para explicar organigramas historicos?
3. ¿Queremos una tabla de **equivalencias** entre estructuras ministeriales por gobierno (ej. “Educacion” vs “Capital Humano”)?

## 4) Programatico

1. ¿Hasta donde baja la jerarquia programatica: `programa/subprograma` alcanza o hay que incluir `proyecto/actividad/obra`?
2. Si se incluye obra/publica, ¿necesitamos entonces habilitar `BAPIN`?

## 5) Geografia

1. ¿Se analiza por “provincia” estricta o tambien interesan los codigos especiales (Nacional, Interprovincial, etc.)?
2. ¿Queremos mapear `ubicacion_geografica_id` a una tabla de provincias estandar (INDEC/Georef) para tener mas atributos (region, etc.)?

## 6) IPC / deflactacion

1. ¿Que serie de IPC usamos para 2014-2015? (hay discontinuidades/series alternativas).
2. ¿Base de precios constante? (ej. “pesos constantes dic-2024”).
3. ¿Deflactamos en SQL (on the fly) o precomputamos una vista/materialized view?

## 7) Calidad de datos / drift

1. ¿Queremos “schema drift report” automatizado por anio (campos nuevos/faltantes)?
2. ¿Como versionamos cambios de nombres (desc) en dims: por anio o por mes?

