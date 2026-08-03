'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DashboardLocationSelectorProps {
  cookieName: string;
  locations: Array<{ id: string; name: string; city: string }>;
  selected: string;
}

export function DashboardLocationSelector({
  cookieName,
  locations,
  selected,
}: DashboardLocationSelectorProps) {
  const router = useRouter();
  const [value, setValue] = useState(selected);

  function apply(nextValue: string) {
    setValue(nextValue);
    document.cookie = `${cookieName}=${encodeURIComponent(nextValue)}; Path=/merchant; Max-Age=31536000; SameSite=Lax`;
    const query = nextValue === 'all' ? '' : `?locationId=${nextValue}`;
    router.push(`/merchant${query}`);
  }

  return (
    <label className="dashboard-location-selector">
      <span>Ambito dashboard</span>
      <select
        aria-label="Sede della dashboard"
        onChange={(event) => apply(event.target.value)}
        value={value}
      >
        <option value="all">Tutte le sedi</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name} · {location.city}
          </option>
        ))}
      </select>
    </label>
  );
}
