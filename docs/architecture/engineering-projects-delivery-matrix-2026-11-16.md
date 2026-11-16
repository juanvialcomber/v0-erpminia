# Ingeniería y Proyectos — matriz de entrega y reconciliación de ramas (2026-11-16)

## Auditoría Git
- Se enumeraron 352 ramas del repositorio `juanvialcomber/v0-erpminia` (búsqueda paginada, 16-11-2026).
- La rama específica `feat/engineering-projects-discovery-v1` corresponde al PR #317 abierto; frente a main: 12 commits adelante, 2 atrás, mergeable=false. No hacer merge directo sin resolver divergencia.
- `fix/runtime-errors-and-warnings` es una rama histórica, 717 commits detrás de main; no asumir que resuelve los avisos actuales ni fusionarla en bloque.
- La versión main `5adfbc72` corresponde al PR #321 de Patagua; no confundirla con Ingeniería y Proyectos.
- La enumeración no prueba que todas las ramas contengan trabajo pendiente. Evaluar diferencias, PR y pruebas antes de rescatar cambios; no fusionar indiscriminadamente.

## Contrato de producto pendiente de implementar
| Área | Resultado verificable | Estado |
| --- | --- | --- |
| Acceso | Cargo Jefe Ingeniería y Proyectos ve entrada y workspace propio, permisos tenant y acciones diferenciadas | En PR #317, sin QA |
| Organización | Ingeniería/planificación y preparación; Servicios Generales; Contratistas Externos | No implementado |
| Solicitudes | Cualquier departamento habilitado puede crear y consultar solicitudes propias; Ingeniería recibe y prioriza | No implementado |
| Aprobaciones | Firmas supervisor y segundo validador, con actor, fecha, documento y estado auditable | Reglas por confirmar |
| Urgencias | Cambios a programa aprobado requieren decisión explícita de Gerencia, no basta etiqueta urgente | No implementado |
| Programación | Vista por proyecto/hito/dependencia/recurso; baseline aprobado y revisiones visibles | No implementado |
| Cartera | Incorporar y conciliar ~20 proyectos informados, sin convertir ese número en dato de BD | Fuente pendiente |
| Presupuesto | Versiones, partidas, cotizaciones, evaluación y confección con revisión humana | No implementado |
| Contabilidad | Distinguir presupuesto, comprometido, contabilizado, facturado y pagado; referencias canónicas | No implementado |
| Avances | % físico con numerador/denominador/fuente/fecha; pendientes y reporte consolidado | No implementado |
| Asistente | Evaluar presupuestos, redactar avances e informes citando evidencia; no aprobar ni escribir automáticamente | Parcial (asistente topografía read-only) |
| Manual de Carreteras | Biblioteca versionada y respuestas citadas según edición vigente y alcance | Fuente pendiente |
| Contratistas | Recepción de trabajos, evidencias y permisos segregados | No implementado |

## Secuencia segura
1. Integrar en la rama de Ingeniería los cambios recientes de main sin perder los 12 commits; resolver conflictos y ejecutar pruebas.
2. Verificar navegación y acceso de Cristian con sesión real; mantener denegación a otros cargos sin permiso.
3. Diseñar y probar solicitudes interdepartamentales, doble firma y escalamiento a Gerencia; no activar escrituras antes de matriz autorizada.
4. Integrar cartera canónica, cronograma y presupuestos; cruzar contabilidad sin inventar pagos.
5. Agregar informes/IA con citas y QA humano.
6. Pasar lint, typecheck, test, build y QA autenticado en preview del SHA exacto antes de pedir merge.

## Riesgos
- PR #317 actualmente no es fusionable; publicar por fuerza puede sobrescribir trabajo nuevo.
- API actual devuelve listas vacías intencionalmente: no presentar como 0 proyectos reales.
- No dar permisos de edición por defecto a un usuario con permisos solo LEC.
