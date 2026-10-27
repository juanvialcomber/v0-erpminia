'use client';
import { chileTodayDateKey } from '@/lib/maintenance/work-order-calendar-date.mjs';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ChevronDown, LoaderCircle, PackageSearch, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatePanel } from '@/components/ui/state-panel';
import { Textarea } from '@/components/ui/textarea';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { workshopSiteFromKnownLocation, workshopSiteFromRoleTitle } from '@/lib/maintenance/workshop-site-scope';

type Asset = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  model: string | null;
  specs?: {
    location?: string | null;
    license_plate?: string | null;
    cost_center_code?: string | null;
  } | null;
};

type Assignee = {
  id: string;
  full_name: string;
  role_title: string | null;
};

type MaterialCatalogItem = {
  productId: string;
  productCode: string | null;
  productName: string | null;
  family: string | null;
  unit: string | null;
  quantityAvailable: number;
  warehouses: string[];
};

type PlannedMaterial = MaterialCatalogItem & {
  quantityRequired: number;
};

type DrillingReview = {
  review_id: string;
  source_report_id: string;
  canonical_asset_id: string;
  asset_code: string | null;
  asset_name: string | null;
  operation_date: string | null;
  review_reason: string;
  equipment_status_raw: string | null;
  machine_observations: string | null;
  review_status: string;
  linked_work_order_id: string | null;
  has_linked_work_order: boolean;
};

type WorkOrderCreateT = Dictionary['app']['workOrderCreate'];

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

const CREATE_OT_IDEMPOTENCY_STORAGE_KEY = 'motil:maintenance:create-ot-request';

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getOrCreateRequestId(payload: unknown) {
  const fingerprint = JSON.stringify(payload);
  try {
    const stored = JSON.parse(sessionStorage.getItem(CREATE_OT_IDEMPOTENCY_STORAGE_KEY) || 'null') as
      | { requestId?: string; fingerprint?: string }
      | null;
    if (stored?.requestId && stored.fingerprint === fingerprint) return stored.requestId;

    const requestId = createRequestId();
    sessionStorage.setItem(
      CREATE_OT_IDEMPOTENCY_STORAGE_KEY,
      JSON.stringify({ requestId, fingerprint }),
    );
    return requestId;
  } catch {
    return createRequestId();
  }
}

function clearRequestId() {
  try {
    sessionStorage.removeItem(CREATE_OT_IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function CreateWorkOrder({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.workOrderCreate;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get('assetId') || '';
  const reviewId = searchParams.get('reviewId') || '';
  const emergencyMode = searchParams.get('mode') === 'emergency' || searchParams.get('workType') === 'emergency';
  const [assignedPersonId, setAssignedPersonId] = useState('');
  const [canonicalAssetId, setCanonicalAssetId] = useState(initialAssetId);
  const [assetQuery, setAssetQuery] = useState('');
  const [title, setTitle] = useState(searchParams.get('title') || '');
  const [description, setDescription] = useState(searchParams.get('description') || '');
  const [materialQuery, setMaterialQuery] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('1');
  const [plannedMaterials, setPlannedMaterials] = useState<PlannedMaterial[]>([]);
  const [workType, setWorkType] = useState(emergencyMode ? 'emergency' : (searchParams.get('workType') || 'corrective'));
  const [generalWork, setGeneralWork] = useState(!emergencyMode && searchParams.get('workType') === 'general');
  const [priority, setPriority] = useState(emergencyMode ? 'critical' : (searchParams.get('priority') || 'medium'));
  const [scheduledDate, setScheduledDate] = useState(searchParams.get('scheduledDate') || chileTodayDateKey());
  const [plannedHours, setPlannedHours] = useState(searchParams.get('plannedDurationHours') || '');
  const [meterReading, setMeterReading] = useState('');
  const [meterUnit, setMeterUnit] = useState('hours');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const fetcher = async (url: string) => {
    const response = await fetch(url, { credentials: 'include' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || t.loadDataError);
    return payload;
  };

  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/equipment', fetcher, { revalidateOnFocus: false });
  const { data: viewerContext } = useSWR('/api/maintenance/viewer-context', fetcher, { revalidateOnFocus: false });
  const workshopSite = (viewerContext?.workshopSite || null) as string | null;
  const emergencySelfAssignOnly = Boolean(viewerContext?.emergencySelfAssignOnly);
  const viewerPersonId = String(viewerContext?.personId || '');
  const viewerPersonName = String(viewerContext?.personName || '');
  const { data: assigneeData, error: assigneeError, isLoading: assigneesLoading } = useSWR('/api/maintenance/assignees', fetcher, { revalidateOnFocus: false });
  const normalizedMaterialQuery = materialQuery.trim();
  const { data: materialData, isLoading: materialsLoading } = useSWR(
    normalizedMaterialQuery.length >= 2 ? `/api/maintenance/material-catalog?q=${encodeURIComponent(normalizedMaterialQuery)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const {
    data: reviewData,
    error: reviewError,
    isLoading: reviewLoading,
  } = useSWR(reviewId ? `/api/maintenance/drilling-reviews/${reviewId}` : null, fetcher, { revalidateOnFocus: false });

  const assets = useMemo(() => (Array.isArray(data?.equipment) ? (data.equipment as Asset[]) : [])
    .filter((asset) => !workshopSite || !workshopSiteFromKnownLocation(asset.specs?.location) || workshopSiteFromKnownLocation(asset.specs?.location) === workshopSite), [data, workshopSite]);
  const assignees = useMemo(() => (Array.isArray(assigneeData?.assignees) ? (assigneeData.assignees as Assignee[]) : [])
    .filter((person) => !workshopSite || !workshopSiteFromRoleTitle(person.role_title) || workshopSiteFromRoleTitle(person.role_title) === workshopSite), [assigneeData, workshopSite]);
  const materialRows = useMemo(() => (Array.isArray(materialData?.rows) ? (materialData.rows as MaterialCatalogItem[]) : []), [materialData]);
  const selectedAsset = assets.find((asset) => asset.id === canonicalAssetId) || null;
  const filteredAssets = useMemo(() => {
    const needle = assetQuery.trim().toLowerCase();
    if (!needle) return assets.slice(0, 10);
    return assets.filter((asset) =>
      [asset.code, asset.name, asset.type, asset.model, asset.specs?.location, asset.specs?.license_plate, asset.specs?.cost_center_code]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(needle),
    ).slice(0, 10);
  }, [assetQuery, assets]);
  const review = (reviewData?.review || null) as DrillingReview | null;

  useEffect(() => {
    if (!selectedAsset || assetQuery) return;
    setAssetQuery(selectedAsset.name);
  }, [selectedAsset, assetQuery]);

  useEffect(() => {
    if (!emergencyMode || !emergencySelfAssignOnly || !viewerPersonId) return;
    setAssignedPersonId(viewerPersonId);
  }, [emergencyMode, emergencySelfAssignOnly, viewerPersonId]);

  useEffect(() => {
    if (!review) return;
    if (!canonicalAssetId && review.canonical_asset_id) setCanonicalAssetId(review.canonical_asset_id);
    if (!title.trim()) {
      setTitle(fill(t.reviewTitleTemplate, { asset: review.asset_name || review.asset_code || t.fallbackEquipment }));
    }
    if (!description.trim()) {
      setDescription([
        review.equipment_status_raw ? fill(t.reviewReportedStatus, { value: review.equipment_status_raw }) : null,
        review.machine_observations ? fill(t.reviewObservation, { value: review.machine_observations }) : null,
        review.operation_date ? fill(t.reviewReportDate, { value: review.operation_date }) : null,
      ].filter(Boolean).join('\n'));
    }
  }, [review, canonicalAssetId, title, description, t]);

  const validate = () => {
    if (!assignedPersonId) return emergencyMode ? 'No se pudo vincular tu perfil operativo a la OTe' : 'Selecciona primero al responsable de la OT';
    if (emergencyMode && !canonicalAssetId) return 'Selecciona el equipo afectado por la emergencia';
    if (!generalWork && !canonicalAssetId) return t.validation.assetRequired;
    if (review && review.canonical_asset_id !== canonicalAssetId) return t.validation.reviewAssetMismatch;
    if (!title.trim()) return t.validation.titleRequired;
    if (!scheduledDate) return t.validation.dateRequired;
    if (plannedHours && (!Number.isFinite(Number(plannedHours)) || Number(plannedHours) < 0)) return t.validation.plannedHoursInvalid;
    if (meterReading && (!Number.isFinite(Number(meterReading)) || Number(meterReading) < 0)) return t.validation.meterReadingInvalid;
    if (plannedMaterials.some((item) => !Number.isFinite(item.quantityRequired) || item.quantityRequired <= 0)) return 'Revisa las cantidades de insumos';
    return null;
  };

  const chooseAsset = (asset: Asset) => {
    setCanonicalAssetId(asset.id);
    setAssetQuery(asset.name);
  };

  const addMaterial = (item: MaterialCatalogItem) => {
    const quantity = Number(materialQuantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Ingresa una cantidad válida');
      return;
    }
    setPlannedMaterials((current) => {
      const existing = current.find((row) => row.productId === item.productId);
      if (existing) {
        return current.map((row) => row.productId === item.productId
          ? { ...row, quantityRequired: row.quantityRequired + quantity }
          : row);
      }
      return [...current, { ...item, quantityRequired: quantity }];
    });
    setMaterialQuery('');
    setMaterialQuantity('1');
  };

  const submit = async () => {
    if (submittingRef.current) return;

    const validationError = validate();
    if (validationError) return toast.error(validationError);

    const requestPayload = {
      assignedPersonId,
      canonicalAssetId: generalWork ? null : canonicalAssetId,
      reviewId: reviewId || null,
      title: title.trim(),
      description: description.trim() || null,
      materials: plannedMaterials.map((item) => ({
        canonicalProductId: item.productId,
        quantityRequired: item.quantityRequired,
      })),
      workType: emergencyMode ? 'emergency' : (generalWork ? 'general' : workType),
      priority: emergencyMode ? 'critical' : priority,
      scheduledDate,
      plannedDurationHours: plannedHours ? Number(plannedHours) : 0,
      meterReading: meterReading ? Number(meterReading) : null,
      meterUnit: meterReading ? meterUnit : null,
    };
    const creationRequestId = getOrCreateRequestId(requestPayload);

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': creationRequestId,
        },
        credentials: 'include',
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t.createError);
      clearRequestId();
      toast.success(emergencyMode ? 'OTe registrada' : (reviewId ? t.toastLinked : t.toastCreated));
      router.push(`/dashboard/mantenimiento/ordenes-trabajo/${payload.data.id}`);
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : t.createError);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>{emergencyMode ? 'Mantenimiento · Emergencia' : t.eyebrow}</PageHeaderEyebrow>
          <PageHeaderTitle>{emergencyMode ? 'Registrar OTe' : t.title}</PageHeaderTitle>
          <PageHeaderDescription>
            {workshopSite ? `Mina ${workshopSite}. ` : ''}{emergencyMode
              ? 'Registra una intervención de emergencia ya ocurrida o que debe ejecutarse de inmediato. Quedará trazada como OTe.'
              : 'Elige primero al responsable, luego busca el equipo y define el trabajo. Los insumos son opcionales.'}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild variant="outline">
            <Link href="/dashboard/mantenimiento/ordenes-trabajo"><ArrowLeft className="h-4 w-4" />{t.back}</Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {error ? (
        <StatePanel tone="error" title={t.loadEquipmentError} description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>{t.retry}</Button>} className="min-h-0 py-5" />
      ) : null}

      {reviewError ? <StatePanel tone="error" title={t.loadReviewError} description={reviewError.message} className="min-h-0 py-5" /> : null}

      {reviewId && !reviewError ? (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.reviewCard.title}</CardTitle>
            <CardDescription>{reviewLoading ? t.reviewCard.loading : t.reviewCard.description}</CardDescription>
          </CardHeader>
          {review ? (
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">{t.reviewCard.reportedAsset}</p><p className="font-medium">{review.asset_name || review.asset_code || t.noName}</p></div>
              <div><p className="text-xs text-muted-foreground">{t.reviewCard.reportDate}</p><p className="font-medium">{review.operation_date || t.noDate}</p></div>
              {review.machine_observations ? <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">{t.reviewCard.observation}</p><p className="font-medium">{review.machine_observations}</p></div> : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">1. Responsable</CardTitle>
          <CardDescription>{emergencyMode && emergencySelfAssignOnly ? 'La OTe queda asignada automáticamente a quien la registra.' : 'Primero define quién será responsable de la OT.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="assignee">{emergencyMode ? 'Responsable de la OTe' : 'Responsable de la OT'}</Label>
            {emergencyMode && emergencySelfAssignOnly ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p className="font-medium">{viewerPersonName || 'Tu usuario operativo'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Autoasignada por tratarse de una OTe creada desde un perfil de ejecución.</p>
              </div>
            ) : <Select value={assignedPersonId} onValueChange={setAssignedPersonId} disabled={assigneesLoading || Boolean(assigneeError)}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder={assigneesLoading ? 'Cargando responsables...' : 'Seleccionar responsable'} />
              </SelectTrigger>
              <SelectContent>
                {assignees.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.full_name}{person.role_title ? ` · ${person.role_title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>}
            {assigneeError && !(emergencyMode && emergencySelfAssignOnly) ? <p className="text-xs text-destructive">{assigneeError.message}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">2. Qué hay que hacer</CardTitle>
          <CardDescription>{emergencyMode ? 'Una OTe siempre debe quedar asociada al equipo afectado.' : 'Puede ser un trabajo sobre un equipo o una tarea general del taller.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!reviewId && !emergencyMode ? <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={!generalWork ? 'default' : 'outline'} onClick={() => { setGeneralWork(false); if (workType === 'general') setWorkType('corrective'); }}>En equipo</Button>
            <Button type="button" variant={generalWork ? 'default' : 'outline'} onClick={() => { setGeneralWork(true); setCanonicalAssetId(''); setAssetQuery(''); setWorkType('general'); }}>Trabajo general del taller</Button>
          </div> : null}
          {!generalWork ? <div className="space-y-2">
            <Label htmlFor="asset-search">Equipo</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="asset-search"
                value={assetQuery}
                onChange={(event) => {
                  setAssetQuery(event.target.value);
                  if (!reviewId) setCanonicalAssetId('');
                }}
                placeholder={isLoading ? t.fields.loadingAssets : 'Buscar por código, equipo, modelo o faena'}
                className="pl-9"
                disabled={isLoading || Boolean(error) || Boolean(reviewId)}
              />
            </div>
            {!reviewId && assetQuery !== (selectedAsset ? selectedAsset.name : '') ? (
              <div className="max-h-56 overflow-y-auto rounded-md border bg-card">
                {filteredAssets.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No hay equipos con ese criterio.</p>
                ) : filteredAssets.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => chooseAsset(asset)} className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50">
                    <p className="text-sm font-medium">{asset.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{asset.type}{asset.model ? ` · ${asset.model}` : ''}</p>
                  </button>
                ))}
              </div>
            ) : null}
            {selectedAsset ? (
              <p className="text-xs text-muted-foreground">
                {selectedAsset.type}{selectedAsset.model ? ` · ${selectedAsset.model}` : ''} · {t.assetStatus[selectedAsset.status as keyof typeof t.assetStatus] || selectedAsset.status}
              </p>
            ) : null}
          </div> : <div className="rounded-md border bg-muted/20 px-3 py-3 text-sm"><p className="font-medium">Trabajo general del taller</p><p className="mt-1 text-xs text-muted-foreground">No requiere asociar un equipo.</p></div>}

          <div className="space-y-2">
            <Label htmlFor="work-title">{t.fields.workTitle}</Label>
            <Input id="work-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.fields.workTitlePlaceholder} maxLength={160} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t.fields.description}</Label>
            <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.fields.descriptionPlaceholder} rows={3} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t.fields.workType}</Label>
              <Select value={workType} onValueChange={setWorkType} disabled={emergencyMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">{t.workTypes.corrective}</SelectItem>
                  <SelectItem value="preventive">{t.workTypes.preventive}</SelectItem>
                  <SelectItem value="inspection">{t.workTypes.inspection}</SelectItem>
                  <SelectItem value="predictive">{t.workTypes.predictive}</SelectItem>
                  {emergencyMode ? <SelectItem value="emergency">Emergencia</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.fields.priority}</Label>
              <Select value={priority} onValueChange={setPriority} disabled={emergencyMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t.priorities.low}</SelectItem>
                  <SelectItem value="medium">{t.priorities.medium}</SelectItem>
                  <SelectItem value="high">{t.priorities.high}</SelectItem>
                  <SelectItem value="critical">{t.priorities.critical}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <details className="group rounded-lg border bg-card" open={plannedMaterials.length > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium">
          <span className="flex items-center gap-2"><PackageSearch className="h-4 w-4" />Insumos de bodega <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t px-5 py-5">
          <p className="text-sm text-muted-foreground">Selecciona lo que debería estar disponible para ejecutar la OT. No descuenta stock todavía.</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
            <div className="space-y-2">
              <Label htmlFor="material-search">Buscar insumo</Label>
              <Input id="material-search" value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} placeholder="Código o nombre, mínimo 2 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material-qty">Cantidad</Label>
              <Input id="material-qty" type="number" min="0.01" step="0.01" value={materialQuantity} onChange={(event) => setMaterialQuantity(event.target.value)} />
            </div>
          </div>
          {normalizedMaterialQuery.length >= 2 ? (
            <div className="max-h-56 overflow-y-auto rounded-md border bg-card">
              {materialsLoading ? <p className="p-3 text-sm text-muted-foreground">Buscando insumos…</p> : materialRows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sin coincidencias.</p> : materialRows.map((item) => (
                <button key={item.productId} type="button" onClick={() => addMaterial(item)} className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.productCode || 'Sin código'} · {item.productName || 'Producto'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.warehouses.length ? item.warehouses.join(', ') : 'Sin bodega informada'}</p>
                    </div>
                    <span className={item.quantityAvailable > 0 ? 'shrink-0 text-xs text-muted-foreground' : 'shrink-0 text-xs text-destructive'}>
                      {item.quantityAvailable > 0 ? `${item.quantityAvailable} disponibles` : 'Sin stock'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {plannedMaterials.length > 0 ? (
            <div className="divide-y rounded-md border">
              {plannedMaterials.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.productCode || 'Sin código'} · {item.productName || 'Producto'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Requerido: {item.quantityRequired} {item.unit || 'unid.'} · Stock libre: {item.quantityAvailable}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar insumo" onClick={() => setPlannedMaterials((current) => current.filter((row) => row.productId !== item.productId))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">3. Cuándo</CardTitle>
          <CardDescription>{emergencyMode ? 'La OTe se registra con prioridad crítica. Fecha de intervención requerida.' : 'La OT puede crearse sin duración ni horómetro. Los insumos de bodega son opcionales.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="scheduled-date">{t.fields.scheduledDate}</Label>
            <Input id="scheduled-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium">
          Datos opcionales
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 border-t px-5 py-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="planned-hours">{t.fields.plannedHours}</Label>
            <Input id="planned-hours" type="number" min="0" step="0.5" value={plannedHours} onChange={(event) => setPlannedHours(event.target.value)} placeholder={t.fields.plannedHoursPlaceholder} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meter-reading">{t.fields.meterReading}</Label>
            <Input id="meter-reading" type="number" min="0" step="0.1" value={meterReading} onChange={(event) => setMeterReading(event.target.value)} placeholder={t.fields.meterReadingPlaceholder} />
          </div>
          <div className="space-y-2">
            <Label>{t.fields.meterUnit}</Label>
            <Select value={meterUnit} onValueChange={setMeterUnit} disabled={!meterReading}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="hours">{t.meterUnits.hours}</SelectItem><SelectItem value="km">{t.meterUnits.km}</SelectItem><SelectItem value="cycles">{t.meterUnits.cycles}</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </details>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
        <p className="hidden text-sm text-muted-foreground sm:block">{emergencyMode ? 'La OTe quedará ligada al equipo, al ejecutor y a toda la evidencia de cierre.' : 'El responsable, equipo e insumos quedan ligados a la OT desde el inicio.'}</p>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline"><Link href="/dashboard/mantenimiento/ordenes-trabajo">{t.cancel}</Link></Button>
          <Button onClick={submit} disabled={submitting || isLoading || (!emergencySelfAssignOnly && assigneesLoading) || Boolean(error) || (!emergencySelfAssignOnly && Boolean(assigneeError)) || reviewLoading || Boolean(reviewError) || Boolean(review?.linked_work_order_id)}>
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {submitting ? t.creating : emergencyMode ? 'Registrar OTe' : reviewId ? t.createAndResolve : t.create}
          </Button>
        </div>
      </div>
    </div>
  );
}
