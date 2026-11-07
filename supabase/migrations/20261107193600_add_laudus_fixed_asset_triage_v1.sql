-- Classify every pending Laudus fixed asset into an accountable area without
-- creating one human task per source row. Only evidence-backed identity candidates
-- are routed as actionable tasks; the rest remain an enrichment/backlog responsibility.

create or replace view public.laudus_fixed_asset_triage_v1
with (security_invoker = true)
as
with base as (
  select
    f.*,
    lower(translate(
      coalesce(f.name,'') || ' ' || coalesce(f.manufacturer,'') || ' ' || coalesce(f.model,''),
      'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'
    )) as txt,
    exists (
      select 1
      from public.data_reconciliation_reviews d
      where d.organization_id=f.organization_id
        and d.issue_key='laudus:fixed_asset_identity:' || f.external_id
        and d.status='open'
    ) as has_open_identity_review
  from public.laudus_fixed_assets_service_v1 f
  where f.reconciliation_status='pending'
),
classified as (
  select
    b.*,
    case
      when b.has_open_identity_review then 'identity_review'
      when b.txt ~ '(^| )(cuota|anticipo|f[ /.-]*[0-9]|fact |factura|e°?p|eªp|abono|leasing|impuesto transferencia|nc[ /0-9-])'
        then 'finance_accounting'
      when b.txt ~ '(campamento|capamento|gimnasio|gimansio|sala de juegos|sala de entretencion|cocina|termo electrico|casino|container|contenedor|caseta|block mujeres|habitacion|comedor|dormitorio|mobiliario|mueble|cortina|silla|estante|techo oficina|aire acondicionado|aires acondicionado|equipo a/c|amasadora|insta\. de puerta|gasfiteria|sani)'
        then 'administration_infrastructure'
      when b.txt ~ '(notebook|desktop|computador|cpu |pc |impresora|monitor|monitos gamer|televisor|led tv|smart tv|servidor|router|tablet|iphone|celular|central telefonica|ups |lenovo|internet)'
        then 'administration_it'
      when b.txt ~ '(espectometro|laboratorio|lab quimica|eaa|topograf|leica|phantom|dji|drone|estacion base|gps|prisma|tripode|scanner laser|geosight|partidor de testigos|horno de secado|hrono de secado|bandejas para horno|pulverizador|agitador.*reactivo)'
        then 'technical_planning'
      when b.txt ~ '(bomba|bba|motor|motos siemens|mot |camion|camioneta|bus |cargador|compresor|retroexcavadora|sonda|perforadora|tecle|soldadora|soldar|winch|hidrolavadora|motobomba|reductor|chancador|molino|tractor|excavadora|manipulador|afiladora|elevador|sierra|vdf|variador de frecuencia|estanque|mezclador|prensa|prensadora|generador|grupo electrogeno|gri.po electrogeno|martillo|ventilador|lubricacion|transformador|implementos taller|escaner launch|equipo escaner|herramienta|torno|taladro|maquina industrial|maquina cortadora|apilador|placa iman|dumper|scoop|jumbo|grua horquilla|control remoto|manometro|dializadora|equipo nuevo mina)'
        then 'maintenance_operational'
      when b.txt ~ '(proyecto|hormigon|construccion|construcc|condtruccion|habilitacion|red electrica|red de agua|galpon|edificio|obra civil|instalacion|reparaciones .*container|pavimento|radier|materiales y mano de obra|revuelto y base)'
        then 'administration_infrastructure'
      else 'administration_review'
    end as triage_bucket
  from base b
)
select
  c.organization_id,
  c.external_id,
  c.name,
  c.manufacturer,
  c.model,
  c.serial_number,
  c.invoice_number,
  c.canonical_asset_id,
  c.reconciliation_status,
  c.has_open_identity_review,
  c.triage_bucket,
  case
    when c.triage_bucket in ('identity_review','maintenance_operational')
      then 'Jefe Departamento de Mantenimiento'
    when c.triage_bucket='technical_planning'
      then 'Jefe de Planificación'
    else 'Gerente de Finanzas'
  end as responsible_cargo_name,
  case
    when c.triage_bucket='identity_review'
      then 'Confirmar, rechazar o diferir identidad operacional con evidencia.'
    when c.triage_bucket='maintenance_operational'
      then 'Enriquecer identidad operacional antes de generar una revisión humana.'
    when c.triage_bucket='technical_planning'
      then 'Validar naturaleza técnica y aportar identidad/ubicación operacional.'
    when c.triage_bucket='finance_accounting'
      then 'Clasificar como registro contable y evitar tratarlo como activo operacional sin evidencia.'
    else 'Clasificar custodia administrativa/infraestructura antes de cualquier vínculo operacional.'
  end as next_action,
  case when c.has_open_identity_review then true else false end as human_action_now
from classified c;
