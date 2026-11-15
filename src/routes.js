export function appHref(path, baseUrl = '/') {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const suffix = String(path).replace(/^\/+/, '');
  return suffix ? `${base}${suffix}` : base;
}

export function stripBasePath(pathname, baseUrl = '/') {
  const base = appHref('', baseUrl);
  const prefix = base === '/' ? '' : base.slice(0, -1);

  if (!prefix) return pathname;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}