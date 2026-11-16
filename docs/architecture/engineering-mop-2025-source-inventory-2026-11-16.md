# Manual de Carreteras 2025: inventario de fuentes y situación de integración — 16-11-2026

**Alcance:** documentación entregada por el usuario para la futura biblioteca de Ingeniería y Proyectos (Cristian, La Patagua). Los PDF son material del MOP con derechos reservados: no se agregan binarios al repositorio. **Importante: inventario / ficha de contenidos NO significa que el asistente MOTIL ya pueda recuperar este corpus.**

## 12 archivos originales verificados localmente
| Fuente | Páginas PDF | Tema | SHA-256 |
|---|---:|---|---|
| Resolución DV (Ex.) 1873, 2025 | 10 | Modificaciones 2025, sujeto a complementación N°348 | `c164cf244518756f1af3ddf180e75e75104701b74cf0802d110d92931fc9299c` |
| Resolución DV (Ex.) 348, 2025 | 12 | Precisión/corrección y ratificación, vigencia desde 01-01-2026 | `2a394338e3b09f19fe60892708501ddd320f4a013c8a747db51d497ad15e42be` |
| Vol. 1 Tomo II | 414 | Evaluación social de proyectos viales interurbanos | `3375773ba1863bcbf50309cef743c71cd39aad72d7fee58a0f6ce563048c0bb2` |
| Vol. 2 | 505 | Procedimientos y estudios viales; topografía, cubicaciones, geotecnia, hidráulica, términos de referencia | `9b597b93f557cda14de4084d4b58a3c6ad845e8e521f7b9db17a7253d9b04e9a` |
| Vol. 3 | 1557 | Diseño: geometría, vehículos, plataforma, pavimentos, drenajes, puentes | `a1f54a05cd527978e2875dab4dda1052712222cbb3885a71504e988b0db8767d` |
| Vol. 4 | 450 | Planos de obra tipo: movimiento de tierras, drenaje, pavimentos, seguridad, contención, protección fluvial, puentes | `2a121ca4dfb4e33080e88f80e4bf8abe90cfa2a844fa5d0feb21c930b959a4fc` |
| Vol. 5 | 824 | Especificaciones de construcción: preparación, movimiento de tierras, capas, estructuras, drenaje, taludes y calidad | `a9675c7f090e5b9c058a864c2bab5b05955c94b413f9d8d691033aea0ad12570` |
| Vol. 6 | 994 | Seguridad vial: señalización de obra, dispositivos, contención, iluminación y peatones | `668a01b05f6b9d4c93594c198ba760825974665d1e341c5484b3c9a7bf3df02d` |
| Vol. 7 | 478 | Mantenimiento vial: gestión, procedimientos y operaciones de conservación | `5775f24456effb140d70cb68e0557f7b01ea0729461b5dfa56392a0751b53251` |
| Vol. 8 | 1321 | Métodos de muestreo, ensayo y control: suelos, áridos, asfaltos, hormigón, auscultación | `741c341e48b1ad239d9868f52c0a3df8620e6aa2e3adeb72685abd22dc346a7f` |
| Vol. 9 | 656 | Sustentabilidad vial, gestión en diseño, construcción, mantenimiento, estudios ambientales | `e402d7bbaf306f36f1e7495ad4f04b050220e6c37a3e15e7e17cce799f9f0f0d` |
| Partidas MC Vol. 5 2025.xlsx | — | 400 partidas distintas con código, capítulo, descripción y unidad, **no precios** | `0645a952713c36785f030771c79473d2e97d827bf6f0faf8a7a8a075df05ae8f` |

**Cobertura:** 11 PDF, 7.221 páginas, más un XLSX. Los archivos fueron validados localmente en la conversación, no importados a Supabase ni a storage del producto.

## Comprensión verificable por fase
1. **V1-V3 + resoluciones:** análisis técnico previo detallado en `manual-carreteras-2025-lectura-tecnica-patagua-2026-11-16.md`; registrar únicamente criterios con fuente y página verificadas.
2. **V4-V9:** archivos recibidos; se inspeccionaron portadas, prólogos y estructura de capítulos. **No declararlos estudiados exhaustivamente**. Planos del V4, tablas, ensayos y parámetros numéricos requieren revisión visual por disposición antes de dar respuestas de ingeniería.
3. **Excel:** 400 partidas únicas en 9 familias: 5.100 (33), 5.200 (60), 5.300 (11), 5.400 (49), 5.500 (89), 5.600 (42), 5.700 (83), 5.800 (12), 5.900 (21). La planilla no es una lista de costos unitarios o cotizaciones; **no calcular presupuestos en pesos sin fuentes de precio/mediciones verificadas**.

## Casos aplicables a La Patagua, sujetos a proyectos reales
- **Cubicaciones / terreno:** V2 §2.308 + V4 planos + V5 movimientos de tierras; exigir topografía, superficies y versión aprobada.
- **Caminos internos, accesos y camiones:** V3 geometría/vehículos/pavimento; verificar flota, cargas de eje y alcance del método antes de extrapolar a camiones mineros fuera de carretera.
- **Taludes / contención:** V2 geotecnia + V3 diseño + V4 detalles + V5 5.800; necesitar estudio y aprobación de especialista.
- **Drenajes / alcantarillas:** V2 hidrología + V3 3.700 + V4 detalles + V5 5.600 + V7 conservación; no dimensionar sin caudal y condiciones de sitio.
- **Construcción / presupuesto:** V5 especificaciones + Excel partidas con unidades; enlazar cada partida al diseño/contrato, cantidades, precios y presupuesto versionado. **No convertir partida en precio**.
- **Seguridad vial de contratistas:** V6 6.300/6.400 y demás requisitos aplicables; no reemplaza seguridad minera ni autorizaciones HSE.
- **Calidad / recepción:** V5 5.005 y V8 ensayos; exigir registros, certificados y decisión del responsable; el asistente no firma conformidades.
- **Mantenimiento:** V7 + V9 para programar obras de conservación y aspectos de sustentabilidad cuando proceda.
- **Evaluación / alternativas:** V1 Tomo II es metodología de evaluación social pública; separar de costo-beneficio privado de La Patagua.

## Restricciones de aplicación
La edición 2025, integrada con N°348, rige desde 01-01-2026 según resolución. N°348 excluye la incorporación de la huella de carbono D.6 (cap. 5.900) y el resalto redondeado C.2.i; obliga verificar situación de licitación y fe de erratas. Que el catálogo MOP indique «Técnico-Vinculante» no convierte todas sus cláusulas en exigencias automáticas en una obra minera privada. Siempre clasificar «requisito contractual», «referencia técnica» o «no verificado».

## Estado real de conexión
- Archivos originales recibidos localmente: **VERIFICADO**.
- Inventario con SHA y estructura temática en GitHub branch: **VERIFICADO**.
- Índice de contenido a nivel de página/sección con validación visual y búsqueda citada: **PENDIENTE**.
- PDF/XLSX en storage canónico autorizado de MOTIL: **NO VERIFICADO; NO DECLARAR INGESTADO**.
- RAG del asistente de Cristian con pruebas de cita, versionado, RBAC y tenant: **NO CONECTADO**.
- Relación con proyectos/presupuestos reales de La Patagua: **BLOQUEADA**, sin cartera canónica certificada y permisos de escritura validados.
- Merge/producción: **HOLD**.

**Siguiente gate:** habilitar repositorio documental privado con source hash, volumen/capítulo/numeral/página y reglas de acceso; implementar consultas citadas read-only en preview, validar pruebas con casos reales de Cristian. Las autorizaciones de solicitudes, aprobación CEO y cambios al programa son flujos deterministas separados del Manual.
