export interface MerchantAdministrativeLocation {
  id: string;
  status?: string | null;
}

interface ResolveAdministrativeLocationInput<
  TLocation extends MerchantAdministrativeLocation,
> {
  locations: TLocation[];
  requestedLocationId?: string | null;
  defaultLocationId?: string | null;
}

export function resolveAdministrativeLocation<
  TLocation extends MerchantAdministrativeLocation,
>({
  locations,
  requestedLocationId,
  defaultLocationId,
}: ResolveAdministrativeLocationInput<TLocation>): TLocation | null {
  if (!locations.length) return null;

  const requested = requestedLocationId
    ? locations.find((location) => location.id === requestedLocationId)
    : null;
  if (requested) return requested;

  const membershipDefault = defaultLocationId
    ? locations.find((location) => location.id === defaultLocationId)
    : null;
  if (membershipDefault) return membershipDefault;

  return (
    locations.find((location) => location.status === 'ACTIVE') ??
    locations[0] ??
    null
  );
}
