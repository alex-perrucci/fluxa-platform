// PHASE_8_TRUE_CONTROL_CENTER
import { EventForm } from '@/components/merchant/event-form';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { EventDetail, LocationSummary } from '@/lib/control-center/types';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, locations] = await Promise.all([
    authenticatedFluxaFetch<EventDetail>(`/events/${eventId}`),
    authenticatedFluxaFetch<LocationSummary[]>('/locations'),
  ]);

  return <EventForm event={event} locations={locations} />;
}
