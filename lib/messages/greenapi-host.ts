export function isAllowedGreenApiHost(hostname: string) {
  return hostname === 'api.green-api.com' ||
    hostname === 'api.greenapi.com' ||
    /^\d+\.api\.greenapi\.com$/.test(hostname);
}
