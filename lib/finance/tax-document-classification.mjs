function normalizeRut(value) {
  return String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
}

function dteCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  const code = raw.match(/(?:^|\D)(33|34|46|52|56|61)(?:\D|$)/)?.[1];
  if (code) return Number(code);
  if (/factura\s+de\s+compra/.test(raw)) return 46;
  if (/factura.*(?:exenta|no afecta)/.test(raw)) return 34;
  if (/factura/.test(raw)) return 33;
  if (/gu[ií]a.*despacho/.test(raw)) return 52;
  return null;
}

/** Classify a DTE using its SII type and both XML parties; folio is not identity. */
export function classifyTaxDocument(documentType, issuerTaxId, receiverTaxId, companyTaxId) {
  const code = dteCode(documentType);
  const company = normalizeRut(companyTaxId);
  const issuer = normalizeRut(issuerTaxId);
  const receiver = normalizeRut(receiverTaxId);
  const issuerIsCompany = Boolean(company && issuer && issuer === company);
  const receiverIsCompany = Boolean(company && receiver && receiver === company);

  if (!company || (!issuerIsCompany && !receiverIsCompany) || (issuerIsCompany && receiverIsCompany)) return 'other';
  if (code === 46) {
    return issuerIsCompany ? 'purchase_invoice_issued' : 'purchase_invoice_role_conflict';
  }
  if (code === 33 || code === 34) {
    if (receiverIsCompany) return 'inbound_invoice';
    if (issuerIsCompany) return 'outbound_invoice';
    return 'other';
  }
  if (code === 52) return 'waybill';
  return 'other';
}

export function taxDocumentCounterparty(direction, issuerTaxId, receiverTaxId, companyTaxId) {
  if (direction === 'inbound_invoice' || direction === 'purchase_invoice_role_conflict') return String(issuerTaxId || '') || null;
  if (direction === 'outbound_invoice' || direction === 'purchase_invoice_issued') return String(receiverTaxId || '') || null;
  if (direction === 'waybill') {
    const company = normalizeRut(companyTaxId);
    if (normalizeRut(issuerTaxId) === company) return String(receiverTaxId || '') || null;
    if (normalizeRut(receiverTaxId) === company) return String(issuerTaxId || '') || null;
  }
  return null;
}
