// PHASE_8_TRUE_CONTROL_CENTER
import { EventForm } from '@/components/merchant/event-form';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { LocationSummary } from '@/lib/control-center/types';

export default async function NewEventPage() {
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');

  return <EventForm locations={locations} />;
}
