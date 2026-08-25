export interface ControlCenterNavigationItem {
  href: string;
  label: string;
}

export function isControlCenterNavigationActive(
  pathname: string,
  href: string,
): boolean {
  const normalizedPath = normalizePath(pathname);
  const normalizedHref = normalizePath(href);

  if (normalizedHref === '/merchant' || normalizedHref === '/platform-admin') {
    return normalizedPath === normalizedHref;
  }

  return (
    normalizedPath === normalizedHref ||
    normalizedPath.startsWith(`${normalizedHref}/`)
  );
}

export function currentControlCenterLabel(
  pathname: string,
  nav: readonly ControlCenterNavigationItem[],
  fallback: string,
): string {
  const match = nav
    .filter((item) => isControlCenterNavigationActive(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0];

  return match?.label ?? fallback;
}

function normalizePath(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value;
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || '/';
}
