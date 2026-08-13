// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon, type IconName } from '@/components/control-center/icons';
import { OrganizationSwitcher } from '@/components/control-center/organization-switcher';
import { LogoutButton } from '@/components/auth/logout-button';
import type {
  AuthenticatedSession,
  AvailableOrganization,
} from '@/lib/auth/auth-types';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function ControlCenterShell({
  children,
  title,
  subtitle,
  nav,
  session,
  mode,
  organizations,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  nav: NavItem[];
  session: AuthenticatedSession;
  mode: 'platform' | 'merchant';
  organizations?: AvailableOrganization[];
}) {
  return (
    <div className="control-center">
      <aside className="cc-sidebar">
        <Link
          className="cc-brand"
          href={mode === 'platform' ? '/platform-admin' : '/merchant'}
        >
          <span className="cc-brand-mark">
            <FluxaMark className="h-9 w-9" />
          </span>
          <span>
            <strong>Fluxa</strong>
            <small>{mode === 'platform' ? 'Platform OS' : 'Venue OS'}</small>
          </span>
        </Link>

        {mode === 'merchant' &&
        session.organization &&
        organizations &&
        organizations.length > 0 ? (
          <OrganizationSwitcher
            currentOrganizationId={session.organization.id}
            organizations={organizations}
          />
        ) : (
          <div className="platform-pill">
            <Icon className="h-4 w-4" name="sparkles" />
            Platform control
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="cc-nav">
            <p>Control center</p>
            {nav.map((item) => (
              <Link href={item.href} key={item.href}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="cc-sidebar-footer">
          <div className="cc-avatar">
            {session.user.displayName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate">
              {session.user.displayName}
            </strong>
            <span className="block truncate">{session.user.email}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="cc-stage">
        <header className="cc-topbar">
          <div>
            <p className="eyebrow">{subtitle}</p>
            <h1>{title}</h1>
          </div>
          <div className="cc-live-pill">
            <span />
            sistemi operativi
          </div>
        </header>
        <main className="cc-content">{children}</main>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: IconName;
  accent?: 'blue' | 'violet' | 'cyan' | 'rose';
}) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-icon">
        <Icon name={icon} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit">
        <Icon name="sparkles" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
