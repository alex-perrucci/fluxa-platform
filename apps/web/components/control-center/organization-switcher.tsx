// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailableOrganization } from '@/lib/auth/auth-types';

export function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: AvailableOrganization[];
  currentOrganizationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function changeOrganization(organizationId: string) {
    if (!organizationId || organizationId === currentOrganizationId) return;
    setPending(true);

    try {
      const response = await fetch('/api/auth/switch-organization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (!response.ok) throw new Error('Cambio organizzazione non riuscito.');
      router.replace('/merchant');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="org-switcher">
      <span>Workspace</span>
      <select
        aria-label="Cambia organizzazione"
        disabled={pending}
        onChange={(event) => void changeOrganization(event.target.value)}
        value={currentOrganizationId}
      >
        {organizations.map((organization) => (
          <option
            key={organization.organizationId}
            value={organization.organizationId}
          >
            {organization.organizationName}
          </option>
        ))}
      </select>
    </label>
  );
}
