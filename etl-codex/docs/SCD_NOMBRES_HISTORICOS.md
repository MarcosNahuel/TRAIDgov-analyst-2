# Nombres Historicos (SCD) - Que es y como lo modelamos

## El problema (por que importa)

En estos datasets, los codigos `*_id` suelen ser estables, pero las descripciones `*_desc` pueden cambiar:
- por reestructuraciones institucionales (cambios de ministerios),
- por renombres (“Secretaria X” pasa a “Subsecretaria Y”),
- por reorganizaciones internas.

Si en una dimension guardas **solo una descripcion por ID**, estas obligado a elegir:
- **“ultimo nombre”**: pisas historia (mal para analisis historico y narrativa).
- **“primer nombre”**: te quedas con un nombre viejo (mal para datos recientes).

## Que es SCD (Slowly Changing Dimensions)

En data warehousing se usa el concepto de **Slowly Changing Dimensions (SCD)** para guardar atributos que cambian con el tiempo.

Version corta:
- **Tipo 1**: se pisa el nombre (no hay historia).
- **Tipo 2**: se guarda historia (cada cambio genera una nueva “version” con vigencia).
- **Tipo 3**: se guardan algunos “anteriores” (poco comun).

## Lo que hacemos en este proyecto (SCD “por anio”)

Para mantener el agente simple (SQL directo, sin surrogate keys en facts), usamos una variante practica:

- Una dimension “actual”:
  - `dim_jurisdiccion(jurisdiccion_id PK, jurisdiccion_desc)`
- Un historico por anio:
  - `dim_jurisdiccion_hist(jurisdiccion_id, ejercicio_presupuestario, jurisdiccion_desc, PK(jurisdiccion_id, ejercicio_presupuestario))`

Se repite para:
- servicio, programa, subprograma, inciso, ubicacion_geografica (segun necesidad).

### Ventajas
- Permite mostrar el nombre “tal como estaba” en ese anio.
- Evita que un renombre te rompa series o dashboards historicos.
- No obliga a redisenar el fact con surrogate keys.

### Limitaciones
- Si un mismo `*_id` **reusa** el codigo para otra cosa en otro anio (poco comun pero posible), entonces:
  - el historico lo refleja (desc distinta por anio),
  - pero comparar “por ID” entre anios puede mezclar conceptos.
  - Solucion (futuro): tabla de equivalencias / “conceptos estables” para comparaciones inter-gobierno.

## Patron de query recomendado (con fallback)

Ejemplo (jurisdiccion):

```sql
SELECT
  h.ejercicio_presupuestario,
  COALESCE(jh.jurisdiccion_desc, j.jurisdiccion_desc) AS jurisdiccion_desc,
  SUM(h.credito_devengado) AS devengado
FROM fact_credito_devengado_mensual h
LEFT JOIN dim_jurisdiccion_hist jh
  ON jh.jurisdiccion_id = h.jurisdiccion_id
 AND jh.ejercicio_presupuestario = h.ejercicio_presupuestario
LEFT JOIN dim_jurisdiccion j
  ON j.jurisdiccion_id = h.jurisdiccion_id
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

## Recomendacion practica

- Para **narrativa historica**: usar el nombre historico (join a `*_hist`).
- Para **catalogos / UI**: usar el nombre actual (tabla `dim_*`).

