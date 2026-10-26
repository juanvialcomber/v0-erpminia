export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { deriveMachinesFromCostCenters, inferMachineFamilyFromText } from '@/lib/maintenance/cost-center-machines';
import {
  cleanCategoricalEvidence,
  inferChileanPlateFromName,
  inferManufacturerFromName,
  isRoadVehicleIdentity,
  normalizeAssetIdentity,
  normalizeCriticalityEvidence,
  normalizeLocationEvidence,
} from '@/lib/maintenance/asset-identity-evidence';
import { resolveEvidenceField } from '@/lib/maintenance/evidence-field-resolution';
import {
  buildRuntimeCostIntelligence,
  countMaterialMeterDecreases,
  dedupeMeterReadings,
  resolvePlanningCurrentMeter,
  resolvePreventiveMeterSnapshot,
} from '@/lib/maintenance/meter-evidence-resolution';
import {
  buildPurchaseHistorySummary,
  dedupePurchaseLines,
  resolveExactCostCenter,
  resolvePurchaseExactCostCenter,
  resolvePurchaseHistoryMatchBasis,
  selectPurchaseHistoryRows,
} from '@/lib/maintenance/purchase-history-resolution';
import { queryAsset360Sources } from '@/lib/maintenance/asset-360-data-sources';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const { data: asset, error: assetError } = await context.supabase
      .from('maintenance_canonical_assets_v1')
      .select('id,asset_code,name,asset_type,category,manufacturer,model,serial_number,license_plate,cost_center_code,is_active,validation_status,source_file,source_sheet,source_row,imported_at,updated_at,source_payload')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

    const { data: canonicalCurrent, error: canonicalCurrentError } = await context.supabase
      .from('canonical_assets_current')
      .select('asset_type,location,operational_status,manufacturer,model,serial_number,criticality,mtbf_hours,acquisition_date,acquisition_cost,expected_lifespan_years,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .maybeSingle();
    if (canonicalCurrentError) throw canonicalCurrentError;

    const sourcePayload =
      asset.source_payload && typeof asset.source_payload === 'object'
        ? (asset.source_payload as Record<string, unknown>)
        : {};

    const purchaseSelect =
      'id,order_number,line_number,product_code,description,quantity,unit,unit_cost,net_amount,cost_center_code,asset_reference,supplier_name,order_date,status';

    const normalizedAsset = {
      id: asset.id,
      asset_code: asset.asset_code,
      name: asset.name,
      asset_type: asset.asset_type || canonicalCurrent?.asset_type || null,
      category: asset.category,
      manufacturer: asset.manufacturer || sourcePayload.manufacturer || canonicalCurrent?.manufacturer || null,
      model: asset.model || sourcePayload.model || canonicalCurrent?.model || null,
      serial_number: asset.serial_number || sourcePayload.serial_number || canonicalCurrent?.serial_number || null,
      license_plate: asset.license_plate,
      cost_center_code: asset.cost_center_code,
      location: sourcePayload.location || sourcePayload.mine || canonicalCurrent?.location || null,
      criticality: sourcePayload.criticality || sourcePayload.criticality_raw || canonicalCurrent?.criticality || null,
      operational_status: sourcePayload.status || sourcePayload.operational_status || canonicalCurrent?.operational_status || null,
      meter_unit: sourcePayload.meter_unit || null,
      mobility_class: sourcePayload.mobility_class || null,
      lifecycle_state: sourcePayload.lifecycle_state || null,
      lifecycle_reason: sourcePayload.lifecycle_reason || null,
      acquisition_date: sourcePayload.acquisition_date || canonicalCurrent?.acquisition_date || null,
      acquisition_cost: sourcePayload.acquisition_cost ?? canonicalCurrent?.acquisition_cost ?? null,
      expected_lifespan_years: sourcePayload.expected_lifespan_years ?? canonicalCurrent?.expected_lifespan_years ?? null,
      baseline_mtbf_hours: sourcePayload.mtbf_hours ?? canonicalCurrent?.mtbf_hours ?? null,
      source_file: asset.source_file,
      source_sheet: asset.source_sheet,
      source_row: asset.source_row,
      imported_at: asset.imported_at,
      updated_at: asset.updated_at,
      is_active: asset.is_active,
      validation_status: asset.validation_status,
    };

    const { ordersResult, closeResult, preventiveResult, runtimeResult, reliabilityResult, runtimeReliabilityResult, snapshotsResult, partsResult, laborResult, eventsResult, statusHistoryResult, planningResult, operationalStateResult, operatingSpineResult, supplyChainResult, procurementOrdersResult, costCenterPurchaseHistoryResult, namePurchaseHistoryResult, economicHistoryResult, drillingHistoryResult, drillEconomicsResult, drillingReviewResult, maintenancePriorityResult, financeReconciliationResult, runtimeCostResult, meterHistoryResult, drillEvidenceResult, drillEconomicsChangeResult, taskCandidatesResult, standardPlanResult, identityHistoryResult, exactCostCenterDetailResult, costCenterMatchResult, sourceErrors } = await queryAsset360Sources(context, id, asset, purchaseSelect);

    const closeRows = closeResult.data || [];
    const preventives = [...(preventiveResult.data || [])].sort((a: any, b: any) => {
      if (Boolean(a.alert_due) !== Boolean(b.alert_due)) return a.alert_due ? -1 : 1;
      const ar = a.remaining_hours == null ? Number.POSITIVE_INFINITY : Number(a.remaining_hours);
      const br = b.remaining_hours == null ? Number.POSITIVE_INFINITY : Number(b.remaining_hours);
      return ar - br;
    });

    const snapshotRows = snapshotsResult.data || [];
    const latestSnapshots = Array.from(snapshotRows.reduce((map: Map<string, any>, row: any) => {
      const current = map.get(row.work_order_id);
      if (!current || Number(row.closure_sequence || 0) > Number(current.closure_sequence || 0)) map.set(row.work_order_id, row);
      return map;
    }, new Map()).values()).sort((a: any, b: any) => new Date(b.closed_at || 0).getTime() - new Date(a.closed_at || 0).getTime());

    const workOrderIds = Array.from(new Set([
      ...latestSnapshots.map((row: any) => row.work_order_id),
      ...(partsResult.data || []).map((row: any) => row.work_order_id),
    ].filter(Boolean)));
    const workOrderResult = workOrderIds.length
      ? await context.supabase
          .from('maintenance_work_orders')
          .select('id,work_order_number,title,status,priority,work_type,scheduled_date,start_date,completion_date,root_cause,preventive_actions,actual_duration_hours')
          .eq('organization_id', context.organizationId)
          .in('id', workOrderIds)
      : { data: [], error: null };
    if (workOrderResult.error) throw workOrderResult.error;
    const workOrdersById = new Map((workOrderResult.data || []).map((row: any) => [row.id, row]));

    const productIds = Array.from(new Set((partsResult.data || []).map((row: any) => row.canonical_product_id).filter(Boolean)));
    const productResult = productIds.length
      ? await context.supabase
          .from('canonical_products_v1')
          .select('id,product_code,name,unit')
          .eq('organization_id', context.organizationId)
          .in('id', productIds)
      : { data: [], error: null };
    if (productResult.error) throw productResult.error;
    const productsById = new Map((productResult.data || []).map((row: any) => [row.id, row]));

    const supplierIds = Array.from(
      new Set((procurementOrdersResult.data || []).map((row: any) => row.supplier_id).filter(Boolean)),
    );
    const [supplierResult, supplierScoreResult] = supplierIds.length
      ? await Promise.all([
          context.supabase
            .from('canonical_suppliers_v1')
            .select('id,legal_name,trade_name,payment_terms,email,phone')
            .eq('organization_id', context.organizationId)
            .in('id', supplierIds),
          context.supabase
            .from('supplier_operational_score_v2')
            .select('supplier_id,supplier_name,total_orders,completed_orders,on_time_orders,last_delivery_date,receipt_count,quantity_received,quantity_accepted,quantity_rejected,returns_count,delivery_score,quality_score,invoice_score,operational_score,evidence_dimensions')
            .eq('organization_id', context.organizationId)
            .in('supplier_id', supplierIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (supplierResult.error) throw supplierResult.error;
    if (supplierScoreResult.error) throw supplierScoreResult.error;
    const suppliersById = new Map((supplierResult.data || []).map((row: any) => [row.id, row]));
    const supplierScoresById = new Map((supplierScoreResult.data || []).map((row: any) => [row.supplier_id, row]));
    const procurementOrders = (procurementOrdersResult.data || []).map((row: any) => ({
      ...row,
      supplier: suppliersById.get(row.supplier_id) || null,
      supplierScore: supplierScoresById.get(row.supplier_id) || null,
    }));

    const parts = (partsResult.data || []).map((row: any) => ({
      ...row,
      product: productsById.get(row.canonical_product_id) || null,
      workOrder: workOrdersById.get(row.work_order_id) || null,
    }));
    const installedParts = parts.filter((row: any) => Number(row.quantity_installed || 0) > 0);
    const pendingParts = parts.filter((row: any) => Math.max(Number(row.quantity_requested || 0) - Number(row.quantity_installed || 0) - Number(row.quantity_returned || 0), 0) > 0);

    const auditedInterventions = latestSnapshots.map((row: any) => ({
      ...row,
      workOrder: workOrdersById.get(row.work_order_id) || null,
    }));

    const normalizedAssetIdentity = normalizeAssetIdentity(asset.name);
    const derivedCostCenterMachines = deriveMachinesFromCostCenters(
      (costCenterMatchResult.data || []).map((center: any) => ({
        id: String(center.id),
        code: String(center.code || ''),
        name: String(center.name || ''),
        description: center.description || null,
        status: center.status || null,
      }))
    );
    const hasExplicitCostCenter = Boolean(asset.cost_center_code);
    const { exactCostCenter } = resolveExactCostCenter({
      machines: derivedCostCenterMachines,
      normalizedIdentity: normalizedAssetIdentity,
      hasExplicitCostCenter,
    });

    const { purchaseExactCostCenter } = resolvePurchaseExactCostCenter({
      namePurchaseRows: namePurchaseHistoryResult.data || [],
      normalizedIdentity: normalizedAssetIdentity,
      hasExplicitCostCenter,
      exactCostCenterCode: exactCostCenter?.code || null,
    });

    const derivedCostCenterPurchaseHistoryResult =
      !asset.cost_center_code && exactCostCenter?.code
        ? await context.supabase
            .from('canonical_purchase_order_lines_current')
            .select(purchaseSelect)
            .eq('organization_id', context.organizationId)
            .ilike('cost_center_code', `${exactCostCenter.code} %`)
            .order('order_date', { ascending: false, nullsFirst: false })
            .limit(100)
        : { data: [], error: null };
    const purchaseExactCostCenterHistoryResult =
      !asset.cost_center_code && !exactCostCenter?.code && purchaseExactCostCenter?.code
        ? await context.supabase
            .from('canonical_purchase_order_lines_current')
            .select(purchaseSelect)
            .eq('organization_id', context.organizationId)
            .ilike('cost_center_code', `${purchaseExactCostCenter.code} %`)
            .order('order_date', { ascending: false, nullsFirst: false })
            .limit(100)
        : { data: [], error: null };

    if (derivedCostCenterPurchaseHistoryResult.error || purchaseExactCostCenterHistoryResult.error) {
      console.warn('[asset-360] derived cost center purchase history unavailable', {
        assetId: id,
        costCenterCode: exactCostCenter?.code || purchaseExactCostCenter?.code || null,
        error: derivedCostCenterPurchaseHistoryResult.error || purchaseExactCostCenterHistoryResult.error,
      });
    }

    const purchaseHistoryMatchBasis = resolvePurchaseHistoryMatchBasis({
      hasExplicitCostCenter,
      exactCostCenterCode: exactCostCenter?.code || null,
      purchaseExactCostCenterCode: purchaseExactCostCenter?.code || null,
    });
    const purchaseHistoryRows = selectPurchaseHistoryRows({
      matchBasis: purchaseHistoryMatchBasis,
      explicitRows: costCenterPurchaseHistoryResult.data || [],
      derivedRows: derivedCostCenterPurchaseHistoryResult.data || [],
      derivedError: derivedCostCenterPurchaseHistoryResult.error || null,
      purchaseRows: purchaseExactCostCenterHistoryResult.data || [],
      purchaseError: purchaseExactCostCenterHistoryResult.error || null,
      nameRows: namePurchaseHistoryResult.data || [],
    });
    const { history: costCenterPurchaseHistory } = dedupePurchaseLines(purchaseHistoryRows);
    const purchaseHistorySummary = {
      matchBasis: purchaseHistoryMatchBasis,
      ...buildPurchaseHistorySummary(costCenterPurchaseHistory),
    };

    const locationCandidates = [
      ...(planningResult.data || []).map((row: any) => row.mine_raw),
      ...(drillingHistoryResult.data || []).map((row: any) => row.site_raw),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const normalizedLocations = new Map<string, string>();
    for (const candidate of locationCandidates) {
      const normalized = normalizeLocationEvidence(candidate);
      if (!normalized || normalized === 'NO REGISTRADO' || normalized === '#ERROR!') continue;
      if (!normalizedLocations.has(normalized)) normalizedLocations.set(normalized, candidate);
    }
    const evidenceLocation =
      normalizedLocations.size === 1
        ? [...normalizedLocations.values()][0]
        : null;

    const planningCriticalities = new Map<string, string>();
    for (const row of planningResult.data || []) {
      const raw = String(row.criticality_raw || '').trim();
      if (!raw || ['#ERROR!', 'N/A', 'NO REGISTRADO'].includes(raw.toUpperCase())) continue;
      const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      if (!planningCriticalities.has(normalized)) planningCriticalities.set(normalized, raw);
    }
    const evidenceCriticality =
      planningCriticalities.size === 1
        ? [...planningCriticalities.values()][0]
        : null;

    const planningMeterUnits = Array.from(
      new Set<string>(
        (planningResult.data || [])
          .map((row: any): string => String(row.meter_unit || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const planningMeterUnit = planningMeterUnits.length === 1 ? planningMeterUnits[0] : null;

    const planningEvidenceAt = (planningResult.data || [])
      .map((row: any) => row.updated_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;
    const drillingLocationEvidenceAt = (drillingHistoryResult.data || [])
      .map((row: any) => row.operation_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    const operationalLocation = normalizeLocationEvidence(operationalStateResult.data?.location)
      ? String(operationalStateResult.data?.location || '').trim()
      : null;
    const payloadLocation = normalizeLocationEvidence(normalizedAsset.location)
      ? String(normalizedAsset.location || '').trim()
      : null;
    const operationalCriticality = cleanCategoricalEvidence(operationalStateResult.data?.criticality);
    const payloadCriticality = cleanCategoricalEvidence(normalizedAsset.criticality);
    const operationalStatus = cleanCategoricalEvidence(operationalStateResult.data?.operational_status);
    const latestStatusEvent = (statusHistoryResult.data || [])[0] || null;
    const eventStatus = cleanCategoricalEvidence(latestStatusEvent?.new_state);
    const payloadStatus = cleanCategoricalEvidence(
      sourcePayload.status || sourcePayload.operational_status,
    );
    const canonicalStatus = cleanCategoricalEvidence(canonicalCurrent?.operational_status);
    const resolvedOperationalStatus = operationalStatus || eventStatus || payloadStatus || canonicalStatus || null;
    const statusEventMatchesResolved =
      eventStatus &&
      resolvedOperationalStatus &&
      String(eventStatus).trim().toLowerCase() === String(resolvedOperationalStatus).trim().toLowerCase();
    const referenceFamily =
      normalizedAsset.asset_type || normalizedAsset.category
        ? null
        : exactCostCenter?.family || inferMachineFamilyFromText(String(normalizedAsset.name || ''));
    const referenceManufacturer =
      normalizedAsset.manufacturer ? null : inferManufacturerFromName(normalizedAsset.name);
    const inferredLicensePlate =
      normalizedAsset.license_plate ||
      !isRoadVehicleIdentity(
        normalizedAsset.asset_type,
        normalizedAsset.category,
        referenceFamily,
        normalizedAsset.name,
      )
        ? null
        : inferChileanPlateFromName(normalizedAsset.name);

    const assetRecordAt = normalizedAsset.updated_at || normalizedAsset.imported_at || null;
    const latestLocationEvidenceAt = [planningEvidenceAt, drillingLocationEvidenceAt].filter(Boolean).sort().reverse()[0] || null;
    const locationResolution = resolveEvidenceField([
      {
        value: operationalLocation,
        source: 'asset_operational_state_v1',
        at:
          evidenceLocation &&
          normalizeLocationEvidence(operationalLocation) === normalizeLocationEvidence(evidenceLocation)
            ? latestLocationEvidenceAt
            : null,
      },
      { value: payloadLocation, source: 'maintenance_canonical_assets_v1', at: assetRecordAt },
      { value: evidenceLocation, source: 'planning_or_production_evidence', at: latestLocationEvidenceAt },
    ]);
    const criticalityResolution = resolveEvidenceField([
      {
        value: operationalCriticality,
        source: 'asset_operational_state_v1',
        at:
          evidenceCriticality &&
          normalizeCriticalityEvidence(operationalCriticality) === normalizeCriticalityEvidence(evidenceCriticality)
            ? planningEvidenceAt
            : null,
      },
      { value: payloadCriticality, source: 'maintenance_canonical_assets_v1', at: assetRecordAt },
      { value: evidenceCriticality, source: 'planning_maintenance_source_rows', at: planningEvidenceAt },
    ]);
    const statusSourceResolution = resolveEvidenceField([
      {
        value: statusEventMatchesResolved ? eventStatus : null,
        source: 'maintenance_asset_status_history',
        at: latestStatusEvent?.changed_at || null,
      },
      { value: operationalStatus, source: 'asset_operational_state_v1' },
      { value: payloadStatus, source: 'maintenance_canonical_assets_v1', at: assetRecordAt },
      { value: canonicalStatus, source: 'canonical_assets_current', at: canonicalCurrent?.updated_at || null },
    ]);

    const resolvedAsset = {
      ...normalizedAsset,
      meter_unit: normalizedAsset.meter_unit || planningMeterUnit || null,
      cost_center_code:
        normalizedAsset.cost_center_code ||
        exactCostCenter?.code ||
        purchaseExactCostCenter?.code ||
        null,
      cost_center_name:
        exactCostCenterDetailResult.data?.name ||
        exactCostCenter?.name ||
        purchaseExactCostCenter?.description ||
        null,
      cost_center_evidence_source:
        normalizedAsset.cost_center_code
          ? 'maintenance_canonical_assets_v1'
          : exactCostCenter?.code
            ? 'cost_centers_exact_identity'
            : purchaseExactCostCenter?.code
              ? 'purchase_history_exact_identity'
              : null,
      location: locationResolution.value,
      location_evidence_source: locationResolution.source,
      location_evidence_at: locationResolution.at,
      criticality: criticalityResolution.value,
      criticality_evidence_source: criticalityResolution.source,
      criticality_evidence_at: criticalityResolution.at,
      operational_status: resolvedOperationalStatus,
      operational_status_evidence_source: statusSourceResolution.source,
      operational_status_evidence_at: statusSourceResolution.at,
      operational_status_reason:
        statusEventMatchesResolved ? latestStatusEvent?.reason || null : null,
      reference_manufacturer: referenceManufacturer || null,
      reference_manufacturer_evidence_source:
        referenceManufacturer ? 'deterministic_name_brand' : null,
      reference_manufacturer_evidence_at:
        referenceManufacturer ? normalizedAsset.updated_at || normalizedAsset.imported_at || null : null,
      reference_family: referenceFamily || null,
      reference_family_evidence_source:
        referenceFamily
          ? exactCostCenter?.family
            ? 'cost_center_family'
            : 'deterministic_name_classifier'
          : null,
      reference_family_evidence_at:
        referenceFamily ? normalizedAsset.updated_at || normalizedAsset.imported_at || null : null,
      license_plate: normalizedAsset.license_plate || inferredLicensePlate || null,
      license_plate_evidence_source:
        normalizedAsset.license_plate
          ? 'maintenance_canonical_assets_v1'
          : inferredLicensePlate
            ? 'deterministic_name_plate'
            : null,
      license_plate_evidence_at:
        normalizedAsset.license_plate || inferredLicensePlate
          ? normalizedAsset.updated_at || normalizedAsset.imported_at || null
          : null,
    };

    const { history: planningMeterHistory, duplicateRowsIgnored: duplicatePlanningMeterRows } = dedupeMeterReadings(
      meterHistoryResult.data || [],
      id,
    );
    const materialMeterDecreaseCount = countMaterialMeterDecreases(planningMeterHistory);
    const latestPlanningMeter = planningMeterHistory[0] || null;
    const preventiveMeterSnapshot = resolvePreventiveMeterSnapshot(preventives);
    const { meter: planningCurrentMeter, evidence: planningCurrentEvidence } = resolvePlanningCurrentMeter(
      planningResult.data || [],
    );
    const resolvedRuntimeCostIntelligence = buildRuntimeCostIntelligence({
      base: runtimeCostResult.data || null,
      planningMeterHistory,
      latestPlanningMeter,
      planningCurrentMeter,
      planningCurrentEvidence,
      preventiveMeterSnapshot,
      preventives,
      normalizedMeterUnit: normalizedAsset.meter_unit == null ? null : String(normalizedAsset.meter_unit),
      planningMeterUnit,
      duplicateRowsIgnored: duplicatePlanningMeterRows,
      materialMeterDecreases: materialMeterDecreaseCount,
    });

    const [{ data: insuranceEvidence, error: insuranceEvidenceError }, { data: depreciationEvidence, error: depreciationEvidenceError }] = await Promise.all([
      context.supabase
        .from('motil_finance_asset_stage')
        .select('import_id,insured_uf,identity_status,identity_basis,source_sheet,source_row')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .not('insured_uf', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('motil_finance_asset_stage')
        .select('import_id,net_book_value,updated_asset,total_accum_depr,depreciation_current,remaining_life_months,cost_center_raw,source_sheet,source_row,source_payload')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .not('net_book_value', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (insuranceEvidenceError) console.warn('[asset-360] insurance finance evidence unavailable', { assetId: id, error: insuranceEvidenceError });
    if (depreciationEvidenceError) console.warn('[asset-360] depreciation finance evidence unavailable', { assetId: id, error: depreciationEvidenceError });

    const financeImportIds = Array.from(new Set([
      insuranceEvidence?.import_id,
      depreciationEvidence?.import_id,
    ].filter(Boolean)));
    const financeImportsResult = financeImportIds.length
      ? await context.supabase
          .from('motil_finance_workbook_imports')
          .select('id,filename,source_cutoff_date,review_status,metadata')
          .eq('organization_id', context.organizationId)
          .in('id', financeImportIds)
      : { data: [], error: null };
    if (financeImportsResult.error) console.warn('[asset-360] finance workbook authority unavailable', { assetId: id, error: financeImportsResult.error });

    const financeImportsById = new Map((financeImportsResult.data || []).map((row: any) => [row.id, row]));
    const insuranceImport = insuranceEvidence?.import_id ? financeImportsById.get(insuranceEvidence.import_id) : null;
    const depreciationImport = depreciationEvidence?.import_id ? financeImportsById.get(depreciationEvidence.import_id) : null;
    const insuranceMetadata = insuranceImport?.metadata && typeof insuranceImport.metadata === 'object'
      ? insuranceImport.metadata as Record<string, unknown>
      : {};
    const depreciationMetadata = depreciationImport?.metadata && typeof depreciationImport.metadata === 'object'
      ? depreciationImport.metadata as Record<string, unknown>
      : {};

    const financeProfile = {
      insurance: insuranceEvidence ? {
        insured_uf: insuranceEvidence.insured_uf,
        identity_status: insuranceEvidence.identity_status,
        identity_basis: insuranceEvidence.identity_basis,
        source_sheet: insuranceEvidence.source_sheet,
        source_row: insuranceEvidence.source_row,
        source_file: insuranceImport?.filename || null,
        source_cutoff_date: insuranceImport?.source_cutoff_date || null,
        canonical: insuranceMetadata.canonical === true,
        authority: typeof insuranceMetadata.canonical_authority === 'string' ? insuranceMetadata.canonical_authority : null,
      } : null,
      depreciation: depreciationEvidence ? {
        net_book_value: depreciationEvidence.net_book_value,
        updated_asset: depreciationEvidence.updated_asset,
        total_accum_depr: depreciationEvidence.total_accum_depr,
        depreciation_current: depreciationEvidence.depreciation_current,
        remaining_life_months: depreciationEvidence.remaining_life_months,
        cost_center_raw: depreciationEvidence.cost_center_raw,
        source_sheet: depreciationEvidence.source_sheet,
        source_row: depreciationEvidence.source_row,
        source_file: depreciationImport?.filename || null,
        source_cutoff_date: depreciationImport?.source_cutoff_date || null,
        canonical: depreciationMetadata.canonical === true,
        authority: typeof depreciationMetadata.canonical_authority === 'string' ? depreciationMetadata.canonical_authority : null,
        review_flags: Array.isArray((depreciationEvidence.source_payload as Record<string, unknown> | null)?.review_flags)
          ? (depreciationEvidence.source_payload as Record<string, unknown>).review_flags
          : [],
      } : null,
      depreciation_identity_pending: Boolean(insuranceEvidence && !depreciationEvidence),
    };

    const summary = {
      activeWorkOrders: (ordersResult.data || []).length,
      criticalOpen: (ordersResult.data || []).filter((row: any) => String(row.priority || '').toLowerCase() === 'critical').length,
      operationalBlockers: closeRows.filter((row: any) => Number(row.open_procurement_orders || 0) > 0 || Number(row.pending_parts || 0) > 0 || Number(row.unmet_material_requirements || 0) > 0 || Number(row.pending_external_services || 0) > 0 || Number(row.open_labor_entries || 0) > 0).length,
      readyToClose: closeRows.filter((row: any) => Boolean(row.ready_to_close)).length,
      pendingPlanSteps: closeRows.reduce((sum: number, row: any) => sum + Number(row.standard_plan_steps_pending || 0), 0),
      overduePreventives: preventives.filter((row: any) => Boolean(row.alert_due)).length,
      installedPartLines: installedParts.length,
      pendingPartLines: pendingParts.length,
      auditedInterventions: auditedInterventions.length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      asset: resolvedAsset,
      summary,
      workOrders: ordersResult.data || [],
      closeReadiness: closeRows,
      preventives,
      nextPreventive: preventives[0] || null,
      runtime: runtimeResult.data || null,
      reliability: reliabilityResult.data || null,
      runtimeReliability: runtimeReliabilityResult.data || null,
      auditedInterventions,
      installedParts,
      pendingParts,
      laborEntries: laborResult.data || [],
      recentEvents: eventsResult.data || [],
      statusHistory: statusHistoryResult.data || [],
      maintenancePlanning: planningResult.data || [],
      operationalState: operationalStateResult.data || null,
      operatingSpine: operatingSpineResult.data || null,
      supplyChain: supplyChainResult.data || [],
      procurementOrders,
      costCenterPurchaseHistory,
      purchaseHistorySummary,
      economicHistory: economicHistoryResult.data || [],
      drillingHistory: drillingHistoryResult.data || [],
      drillEconomics: drillEconomicsResult.data || null,
      drillingMaintenanceReview: drillingReviewResult.data || [],
      maintenancePriority: maintenancePriorityResult.data || null,
      financeReconciliation: financeReconciliationResult.data || null,
      financeProfile,
      runtimeCostIntelligence: resolvedRuntimeCostIntelligence,
      meterHistory: planningMeterHistory,
      drillOperationalEvidence: drillEvidenceResult.data || null,
      drillEconomicsChange: drillEconomicsChangeResult.data || null,
      maintenanceTaskCandidates: taskCandidatesResult.data || [],
      standardJobPlans: standardPlanResult.data || [],
      identityHistory: identityHistoryResult.data || [],
      canEdit: access.canWrite,
      unavailableSources: sourceErrors.map((item) => item.source),
      evidence: {
        mtbf: 'Sólo desde intervalos correctivos auditados con horómetro válido.',
        mttr: 'Sólo desde horas reales de correctivos auditados.',
        cost: 'Sólo desde el último snapshot auditado de cada cierre de OT.',
        parts: 'Cantidades observadas en work_order_parts; no se infiere stock disponible.',
        labor: 'Personas y horas registradas en work_order_labor_entries, vinculadas a la OT y al activo.',
      },
    });
  } catch (error) {
    console.error('[asset-360] operational-360 failed', {
      assetId: id,
      message: error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'unknown',
      code: (error as { code?: string } | null)?.code || null,
      details: (error as { details?: string } | null)?.details || null,
      hint: (error as { hint?: string } | null)?.hint || null,
    });
    return NextResponse.json({ error: 'No se pudo cargar la Ficha 360 operacional' }, { status: 500 });
  }
}
