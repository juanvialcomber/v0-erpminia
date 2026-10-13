import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CARPETA_ARRANQUE_DOCUMENTS,
  ensureDocumentSlots,
  formatRutDisplay,
  normalizeText,
  normalizeRutDigits,
} from '@/lib/carpeta-arranque';

export { normalizeRutDigits } from '@/lib/carpeta-arranque';

const SESSION_COOKIE_VERSION = 1;
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SUBCONTRACTOR_SESSION_COOKIE = 'subcontractor_token';

export interface SubcontractorSessionUser {
  session_id: string;
  rut: string;
  eecc_id?: string;
  eecc_name?: string;
  contacto_email?: string;
}

export interface SubcontractorSessionPayload {
  user: SubcontractorSessionUser;
  role: 'subcontratista';
  session_token: string;
  issued_at: number;
  expires_at: number;
  version: number;
}

export interface PortalEeccRecord {
  id: string;
  name: string;
  rut: string;
  representative: string;
  email: string;
  phone: string;
  is_active: boolean;
  notes: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalCarpetaDocument {
  id: string;
  slot_index: number;
  documento_nombre: string;
  file_name: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  l1_status: 'cumple' | 'no_cumple' | null;
  l1_observaciones: string | null;
  l1_reviewed_at: string | null;
  l2_status: 'cumple' | 'no_cumple' | null;
  l2_observaciones: string | null;
  l2_reviewed_at: string | null;
}

export interface PortalCarpetaRecord {
  id: string;
  empresa_nombre: string;
  empresa_rut: string | null;
  contacto_email: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at?: string | null;
  carpeta_documentos: PortalCarpetaDocument[];
}

export interface PortalSessionState {
  rut: string;
  rut_display: string;
  eecc: PortalEeccRecord | null;
  eecc_list: PortalEeccRecord[];
  carpeta: PortalCarpetaRecord | null;
  docs: PortalCarpetaDocument[];
  required_documents: string[];
  uploaded_count: number;
  total_documents: number;
  can_upload: boolean;
  warning?: string | null;
}

function getSessionSecret() {
  return (
    process.env.SUBCONTRACTOR_SESSION_SECRET ||
    process.env.AUTH_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

async function importHmacKey(secret: string) {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isSessionPayload(value: unknown): value is SubcontractorSessionPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<SubcontractorSessionPayload>;
  return (
    payload.version === SESSION_COOKIE_VERSION &&
    payload.role === 'subcontratista' &&
    typeof payload.session_token === 'string' &&
    typeof payload.issued_at === 'number' &&
    typeof payload.expires_at === 'number' &&
    !!payload.user?.session_id &&
    !!payload.user?.rut
  );
}

export function deriveSubcontractorPassword(rutValue: unknown) {
  const cleanRut = normalizeRutDigits(rutValue);
  if (!cleanRut || cleanRut.length < 2) return '';

  const body = cleanRut.slice(0, -1);
  const lastFour = body.slice(-4);
  return `lapatagua${lastFour}`;
}

export function buildSubcontractorSessionPayload(input: {
  rut: string;
  eeccId?: string;
  eeccName?: string;
  contactoEmail?: string;
  sessionId?: string;
  maxAgeSeconds?: number;
}): SubcontractorSessionPayload {
  const now = Date.now();

  return {
    user: {
      session_id: input.sessionId || crypto.randomUUID(),
      rut: normalizeRutDigits(input.rut),
      eecc_id: input.eeccId,
      eecc_name: input.eeccName,
      contacto_email: input.contactoEmail,
    },
    role: 'subcontratista',
    session_token: crypto.randomUUID(),
    issued_at: now,
    expires_at: now + (input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS) * 1000,
    version: SESSION_COOKIE_VERSION,
  };
}

export async function createSubcontractorCookieValue(payload: SubcontractorSessionPayload) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('Subcontractor session signing key is not configured');
  }

  const json = JSON.stringify(payload);
  const data = new TextEncoder().encode(json);
  const key = await importHmacKey(secret);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, data);

  return `${toBase64Url(data)}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySubcontractorCookieValue(token?: string | null) {
  if (!token) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature || token.split('.').length !== 2) return null;

  try {
    const payloadBytes = fromBase64Url(encodedPayload);
    const signatureBytes = fromBase64Url(encodedSignature);
    const key = await importHmacKey(secret);
    const valid = await globalThis.crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

    if (!valid) return null;

    const parsed = safeJsonParse<unknown>(new TextDecoder().decode(payloadBytes));
    if (!isSessionPayload(parsed)) return null;

    if (parsed.expires_at <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function findMatchingEeccRecords(
  supabase: SupabaseClient,
  rutValue: string
): Promise<PortalEeccRecord[]> {
  const targetRut = normalizeRutDigits(rutValue);
  if (!targetRut) return [];

  const { data, error } = await supabase
    .from('eecc')
    .select('id, name, rut, representative, email, phone, is_active, notes, created_by, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).filter((row) => normalizeRutDigits(row.rut) === targetRut).map((row) => ({
    id: row.id,
    name: row.name || '',
    rut: row.rut || '',
    representative: row.representative || '',
    email: row.email || '',
    phone: row.phone || '',
    is_active: row.is_active !== false,
    notes: row.notes || '',
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function loadPortalCarpetaByRut(
  supabase: SupabaseClient,
  rutValue: string
): Promise<PortalCarpetaRecord | null> {
  const targetRut = normalizeRutDigits(rutValue);
  if (!targetRut) return null;

  const { data, error } = await supabase
    .from('carpetas_arranque')
    .select(`
      id, empresa_nombre, empresa_rut, contacto_email, status, submitted_at, created_at, updated_at,
      carpeta_documentos (
        id, slot_index, documento_nombre, file_name, file_path, file_size_bytes,
        uploaded_at, l1_status, l1_observaciones, l1_reviewed_at, l2_status, l2_observaciones, l2_reviewed_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const found = (data || []).find((row) => normalizeRutDigits(row.empresa_rut) === targetRut);
  if (!found) return null;

  return {
    id: found.id,
    empresa_nombre: found.empresa_nombre || '',
    empresa_rut: found.empresa_rut || null,
    contacto_email: found.contacto_email || null,
    status: found.status || 'pendiente',
    submitted_at: found.submitted_at || null,
    created_at: found.created_at,
    updated_at: found.updated_at || null,
    carpeta_documentos: (found.carpeta_documentos || []).map((doc: any) => ({
      id: doc.id,
      slot_index: doc.slot_index,
      documento_nombre: doc.documento_nombre,
      file_name: doc.file_name || null,
      file_path: doc.file_path || null,
      file_size_bytes: doc.file_size_bytes || null,
      uploaded_at: doc.uploaded_at || null,
      l1_status: doc.l1_status || null,
      l1_observaciones: doc.l1_observaciones || null,
      l1_reviewed_at: doc.l1_reviewed_at || null,
      l2_status: doc.l2_status || null,
      l2_observaciones: doc.l2_observaciones || null,
      l2_reviewed_at: doc.l2_reviewed_at || null,
    })),
  };
}

async function createPortalCarpeta(
  supabase: SupabaseClient,
  eecc: PortalEeccRecord,
  rutValue: string
) {
  const contactEmail = normalizeText(eecc.email);
  if (!contactEmail) {
    return null;
  }

  const { data: carpeta, error } = await supabase
    .from('carpetas_arranque')
    .insert({
      empresa_nombre: normalizeText(eecc.name),
      empresa_rut: normalizeRutDigits(rutValue),
      contacto_email: contactEmail,
      created_by: eecc.created_by || null,
      status: 'pendiente',
    })
    .select('id, empresa_nombre, empresa_rut, contacto_email, status, submitted_at, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  await ensureDocumentSlots(supabase, carpeta.id);

  return {
    id: carpeta.id,
    empresa_nombre: carpeta.empresa_nombre || '',
    empresa_rut: carpeta.empresa_rut || null,
    contacto_email: carpeta.contacto_email || null,
    status: carpeta.status || 'pendiente',
    submitted_at: carpeta.submitted_at || null,
    created_at: carpeta.created_at,
    updated_at: carpeta.updated_at || null,
  } satisfies Omit<PortalCarpetaRecord, 'carpeta_documentos'>;
}

export async function ensurePortalCarpeta(
  supabase: SupabaseClient,
  eecc: PortalEeccRecord,
  rutValue: string
) {
  const targetRut = normalizeRutDigits(rutValue);
  const existing = await loadPortalCarpetaByRut(supabase, targetRut);
  if (existing) {
    const slotsResult = await ensureDocumentSlots(supabase, existing.id);
    const refreshed = await loadPortalCarpetaByRut(supabase, targetRut);
    return {
      carpeta: refreshed || existing,
      created: false,
      slotsInserted: slotsResult.inserted,
      warning: null as string | null,
    };
  }

  const created = await createPortalCarpeta(supabase, eecc, targetRut);
  if (!created) {
    return {
      carpeta: null,
      created: false,
      slotsInserted: 0,
      warning: 'La EECC no tiene correo de contacto, por eso no se pudo crear la carpeta todavia.',
    };
  }

  const refreshed = await loadPortalCarpetaByRut(supabase, targetRut);
  return {
    carpeta: refreshed || {
      ...created,
      carpeta_documentos: [],
    },
    created: true,
    slotsInserted: CARPETA_ARRANQUE_DOCUMENTS.length,
    warning: null as string | null,
  };
}

export function summarizePortalSession(
  rutValue: string,
  eeccList: PortalEeccRecord[],
  carpeta: PortalCarpetaRecord | null,
  warning?: string | null
): PortalSessionState {
  const uploadedDocs = carpeta?.carpeta_documentos?.filter((doc) => Boolean(doc.file_name)) || [];
  return {
    rut: normalizeRutDigits(rutValue),
    rut_display: formatRutDisplay(rutValue),
    eecc: eeccList.find((item) => item.is_active) || eeccList[0] || null,
    eecc_list: eeccList,
    carpeta,
    docs: carpeta?.carpeta_documentos || [],
    required_documents: CARPETA_ARRANQUE_DOCUMENTS,
    uploaded_count: uploadedDocs.length,
    total_documents: CARPETA_ARRANQUE_DOCUMENTS.length,
    can_upload: Boolean(carpeta),
    warning: warning || null,
  };
}
