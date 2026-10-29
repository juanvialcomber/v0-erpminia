export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';

type Issue = {
  issue_key: string;
  entity_type: 'product' | 'supplier' | 'asset' | 'person' | 'inventory' | 'work_order' | 'purchase_order' | 'invoice' | 'cost_center' | 'warehouse' | 'external_source';
  entity_id: string | null;
  issue_type: string;
  field_name: string | null;
  severity: 'observation' | 'warning' | 'critical';
  label: string;
  detail: string;
  href: string;
};

function text(value: unknown) { return String(value ?? '').trim(); }
function norm(value: unknown) { return text(value).toLocaleLowerCase('es-CL').replace(/\s+/g, ' '); }
function addIssue(list: Issue[], issue: Issue) { list.push(issue); }

function externalEntityType(value: unknown): Issue['entity_type'] {
  const type = norm(value);
  if (type === 'product') return 'product';
  if (type === 'supplier') return 'supplier';
  if (type === 'warehouse' || type === 'stock') return type === 'stock' ? 'inventory' : 'warehouse';
  if (type === 'purchase_order' || type === 'purchase_order_line') return 'purchase_order';
  if (type === 'supplier_invoice' || type === 'supplier_invoice_line' || type === 'dte') return 'invoice';
  if (type === 'cost_center') return 'cost_center';
  if (type === 'fixed_asset') return 'asset';
  return 'external_source';
}

function externalHref(entityType: Issue['entity_type']) {
  if (entityType === 'product' || entityType === 'inventory' || entityType === 'warehouse') return '/dashboard/bodega';
  if (entityType === 'supplier' || entityType === 'purchase_order' || entityType === 'invoice') return '/dashboard/compras';
  if (entityType === 'cost_center') return '/dashboard/finanzas/centros';
  if (entityType === 'asset') return '/dashboard/mantenimiento/equipos';
  return '/dashboard/calidad-datos';
}

async function fetchAll(queryFactory: (from: number, to: number) => any) {
  const rows: any[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await queryFactory(from, from + chunk - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < chunk) break;
  }
  return rows;
}

function duplicateIssues(rows: any[], entityType: Issue['entity_type'], idField: string, nameField: string, href: (row: any) => string) {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const key = norm(row[nameField]);
    if (!key) continue;
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  const issues: Issue[] = [];
  for (const [key, group] of grouped) {
    if (group.length < 2) continue;
    for (const row of group) {
      const peers = group.filter((item) => item[idField] !== row[idField]);
      addIssue(issues, {
        issue_key: `${entityType}:${row[idField]}:duplicate_name:${key}`,
        entity_type: entityType,
        entity_id: row[idField],
        issue_type: 'duplicate_candidate',
        field_name: nameField,
        severity: 'warning',
        label: text(row[nameField]) || 'Registro sin nombre',
        detail: `Nombre coincidente con ${peers.length} registro${peers.length === 1 ? '' : 's'} distinto${peers.length === 1 ? '' : 's'}. Requiere revisión humana; no se fusiona automáticamente.`,
        href: href(row),
      });
    }
  }
  return issues;
}

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({
      error: 'La conciliación transversal está restringida a administradores hasta que exista un permiso RRHH/Data Governance explícito.',
    }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const canonical = context.supabase.schema('canonical');

  try {
    const [products, suppliers, assets, people, stock, workOrders, reviews] = await Promise.all([
      fetchAll((from, to) => canonical.from('products').select('id, product_code, name, family, unit, standard_cost, is_active, validation_status, validation_notes').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => canonical.from('suppliers').select('id, tax_id, legal_name, trade_name, payment_terms, email, is_active, validation_status, validation_notes').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => canonical.from('assets').select('id, asset_code, name, asset_type, category, manufacturer, model, serial_number, is_active, validation_status, validation_notes').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => context.supabase.from('people').select('id, full_name, normalized_name, rut, email, role_title, employment_status, supervisor_person_id').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => context.supabase.from('warehouse_stock').select('id, canonical_product_id, part_code, part_name, quantity_on_hand, quantity_reserved, quantity_available, unit_cost').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => context.supabase.from('maintenance_work_orders').select('id, work_order_number, title, status, asset_id, canonical_asset_id, assigned_person_id, assigned_to_name').eq('organization_id', context.organizationId).range(from, to)),
      fetchAll((from, to) => context.supabase.from('data_reconciliation_reviews').select('id, issue_key, entity_type, entity_id, issue_type, field_name, status, resolution_note, evidence_reference, reviewed_by, reviewed_at, updated_at').eq('organization_id', context.organizationId).range(from, to)),
    ]);

    const issues: Issue[] = [];

    try {
      const externalRows = await fetchAll((from, to) => context.supabase
        .schema('integration')
        .from('reconciliation_items')
        .select('id,source_id,raw_record_id,entity_type,external_id,canonical_id,resolution_status,resolution_method,confidence,conflict_reasons,created_at,updated_at')
        .eq('organization_id', context.organizationId)
        .in('resolution_status', ['pending', 'conflict', 'new_candidate'])
        .range(from, to));

      const productCandidateIds = [...new Set(
        externalRows
          .filter((row) => norm(row.entity_type) === 'product' && norm(row.resolution_status) === 'new_candidate')
          .map((row) => text(row.external_id))
          .filter(Boolean),
      )];

      const productCandidateMap = new Map<string, any>();
      const productPositionMap = new Map<string, any[]>();

      if (productCandidateIds.length) {
        const [candidateProducts, candidateStock, warehouseRows] = await Promise.all([
          fetchAll((from, to) => context.supabase
            .schema('integration')
            .from('laudus_products')
            .select('external_id,sku,description,unit_of_measure')
            .eq('organization_id', context.organizationId)
            .in('external_id', productCandidateIds)
            .range(from, to)),
          fetchAll((from, to) => context.supabase
            .schema('integration')
            .from('laudus_product_stock')
            .select('product_external_id,warehouse_external_id,lot,stock,source_date_to,synced_at')
            .eq('organization_id', context.organizationId)
            .in('product_external_id', productCandidateIds)
            .range(from, to)),
          fetchAll((from, to) => context.supabase
            .schema('integration')
            .from('laudus_warehouses')
            .select('external_id,name')
            .eq('organization_id', context.organizationId)
            .range(from, to)),
        ]);

        for (const row of candidateProducts) productCandidateMap.set(text(row.external_id), row);

        const warehouseNames = new Map(warehouseRows.map((row) => [text(row.external_id), text(row.name)]));
        const latestPositions = new Map<string, any>();
        for (const row of candidateStock) {
          const productId = text(row.product_external_id);
          const warehouseId = text(row.warehouse_external_id);
          if (!productId || !warehouseId) continue;
          const key = `${productId}:${warehouseId}:${text(row.lot)}`;
          const current = latestPositions.get(key);
          const currentAt = Date.parse(text(current?.source_date_to || current?.synced_at)) || 0;
          const nextAt = Date.parse(text(row.source_date_to || row.synced_at)) || 0;
          if (!current || nextAt >= currentAt) latestPositions.set(key, row);
        }

        const warehouseTotals = new Map<string, { productId: string; warehouseCode: string; stock: number }>();
        for (const row of latestPositions.values()) {
          const productId = text(row.product_external_id);
          const warehouseCode = text(row.warehouse_external_id);
          if (!productId || !warehouseCode) continue;
          const key = `${productId}:${warehouseCode}`;
          const current = warehouseTotals.get(key);
          warehouseTotals.set(key, {
            productId,
            warehouseCode,
            stock: Number(current?.stock || 0) + Number(row.stock || 0),
          });
        }

        for (const row of warehouseTotals.values()) {
          const positions = productPositionMap.get(row.productId) || [];
          positions.push({
            warehouseCode: row.warehouseCode,
            warehouseName: warehouseNames.get(row.warehouseCode) || '',
            stock: row.stock,
          });
          productPositionMap.set(row.productId, positions);
        }

        for (const positions of productPositionMap.values()) {
          positions.sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode, 'es-CL'));
        }
      }

      for (const row of externalRows) {
        const entityType = externalEntityType(row.entity_type);
        const conflictReasons = Array.isArray(row.conflict_reasons)
          ? row.conflict_reasons.map((item: unknown) => text(item)).filter(Boolean)
          : [];
        const resolutionStatus = norm(row.resolution_status);
        const severity: Issue['severity'] = resolutionStatus === 'conflict' ? 'critical' : 'warning';
        const externalId = text(row.external_id);
        const candidate = entityType === 'product' && resolutionStatus === 'new_candidate'
          ? productCandidateMap.get(externalId)
          : null;
        const positions = candidate ? (productPositionMap.get(externalId) || []) : [];
        const candidateLabel = candidate
          ? [text(candidate.sku), text(candidate.description)].filter(Boolean).join(' · ')
          : '';
        const label = candidateLabel
          ? `Laudus producto · ${candidateLabel}`
          : `${text(row.entity_type) || 'Fuente externa'} · ${externalId || 'Sin ID externo'}`;
        const reason = conflictReasons.length
          ? conflictReasons.join(' · ')
          : resolutionStatus === 'new_candidate'
            ? 'Registro externo sin correspondencia canónica.'
            : 'Registro externo pendiente de conciliación.';
        const unit = text(candidate?.unit_of_measure);
        const stockContext = positions.length
          ? ` Posiciones Laudus más recientes por bodega: ${positions.map((position) => {
              const warehouse = [position.warehouseCode, position.warehouseName].filter(Boolean).join(' · ');
              return `${warehouse || 'Bodega sin identificar'}: ${position.stock.toLocaleString('es-CL')}${unit ? ' ' + unit : ''}`;
            }).join(' · ')}.`
          : '';

        addIssue(issues, {
          issue_key: `external:${row.id}`,
          entity_type: entityType,
          entity_id: null,
          issue_type: resolutionStatus === 'conflict' ? 'source_conflict' : resolutionStatus === 'new_candidate' ? 'new_external_candidate' : 'external_reconciliation',
          field_name: null,
          severity,
          label,
          detail: `${reason}${stockContext} La evidencia externa no modifica ni crea el maestro automáticamente.`,
          href: externalHref(entityType),
        });
      }
    } catch {
      // External integration intake is optional until its migration is deployed.
    }

    try {
      const warehouseRows = await fetchAll((from, to) => context.supabase
        .schema('integration')
        .from('laudus_warehouses')
        .select('id,external_id,name,address,county,city,state,motil_warehouse_id,reconciliation_status,source_payload')
        .eq('organization_id', context.organizationId)
        .in('reconciliation_status', ['new_candidate', 'conflict'])
        .range(from, to));

      for (const row of warehouseRows) {
        const proposedName = text(row.source_payload?.warehouse_candidate_proposed_match_name);
        const proposedCode = text(row.source_payload?.warehouse_candidate_proposed_match_code);
        const candidate = proposedName
          ? ` Posible correspondencia: ${proposedCode ? proposedCode + ' · ' : ''}${proposedName}.`
          : '';
        const location = [row.address, row.county, row.city, row.state].map(text).filter(Boolean).join(' · ');

        addIssue(issues, {
          issue_key: `laudus_warehouse:${text(row.external_id) || row.id}`,
          entity_type: 'warehouse',
          entity_id: row.motil_warehouse_id || null,
          issue_type: norm(row.reconciliation_status) === 'conflict' ? 'source_conflict' : 'new_external_candidate',
          field_name: null,
          severity: norm(row.reconciliation_status) === 'conflict' ? 'critical' : 'warning',
          label: `Laudus bodega ${text(row.external_id) || 'sin código'} · ${text(row.name) || 'Sin nombre'}`,
          detail: `Bodega física Laudus pendiente de revisión humana.${location ? ' ' + location + '.' : ''}${candidate} No se crea, fusiona ni enlaza automáticamente.`,
          href: '/dashboard/bodega',
        });
      }
    } catch {
      // Warehouse staging is optional until Laudus warehouse intake exists.
    }

    const productIds = new Set(products.map((row) => row.id));
    const assetIds = new Set(assets.map((row) => row.id));
    const peopleIds = new Set(people.map((row) => row.id));

    for (const row of products) {
      const label = `${text(row.product_code) || 'Sin código'} · ${text(row.name) || 'Sin nombre'}`;
      for (const [field, value, title] of [['name', row.name, 'nombre'], ['family', row.family, 'familia'], ['unit', row.unit, 'unidad']] as const) {
        if (!text(value)) addIssue(issues, { issue_key: `product:${row.id}:missing:${field}`, entity_type: 'product', entity_id: row.id, issue_type: 'missing_field', field_name: field, severity: 'warning', label, detail: `Producto sin ${title} canónico.`, href: `/dashboard/bodega/productos-360?productId=${row.id}` });
      }
      if (row.validation_status && row.validation_status !== 'valid') addIssue(issues, { issue_key: `product:${row.id}:validation:${row.validation_status}`, entity_type: 'product', entity_id: row.id, issue_type: 'validation_status', field_name: 'validation_status', severity: row.validation_status === 'invalid' ? 'critical' : 'warning', label, detail: `Estado de validación: ${row.validation_status}${Array.isArray(row.validation_notes) && row.validation_notes.length ? ` · ${row.validation_notes.join(', ')}` : ''}.`, href: `/dashboard/bodega/productos-360?productId=${row.id}` });
    }
    issues.push(...duplicateIssues(products.filter((row) => row.is_active !== false), 'product', 'id', 'name', (row) => `/dashboard/bodega/productos-360?productId=${row.id}`));

    for (const row of suppliers) {
      const label = `${text(row.tax_id) || 'Sin RUT'} · ${text(row.legal_name) || text(row.trade_name) || 'Sin nombre'}`;
      if (!text(row.tax_id)) addIssue(issues, { issue_key: `supplier:${row.id}:missing:tax_id`, entity_type: 'supplier', entity_id: row.id, issue_type: 'missing_field', field_name: 'tax_id', severity: 'critical', label, detail: 'Proveedor sin RUT canónico.', href: `/dashboard/compras/proveedores-360?supplierId=${row.id}` });
      if (!text(row.legal_name)) addIssue(issues, { issue_key: `supplier:${row.id}:missing:legal_name`, entity_type: 'supplier', entity_id: row.id, issue_type: 'missing_field', field_name: 'legal_name', severity: 'warning', label, detail: 'Proveedor sin razón social canónica.', href: `/dashboard/compras/proveedores-360?supplierId=${row.id}` });
      if (row.validation_status && row.validation_status !== 'valid') addIssue(issues, { issue_key: `supplier:${row.id}:validation:${row.validation_status}`, entity_type: 'supplier', entity_id: row.id, issue_type: 'validation_status', field_name: 'validation_status', severity: row.validation_status === 'invalid' ? 'critical' : 'warning', label, detail: `Estado de validación: ${row.validation_status}.`, href: `/dashboard/compras/proveedores-360?supplierId=${row.id}` });
    }
    issues.push(...duplicateIssues(suppliers.filter((row) => row.is_active !== false), 'supplier', 'id', 'legal_name', (row) => `/dashboard/compras/proveedores-360?supplierId=${row.id}`));

    for (const row of assets) {
      const label = `${text(row.asset_code) || 'Sin código'} · ${text(row.name) || 'Sin nombre'}`;
      for (const [field, value, title] of [['asset_code', row.asset_code, 'código'], ['name', row.name, 'nombre'], ['asset_type', row.asset_type, 'tipo']] as const) {
        if (!text(value)) addIssue(issues, { issue_key: `asset:${row.id}:missing:${field}`, entity_type: 'asset', entity_id: row.id, issue_type: 'missing_field', field_name: field, severity: field === 'asset_code' ? 'critical' : 'warning', label, detail: `Equipo sin ${title} canónico.`, href: `/dashboard/mantenimiento/equipos/${row.id}` });
      }
      if (row.validation_status && row.validation_status !== 'valid') addIssue(issues, { issue_key: `asset:${row.id}:validation:${row.validation_status}`, entity_type: 'asset', entity_id: row.id, issue_type: 'validation_status', field_name: 'validation_status', severity: row.validation_status === 'invalid' ? 'critical' : 'warning', label, detail: `Estado de validación: ${row.validation_status}.`, href: `/dashboard/mantenimiento/equipos/${row.id}` });
    }
    issues.push(...duplicateIssues(assets.filter((row) => row.is_active !== false), 'asset', 'id', 'name', (row) => `/dashboard/mantenimiento/equipos/${row.id}`));

    for (const row of people) {
      const label = text(row.full_name) || 'Persona sin nombre';
      if (!text(row.full_name)) addIssue(issues, { issue_key: `person:${row.id}:missing:full_name`, entity_type: 'person', entity_id: row.id, issue_type: 'missing_field', field_name: 'full_name', severity: 'critical', label, detail: 'Persona sin nombre registrado.', href: '/dashboard/personas' });
      if (!text(row.rut) && !text(row.email)) addIssue(issues, { issue_key: `person:${row.id}:missing:identity`, entity_type: 'person', entity_id: row.id, issue_type: 'missing_identity', field_name: null, severity: 'warning', label, detail: 'Persona sin RUT ni email para una identificación verificable.', href: '/dashboard/personas' });
      if (row.supervisor_person_id && !peopleIds.has(row.supervisor_person_id)) addIssue(issues, { issue_key: `person:${row.id}:orphan:supervisor`, entity_type: 'person', entity_id: row.id, issue_type: 'orphan_reference', field_name: 'supervisor_person_id', severity: 'critical', label, detail: 'La referencia de supervisor no existe dentro de la organización activa.', href: '/dashboard/personas' });
    }
    issues.push(...duplicateIssues(people, 'person', 'id', 'full_name', () => '/dashboard/personas'));

    for (const row of stock) {
      const label = `${text(row.part_code) || 'Sin código'} · ${text(row.part_name) || 'Stock'}`;
      if (!row.canonical_product_id || !productIds.has(row.canonical_product_id)) addIssue(issues, { issue_key: `inventory:${row.id}:orphan:product`, entity_type: 'inventory', entity_id: row.id, issue_type: 'orphan_reference', field_name: 'canonical_product_id', severity: 'critical', label, detail: 'Existencia sin producto canónico válido dentro de la organización.', href: '/dashboard/bodega' });
      if (Number(row.quantity_on_hand || 0) < 0 || Number(row.quantity_available || 0) < 0) addIssue(issues, { issue_key: `inventory:${row.id}:negative_stock`, entity_type: 'inventory', entity_id: row.id, issue_type: 'negative_value', field_name: 'quantity_on_hand', severity: 'critical', label, detail: `Stock negativo registrado: ${Number(row.quantity_on_hand || 0).toLocaleString('es-CL')}.`, href: '/dashboard/bodega' });
      if (Number(row.quantity_reserved || 0) > Number(row.quantity_on_hand || 0) && Number(row.quantity_on_hand || 0) >= 0) addIssue(issues, { issue_key: `inventory:${row.id}:reservation_exceeds_stock`, entity_type: 'inventory', entity_id: row.id, issue_type: 'inconsistent_quantity', field_name: 'quantity_reserved', severity: 'warning', label, detail: 'La cantidad reservada supera la existencia registrada.', href: '/dashboard/bodega' });
    }

    for (const row of workOrders) {
      const closed = ['completed', 'closed', 'cancelled', 'canceled'].includes(norm(row.status));
      const label = `${text(row.work_order_number) || 'OT'} · ${text(row.title) || 'Sin título'}`;
      if (!closed && (!row.canonical_asset_id || !assetIds.has(row.canonical_asset_id))) addIssue(issues, { issue_key: `work_order:${row.id}:orphan:asset`, entity_type: 'work_order', entity_id: row.id, issue_type: 'orphan_reference', field_name: 'canonical_asset_id', severity: 'critical', label, detail: 'OT activa sin equipo canónico válido dentro de la organización.', href: `/dashboard/mantenimiento/ordenes-trabajo/${row.id}` });
      if (!closed && row.assigned_person_id && !peopleIds.has(row.assigned_person_id)) addIssue(issues, { issue_key: `work_order:${row.id}:orphan:person`, entity_type: 'work_order', entity_id: row.id, issue_type: 'orphan_reference', field_name: 'assigned_person_id', severity: 'critical', label, detail: 'OT activa con responsable que no existe dentro de la organización.', href: `/dashboard/mantenimiento/ordenes-trabajo/${row.id}` });
    }

    const reviewMap = new Map(reviews.map((row) => [row.issue_key, row]));
    const activeKeys = new Set(issues.map((row) => row.issue_key));
    const enriched = issues.map((issue) => ({ ...issue, review: reviewMap.get(issue.issue_key) || null, active: true }));
    for (const review of reviews) {
      if (!activeKeys.has(review.issue_key)) enriched.push({ issue_key: review.issue_key, entity_type: review.entity_type, entity_id: review.entity_id, issue_type: review.issue_type, field_name: review.field_name, severity: 'observation', label: 'Incidencia ya no detectada', detail: 'La condición revisada ya no aparece en el estado actual de la fuente canónica.', href: '/dashboard/calidad-datos', review, active: false } as any);
    }

    const open = enriched.filter((row: any) => row.active && (!row.review || row.review.status === 'open'));
    const counts = {
      total_records: products.length + suppliers.length + assets.length + people.length,
      active_issues: open.length,
      critical: open.filter((row: any) => row.severity === 'critical').length,
      duplicate_candidates: open.filter((row: any) => row.issue_type === 'duplicate_candidate').length,
      orphan_references: open.filter((row: any) => row.issue_type === 'orphan_reference').length,
      reviewed: reviews.filter((row) => row.status !== 'open').length,
      by_entity: {
        product: open.filter((row: any) => row.entity_type === 'product').length,
        supplier: open.filter((row: any) => row.entity_type === 'supplier').length,
        asset: open.filter((row: any) => row.entity_type === 'asset').length,
        person: open.filter((row: any) => row.entity_type === 'person').length,
        inventory: open.filter((row: any) => row.entity_type === 'inventory').length,
        work_order: open.filter((row: any) => row.entity_type === 'work_order').length,
        purchase_order: open.filter((row: any) => row.entity_type === 'purchase_order').length,
        invoice: open.filter((row: any) => row.entity_type === 'invoice').length,
        cost_center: open.filter((row: any) => row.entity_type === 'cost_center').length,
        warehouse: open.filter((row: any) => row.entity_type === 'warehouse').length,
        external_source: open.filter((row: any) => row.entity_type === 'external_source').length,
      },
    };

    enriched.sort((a: any, b: any) => (a.review?.status === 'resolved' ? 1 : 0) - (b.review?.status === 'resolved' ? 1 : 0) || ({ critical: 0, warning: 1, observation: 2 } as any)[a.severity] - ({ critical: 0, warning: 1, observation: 2 } as any)[b.severity]);
    return NextResponse.json({
      counts,
      issues: enriched.slice(0, 1500),
      source: 'canonical',
      generatedAt: new Date().toISOString(),
      policy: 'Admin-only transitional boundary: this endpoint includes cross-domain operational data and personnel identity fields. Replace with an explicit Data Governance/RRHH permission before delegating access.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo construir la conciliación de datos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


export async function PATCH(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La revisión transversal requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const issueKey = text(body?.issueKey);
  const entityType = text(body?.entityType);
  const entityId = text(body?.entityId) || null;
  const issueType = text(body?.issueType);
  const fieldName = text(body?.fieldName) || null;
  const status = text(body?.status);
  const resolutionNote = text(body?.resolutionNote);
  const evidenceReference = text(body?.evidenceReference) || null;

  const allowedStatuses = new Set(['open', 'resolved', 'accepted', 'ignored']);
  if (!issueKey || !entityType || !issueType || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Revisión inválida.' }, { status: 400 });
  }
  if (status !== 'open' && !resolutionNote) {
    return NextResponse.json({ error: 'Debes registrar el fundamento de la decisión.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    organization_id: context.organizationId,
    issue_key: issueKey,
    entity_type: entityType,
    entity_id: entityId,
    issue_type: issueType,
    field_name: fieldName,
    status,
    resolution_note: resolutionNote || null,
    evidence_reference: evidenceReference,
    reviewed_by: status === 'open' ? null : access.user.id,
    reviewed_at: status === 'open' ? null : now,
    updated_at: now,
  };

  const result = await context.supabase
    .from('data_reconciliation_reviews')
    .upsert(payload, { onConflict: 'organization_id,issue_key' })
    .select('id,issue_key,status,resolution_note,evidence_reference,reviewed_by,reviewed_at,updated_at')
    .single();

  if (result.error) {
    console.error('[data-quality/reconciliation PATCH]', result.error);
    return NextResponse.json({ error: 'No se pudo guardar la revisión.' }, { status: 500 });
  }

  return NextResponse.json({
    review: result.data,
    sourceModified: false,
    message: 'Revisión registrada. El dato fuente no fue modificado.',
  });
}
