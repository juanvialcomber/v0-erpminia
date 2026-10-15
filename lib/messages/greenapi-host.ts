export function isAllowedGreenApiHost(hostname: string) {
  return hostname === 'api.green-api.com' ||
    hostname === 'api.greenapi.com' ||
    /^\d+\.api\.greenapi\.com$/.test(hostname);
}

export function greenApiOrigin(apiBase: string | undefined) {
  const value = apiBase?.trim();
  if (!value) throw new Error('GREENAPI_API_URL no configurada');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('GREENAPI_API_URL inválida');
  }

  if (url.protocol !== 'https:' || !isAllowedGreenApiHost(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('GREENAPI_API_URL inválida');
  }
  return url.origin;
}
