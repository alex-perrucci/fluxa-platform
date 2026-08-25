'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/control-center/icons';
import {
  currentControlCenterLabel,
  isControlCenterNavigationActive,
} from '@/lib/control-center/navigation-state';

export interface ControlCenterNavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function ControlCenterNavigation({
  nav,
  label,
}: {
  nav: readonly ControlCenterNavItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="cc-nav" style={{ minWidth: 0, scrollbarWidth: 'none' }}>
      <p>{label}</p>
      {nav.map((item) => {
        const active = isControlCenterNavigationActive(pathname, item.href);
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            data-active={active ? 'true' : 'false'}
            href={item.href}
            key={item.href}
          >
            <Icon name={item.icon} />
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function ControlCenterPageTitle({
  fallback,
  nav,
  dynamic,
}: {
  fallback: string;
  nav: readonly ControlCenterNavItem[];
  dynamic: boolean;
}) {
  const pathname = usePathname();
  const title = dynamic
    ? currentControlCenterLabel(pathname, nav, fallback)
    : fallback;

  return <h1>{title}</h1>;
}
