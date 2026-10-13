# Matriz de aplicabilidad Legal / EECC — base normativa para MOTIL
Fecha de levantamiento: 2026-10-12. Estado: revisión jurídica y de Prevención requerida antes de automatizar gates.

## Principios
- La aprobación documental L1 por Legal **no** constituye autorización de ingreso ni habilitación operacional.
- Evitar la regla fija "19 documentos obligatorios" para todo contratista. Determinar aplicabilidad según faena, contrato, trabajo, personal, vehículos/equipos y riesgos.
- Cada control debe registrar: `fuente`, `norma_articulo`, `aplica` (sí/no/pendiente), `justificacion`, `responsable`, `evidencia`, `fecha_vigencia`, `estado_revision`, `audit_timestamp`.
- Separar aprobación Legal, visto bueno HSE/Prevención y habilitación operacional. Una firma L2 documental solo se solicita cuando Legal la defina; los controles legalmente exigibles no se vuelven opcionales por esa decisión.
- La recepción del archivo no acredita por sí sola autenticidad, vigencia ni cumplimiento.

## Controles candidatos
| Control | Base | Regla sugerida |
|---|---|---|
| Aviso inicio actividades de contratista | SERNAGEOMIN, Formularios Seguridad Minera; DS 132 RSM | Evidencia de presentación cuando corresponda a inicio o reinicio |
| Contrato y alcance de obra, faena, fechas y encargados | DS 76 art. 5 | Registro trazable actualizado, documentación contractual |
| Antecedentes de empresa y organismo administrador Ley 16.744 | DS 76 art. 5 | Identidad legal, responsables, personas, período |
| Evaluación de riesgos y procedimientos de trabajo | DS 76 arts. 5, 9, 10; DS 132 cuando aplica | Revisión técnica HSE por actividad |
| Reglamento especial EECC y constancia de entrega | DS 76 arts. 11–13 | Verificar aplicabilidad y evidencia de entrega antes del trabajo |
| Coordinación preventiva empresa principal/contratista | DS 76 art. 6 | Responsable, registro y seguimiento |
| Declaración de accidentabilidad contratistas E-200 | Formularios Seguridad Minera SERNAGEOMIN | Seguimiento mensual según obligación y reporte aplicable |
| Autorizaciones sectoriales especiales | DS 132 y trámites SERNAGEOMIN | Activar solo según actividad: explosivos, equipos, proyecto, etc. |
| Control de acceso de personal | Normativa de seguridad minera y protocolo faena | Gate operacional separado, nunca equivaler a aprobación Legal |

## Reglas de implementación
1. Elías revisa cada documento L1: conforme/observado (motivo obligatorio).
2. EECC corrige solo lo observado; cada nueva versión conserva historia.
3. Documento no aplicable debe incluir motivo y decisión del rol competente, no tratarlo automáticamente como faltante o aprobado.
4. Carpeta con evidencia pendiente o evaluaciones incompletas no se declara documentalmente conforme.
5. L2 es firma documental complementaria opcional a criterio Legal; HSE y autorización de ingreso son controles independientes.
6. Avisos SERNAGEOMIN y E-200 requieren conservar acuse/constancia si corresponden; no fingir una presentación automática.
7. No crear plazos genéricos universales sin acreditar texto vigente y tipo de faena.

## Fuentes oficiales
- SERNAGEOMIN, seguridad minera: https://www.sernageomin.cl/seguridad-minera/
- SERNAGEOMIN, formularios: https://www.sernageomin.cl/formularios-seguridad-minera/
- SERNAGEOMIN, SIMIN: https://www.sernageomin.cl/simin/
- Biblioteca Congreso Nacional, DS 76: https://www.bcn.cl/leychile/navegar?idNorma=257601
- Ley 16.744 art. 66 bis: https://www.bcn.cl/leychile/navegar?idNorma=28650
- SERNAGEOMIN, Reglamento de Seguridad Minera DS 132 (verificar versión consolidada): https://www.sernageomin.cl/gobiernotransparente/marconormativo/pdf/ReglamentodeSeguridadMinera.pdf

**Pendiente con Legal/Prevención:** determinar actividades, contratos y riesgos reales de las 17 EECC antes de configurar requisitos individualizados. No declarar conformidad legal en base a esta matriz sin validación.
