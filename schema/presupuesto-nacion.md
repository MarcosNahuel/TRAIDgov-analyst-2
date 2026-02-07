# Schema: Presupuesto Nacional Argentina 2024

> Este archivo se inyecta como contexto al LLM.
> Contiene toda la información necesaria para generar SQL correcto.

---

## Tabla de Hechos

**`presupuesto_nacion_2024`** — 119,413 registros (datos anuales acumulados)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT (PK) | ID auto-generado |
| `ejercicio_presupuestario` | INTEGER | Año fiscal (2024) |
| `jurisdiccion_id` | TEXT | Ministerio/Poder → dim_jurisdiccion |
| `subjurisdiccion_id` | TEXT | Sub-jurisdicción → dim_subjurisdiccion |
| `entidad_id` | TEXT | Entidad descentralizada → dim_entidad |
| `servicio_id` | TEXT | Unidad administrativa → dim_servicio |
| `programa_id` | TEXT | Programa presupuestario → dim_programa |
| `subprograma_id` | TEXT | Sub-programa → dim_subprograma |
| `proyecto_id` | TEXT | Proyecto → dim_proyecto |
| `actividad_id` | TEXT | Actividad → dim_actividad |
| `obra_id` | TEXT | Obra pública → dim_obra |
| `inciso_id` | TEXT | Tipo de gasto → dim_inciso |
| `principal_id` | TEXT | Sub-tipo de gasto → dim_principal |
| `parcial_id` | TEXT | Detalle de gasto → dim_parcial |
| `subparcial_id` | TEXT | Sub-detalle → dim_subparcial |
| `finalidad_id` | TEXT | Propósito macro → dim_finalidad |
| `funcion_id` | TEXT | Función específica → dim_funcion |
| `fuente_financiamiento_id` | TEXT | Origen fondos → dim_fuente_financiamiento |
| `ubicacion_geografica_id` | TEXT | Provincia → dim_ubicacion_geografica |
| `caracter_id` | TEXT | Tipo organismo → dim_caracter |
| `sector_id` | TEXT | Sector → dim_sector |
| `credito_presupuestado` | NUMERIC | Presupuesto inicial (Ley de Congreso) |
| `credito_vigente` | NUMERIC | Presupuesto actual (inicial + DNU + modificaciones) |
| `credito_comprometido` | NUMERIC | Reservado por contrato/orden de compra |
| `credito_devengado` | NUMERIC | Obligación de pago (bien/servicio recibido) |
| `credito_pagado` | NUMERIC | Salida efectiva de fondos del Tesoro |

### Escala de Montos

Los montos están en **MILLONES de pesos argentinos**.
- Total vigente 2024: ~$83 billones (83,000,000 millones)
- Total devengado 2024: ~$90 billones (90,000,000 millones)
- El devengado SUPERA al vigente porque incluye ajustes posteriores

Cuando presentes montos al usuario:
- Valores < 1,000: mostrar como "X millones de pesos"
- Valores 1,000-999,999: mostrar como "X.X miles de millones de pesos"
- Valores > 1,000,000: mostrar como "X.X billones de pesos"

---

## ADVERTENCIA CRÍTICA: Keys Compuestas

**`programa_id` NO es globalmente único.** El ID `16` tiene 59 programas distintos.
La clave real de un programa es `servicio_id + programa_id`.

Esto aplica a TODAS las dimensiones jerárquicas:
- `dim_programa`: key = `servicio_id + programa_id`
- `dim_subprograma`: key = `programa_id + subprograma_id`
- `dim_actividad`: key = `proyecto_id + actividad_id`
- `dim_principal`: key = `inciso_id + principal_id`
- `dim_funcion`: key = `finalidad_id + funcion_id`
- `dim_subjurisdiccion`: key = `jurisdiccion_id + subjurisdiccion_id`
- `dim_entidad`: key = `subjurisdiccion_id + entidad_id`
- `dim_servicio`: key = `entidad_id + servicio_id`

**Regla: para JOINear dimensiones jerárquicas, usar TODOS los campos del key compuesto.**

---

## Dimensiones

### dim_jurisdiccion (16 registros)
Ministerios y Poderes del Estado (estructura Milei 2024).

| ID | Jurisdicción | Devengado (mill) |
|----|-------------|-----------------|
| 88 | Ministerio de Capital Humano | $49,000M |
| 90 | Servicio de la Deuda Pública | $9,000M |
| 50 | Ministerio de Economía | $6,000M |
| 41 | Ministerio de Seguridad | $5,000M |
| 91 | Obligaciones a Cargo del Tesoro | $5,000M |
| 45 | Ministerio de Defensa | $4,000M |
| 25 | Jefatura de Gabinete de Ministros | $4,000M |
| 77 | Ministerio de Infraestructura | $2,000M |
| 80 | Ministerio de Salud | $2,000M |
| 10 | Ministerio Público | $1,000M |
| 1  | Poder Legislativo Nacional | $1,000M |
| 5  | Poder Judicial de la Nación | $1,000M |
| 35 | Min. Relaciones Exteriores | $1,000M |
| 30 | Ministerio del Interior | $0M |
| 40 | Ministerio de Justicia | $0M |
| 20 | Presidencia de la Nación | $0M |

- **JOIN:** `h.jurisdiccion_id = j.jurisdiccion_id`
- **Columnas:** `jurisdiccion_id`, `jurisdiccion_desc`

### Contexto Institucional 2024 (Gobierno Milei)

El DNU 8/2023 reestructuró los ministerios:
- **Capital Humano (88)** absorbió: Educación, Desarrollo Social, Trabajo, Cultura, Mujeres/Género. Domina el presupuesto con ANSES ($41B), asignaciones familiares, universidades.
- **Infraestructura (77)** absorbió: Transporte, Obra Pública, Desarrollo Territorial. **NOTA:** Fue eliminado por Decreto 195/2024 y sus funciones pasaron a Economía, pero en datos 2024 aún aparece.
- **Economía (50)** gestiona: Energía (subsidios eléctricos y gas), Agricultura, Industria, Comercio, Finanzas.
- **Jefatura de Gabinete (25)** gestiona: CONICET, ciencia y tecnología, medios públicos.

### dim_inciso (8 registros)
Clasificador económico del gasto.

| ID | Tipo de Gasto |
|----|--------------|
| 1 | Gastos en personal |
| 2 | Bienes de consumo |
| 3 | Servicios no personales |
| 4 | Bienes de uso |
| 5 | Transferencias (~73% del presupuesto) |
| 6 | Incremento de activos financieros |
| 7 | Servicio de la deuda y disminución de otros pasivos |
| 8 | Otros gastos |

- **JOIN:** `h.inciso_id = i.inciso_id`
- **Columnas:** `inciso_id`, `inciso_desc`

### dim_principal (48 registros)
Sub-clasificación del inciso. Key compuesta: `inciso_id + principal_id`.

Ejemplos relevantes:
- Inciso 5, Principal 1: "Transferencias al sector privado para financiar gastos corrientes"
- Inciso 5, Principal 6: "Transferencias a universidades nacionales"
- Inciso 5, Principal 7: "Transferencias a instituciones provinciales (corrientes)"
- Inciso 1, Principal 1: "Personal permanente"
- Inciso 7, Principal 2: "Servicio de la deuda en moneda extranjera"

- **JOIN:** `h.inciso_id = p.inciso_id AND h.principal_id = p.principal_id`
- **Columnas:** `id_unico`, `inciso_id`, `principal_id`, `principal_desc`

### dim_finalidad (5 registros)
Propósito macro del gasto.

| ID | Finalidad |
|----|----------|
| 1 | Administración Gubernamental |
| 2 | Servicios de Defensa y Seguridad |
| 3 | Servicios Sociales (la más grande) |
| 4 | Servicios Económicos |
| 5 | Deuda Pública |

- **JOIN:** `h.finalidad_id = fi.finalidad_id`

### dim_funcion (29 registros)
Función específica, sub-nivel de finalidad. Key compuesta: `finalidad_id + funcion_id`.

| Finalidad | ID | Función |
|-----------|-----|---------|
| 1-Admin | 1 | Legislativa |
| 1-Admin | 2 | Judicial |
| 1-Admin | 3 | Dirección Superior Ejecutiva |
| 1-Admin | 4 | Relaciones Exteriores |
| 1-Admin | 5 | Relaciones Interiores |
| 1-Admin | 6 | Administración Fiscal |
| 1-Admin | 7 | Control de la Gestión Pública |
| 1-Admin | 8 | Información y Estadística Básicas |
| 2-DefSeg | 1 | Defensa |
| 2-DefSeg | 2 | Seguridad Interior |
| 2-DefSeg | 3 | Sistema Penal |
| 2-DefSeg | 4 | Inteligencia |
| 3-Social | 1 | Salud |
| 3-Social | 2 | Promoción y Asistencia Social |
| 3-Social | 3 | Seguridad Social (la MÁS grande: ANSES) |
| 3-Social | 4 | Educación y Cultura |
| 3-Social | 5 | Ciencia, Tecnología e Innovación |
| 3-Social | 6 | Trabajo |
| 3-Social | 7 | Vivienda y Urbanismo |
| 3-Social | 8 | Agua Potable y Alcantarillado |
| 4-Econ | 1 | Energía, Combustibles y Minería |
| 4-Econ | 2 | Comunicaciones |
| 4-Econ | 3 | Transporte |
| 4-Econ | 4 | Ecología y Desarrollo Sostenible |
| 4-Econ | 5 | Agricultura, Ganadería y Pesca |
| 4-Econ | 6 | Industria |
| 4-Econ | 7 | Comercio, Turismo y Otros Servicios |
| 4-Econ | 8 | Seguros y Finanzas |
| 5-Deuda | 1 | Servicio de la Deuda Pública |

- **JOIN:** `h.finalidad_id = fu.finalidad_id AND h.funcion_id = fu.funcion_id`

### dim_fuente_financiamiento (7 registros)
Origen de los fondos.

| ID | Fuente |
|----|--------|
| 1.1 | Tesoro Nacional (la principal) |
| 1.2 | Recursos Propios |
| 1.3 | Recursos con Afectación Específica |
| 1.4 | Transferencias Internas |
| 1.5 | Crédito Interno |
| 2.1 | Transferencias Externas |
| 2.2 | Crédito Externo |

- **JOIN:** `h.fuente_financiamiento_id = ff.fuente_financiamiento_id`

### dim_ubicacion_geografica (28 registros)
24 provincias + CABA + categorías especiales.

IDs siguen código INDEC: 2=CABA, 6=Buenos Aires, 10=Catamarca, 14=Córdoba, etc.
IDs especiales: 96=Interprovincial, 97=Nacional, 98=Binacional, 99=No Clasificado.

- **JOIN:** `h.ubicacion_geografica_id = ug.ubicacion_geografica_id`

### dim_caracter (3 registros)
Tipo de organismo.

| ID | Carácter |
|----|----------|
| 1 | Administración Central |
| 2 | Organismos Descentralizados |
| 3 | Instituciones de Seguridad Social |

- **JOIN:** `h.caracter_id = c.caracter_id`

### dim_servicio (129 registros)
Unidad administrativa que ejecuta el gasto. Key compuesta: `entidad_id + servicio_id`.

Servicios más relevantes por presupuesto:
- 850: Administración Nacional de la Seguridad Social (ANSES)
- 355: Servicio de la Deuda Pública
- 328: Secretaría de Energía
- 330: Secretaría de Educación
- 917: Agencia Nacional de Discapacidad
- 311: Secretaría Nacional de Niñez, Adolescencia y Familia

- **JOIN:** `h.entidad_id = s.entidad_id AND h.servicio_id = s.servicio_id`
- **Columnas:** `id_unico`, `entidad_id`, `servicio_id`, `servicio_desc`

### dim_programa (536 registros)
Programa presupuestario. Key compuesta: `servicio_id + programa_id`.

Top 10 programas por devengado:
1. ANSES (850) → Prog 16: Prestaciones Previsionales ($28B)
2. Deuda (355) → Prog 98: Deudas Directas ($9B)
3. ANSES (850) → Prog 19: Asignaciones Familiares ($6B)
4. Energía (328) → Prog 74: Política de Energía Eléctrica ($4B)
5. ANSES (850) → Prog 17: Complementos Previsionales ($3B)
6. Educación (330) → Prog 26: Educación Superior ($3B)
7. Discapacidad (917) → Prog 23: Pensiones por Invalidez ($3B)
8. Tesoro (356) → Prog 76: Asistencia a Empresas de Energía ($2B)
9. Niñez (311) → Prog 26: Políticas Alimentarias ($2B)

- **JOIN:** `h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id`
- **Columnas:** `id_unico`, `servicio_id`, `programa_id`, `programa_desc`

### Otras dimensiones jerárquicas

| Tabla | Registros | Key Compuesta | JOIN |
|-------|-----------|---------------|------|
| dim_subjurisdiccion | 39 | jurisdiccion_id + subjurisdiccion_id | `h.jurisdiccion_id = sj.jurisdiccion_id AND h.subjurisdiccion_id = sj.subjurisdiccion_id` |
| dim_entidad | 83 | subjurisdiccion_id + entidad_id | `h.subjurisdiccion_id = e.subjurisdiccion_id AND h.entidad_id = e.entidad_id` |
| dim_subprograma | 323 | programa_id + subprograma_id | `h.programa_id = sp.programa_id AND h.subprograma_id = sp.subprograma_id` |
| dim_proyecto | 564 | subprograma_id + proyecto_id | `h.subprograma_id = pr.subprograma_id AND h.proyecto_id = pr.proyecto_id` |
| dim_actividad | 186 | proyecto_id + actividad_id | `h.proyecto_id = a.proyecto_id AND h.actividad_id = a.actividad_id` |
| dim_obra | 105 | actividad_id + obra_id | `h.actividad_id = o.actividad_id AND h.obra_id = o.obra_id` |
| dim_parcial | 79 | principal_id + parcial_id | `h.principal_id = pa.principal_id AND h.parcial_id = pa.parcial_id` |
| dim_subparcial | 794 | parcial_id + subparcial_id | `h.parcial_id = sp.parcial_id AND h.subparcial_id = sp.subparcial_id` |
| dim_sector | 1 | sector_id | `h.sector_id = se.sector_id` |

---

## Jerarquías

### Administrativa (quién gasta)
```
jurisdiccion (16) → subjurisdiccion (39) → entidad (83) → servicio (129)
```

### Programática (en qué gasta)
```
programa (536) → subprograma (323) → proyecto (564) → actividad (186) → obra (105)
```

### Funcional (para qué gasta)
```
finalidad (5) → funcion (29)
```

### Económica (cómo gasta)
```
inciso (8) → principal (48) → parcial (79) → subparcial (794)
```

---

## Indicadores Derivados

| Indicador | Fórmula SQL | Significado |
|-----------|-------------|-------------|
| Tasa de ejecución | `SUM(credito_devengado) / NULLIF(SUM(credito_vigente), 0) * 100` | % del presupuesto ejecutado. >100% indica sobre-ejecución. |
| Subejecución | `1 - (SUM(credito_devengado) / NULLIF(SUM(credito_vigente), 0))` | % NO ejecutado. Alta subejecución = señal de alerta. |
| Deuda Flotante | `SUM(credito_devengado) - SUM(credito_pagado)` | Lo devengado pero no pagado. Indica estrés financiero. |
| Modificación presupuestaria | `SUM(credito_vigente) - SUM(credito_presupuestado)` | Cambio vs. ley original. Positivo = ampliación. |
| Tasa de pago | `SUM(credito_pagado) / NULLIF(SUM(credito_devengado), 0) * 100` | Eficiencia de pagos. |
| Peso relativo | `SUM(credito_devengado) / (SELECT SUM(credito_devengado) FROM presupuesto_nacion_2024) * 100` | Participación en el total. |

---

## Reglas SQL

1. **Filtros de texto con acentos:**
   ```sql
   WHERE unaccent(LOWER(j.jurisdiccion_desc)) LIKE unaccent(LOWER('%salud%'))
   ```

2. **NULLIF para evitar division by zero:**
   ```sql
   SUM(devengado) / NULLIF(SUM(vigente), 0)
   ```

3. **LIMIT para resultados grandes:**
   ```sql
   LIMIT 100
   ```

4. **JOINs con keys compuestas** (OBLIGATORIO para dimensiones jerárquicas):
   ```sql
   -- CORRECTO:
   JOIN dim_programa p ON h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id
   -- INCORRECTO (duplica filas):
   JOIN dim_programa p ON h.programa_id = p.programa_id
   ```

5. **CTEs para queries complejas:**
   ```sql
   WITH totales AS (
     SELECT jurisdiccion_id, SUM(credito_devengado) as total
     FROM presupuesto_nacion_2024
     GROUP BY jurisdiccion_id
   )
   SELECT j.jurisdiccion_desc, t.total
   FROM totales t
   JOIN dim_jurisdiccion j ON t.jurisdiccion_id = j.jurisdiccion_id
   ```

6. **Dimensiones simples (JOIN por 1 campo):**
   - dim_jurisdiccion: `jurisdiccion_id`
   - dim_inciso: `inciso_id`
   - dim_finalidad: `finalidad_id`
   - dim_fuente_financiamiento: `fuente_financiamiento_id`
   - dim_ubicacion_geografica: `ubicacion_geografica_id`
   - dim_caracter: `caracter_id`
   - dim_sector: `sector_id`

---

## Queries de Ejemplo

### 1. Gasto total por jurisdicción
```sql
SELECT j.jurisdiccion_desc,
       SUM(h.credito_devengado) AS total_devengado,
       SUM(h.credito_vigente) AS total_vigente,
       ROUND(SUM(h.credito_devengado) / NULLIF(SUM(h.credito_vigente), 0) * 100, 1) AS pct_ejecucion
FROM presupuesto_nacion_2024 h
JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
GROUP BY j.jurisdiccion_desc
ORDER BY total_devengado DESC;
```

### 2. Top 10 programas (con key compuesta)
```sql
SELECT p.programa_desc, s.servicio_desc,
       SUM(h.credito_devengado) AS total_devengado
FROM presupuesto_nacion_2024 h
JOIN dim_programa p ON h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id
JOIN dim_servicio s ON h.entidad_id = s.entidad_id AND h.servicio_id = s.servicio_id
GROUP BY p.programa_desc, s.servicio_desc
ORDER BY total_devengado DESC
LIMIT 10;
```

### 3. Gasto por tipo económico (inciso)
```sql
SELECT i.inciso_desc,
       SUM(h.credito_devengado) AS devengado,
       ROUND(SUM(h.credito_devengado) / (SELECT SUM(credito_devengado) FROM presupuesto_nacion_2024) * 100, 1) AS pct_total
FROM presupuesto_nacion_2024 h
JOIN dim_inciso i ON h.inciso_id = i.inciso_id
GROUP BY i.inciso_desc
ORDER BY devengado DESC;
```

### 4. Subejecución por jurisdicción
```sql
SELECT j.jurisdiccion_desc,
       SUM(h.credito_vigente) AS vigente,
       SUM(h.credito_devengado) AS devengado,
       ROUND((1 - SUM(h.credito_devengado) / NULLIF(SUM(h.credito_vigente), 0)) * 100, 1) AS pct_subejecutado
FROM presupuesto_nacion_2024 h
JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
GROUP BY j.jurisdiccion_desc
HAVING SUM(h.credito_vigente) > 0
ORDER BY pct_subejecutado DESC;
```

### 5. Deuda flotante por ministerio
```sql
SELECT j.jurisdiccion_desc,
       SUM(h.credito_devengado) - SUM(h.credito_pagado) AS deuda_flotante
FROM presupuesto_nacion_2024 h
JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
GROUP BY j.jurisdiccion_desc
HAVING SUM(h.credito_devengado) - SUM(h.credito_pagado) > 0
ORDER BY deuda_flotante DESC;
```

### 6. Gasto por finalidad y función
```sql
SELECT fi.finalidad_desc, fu.funcion_desc,
       SUM(h.credito_devengado) AS devengado
FROM presupuesto_nacion_2024 h
JOIN dim_finalidad fi ON h.finalidad_id = fi.finalidad_id
JOIN dim_funcion fu ON h.finalidad_id = fu.finalidad_id AND h.funcion_id = fu.funcion_id
GROUP BY fi.finalidad_desc, fu.funcion_desc
ORDER BY devengado DESC;
```

### 7. Gasto por provincia
```sql
SELECT ug.ubicacion_geografica_desc AS provincia,
       SUM(h.credito_devengado) AS devengado
FROM presupuesto_nacion_2024 h
JOIN dim_ubicacion_geografica ug ON h.ubicacion_geografica_id = ug.ubicacion_geografica_id
GROUP BY ug.ubicacion_geografica_desc
ORDER BY devengado DESC;
```

### 8. Sankey: jurisdicción → tipo de gasto
```sql
SELECT j.jurisdiccion_desc AS source,
       i.inciso_desc AS target,
       SUM(h.credito_devengado) AS value
FROM presupuesto_nacion_2024 h
JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
JOIN dim_inciso i ON h.inciso_id = i.inciso_id
GROUP BY j.jurisdiccion_desc, i.inciso_desc
HAVING SUM(h.credito_devengado) > 0
ORDER BY value DESC
LIMIT 50;
```

### 9. Treemap: distribución jerárquica
```sql
SELECT j.jurisdiccion_desc, p.programa_desc,
       SUM(h.credito_devengado) AS value
FROM presupuesto_nacion_2024 h
JOIN dim_jurisdiccion j ON h.jurisdiccion_id = j.jurisdiccion_id
JOIN dim_programa p ON h.servicio_id = p.servicio_id AND h.programa_id = p.programa_id
GROUP BY j.jurisdiccion_desc, p.programa_desc
HAVING SUM(h.credito_devengado) > 100
ORDER BY value DESC
LIMIT 50;
```

---

*Este archivo se inyecta automáticamente como contexto del LLM via `src/lib/ai/prompts.ts`*
