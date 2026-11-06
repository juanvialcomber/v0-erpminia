# Workspace de Elías

## Principio

Organizar el workspace por trabajo diario, no por módulos técnicos ni por la arquitectura interna de MOTIL.

## Primer nivel

1. **Hoy**
   - pendientes;
   - vencidos;
   - próximos 7 días;
   - pagos/firmas/evidencia que requieren acción;
   - alertas por atraso contractual.

2. **Contratos y pagos**
   - contrato;
   - hitos/OC;
   - avance físico;
   - monto ejecutado;
   - facturado;
   - pendiente de facturar;
   - retención;
   - pago Laudus;
   - fecha programada y real;
   - excepciones.

3. **Proveedores**
   - portal de proveedores;
   - carga mensual de cumplimiento;
   - documentos;
   - aprobación/rechazo;
   - subsanaciones;
   - vencimientos;
   - trazabilidad.

4. **Asistente**
   - responder qué falta;
   - qué cambió;
   - qué contrato requiere atención;
   - qué pago está pendiente;
   - qué retención existe;
   - qué proveedor tiene documentos pendientes;
   - devolver una conclusión y una siguiente acción.

## Segundo nivel / soporte

Mantener accesibles sin competir con el flujo principal:

- Evidencia Laudus;
- Control contractual;
- Archivo Legal;
- Casos;
- Requisitos EECC;
- Obligaciones / SERNAGEOMIN;
- Plazos fatales;
- Propiedad minera;
- Permisos y licencias;
- Importar.

## Requerimientos de reunión 6 Nov 2026

Incorporar progresivamente:

- cálculo automático de estados de pago y fechas;
- semáforo de fechas: rojo = `Vencido`, amarillo = `Próximo` (0-7 días), verde = `En plazo` (>7 días); sin fecha = `Sin fecha`, nunca verde por defecto;
- actualización desde foto, PDF, email, WhatsApp o planilla;
- alerta de contratos atrasados a responsables;
- proveedores cargando cumplimiento mensual por portal;
- rechazo de documentos con devolución al proveedor;
- aviso a Gerencia cuando una transferencia/pago esté listo;
- liquidaciones de transportistas con tonelaje y descuentos de combustible;
- trazabilidad de royalties desde correos de liquidación.

## Regla UX

Mostrar primero:

`Qué requiere atención -> Por qué -> Siguiente acción`

Luego permitir expandir:

`Contrato -> Hito -> OC -> Factura -> Retención -> Pago -> Evidencia`

No exponer "Laudus", "staging", "sync", "RLS", "canonical" ni otros términos de infraestructura como concepto principal para Elías.
