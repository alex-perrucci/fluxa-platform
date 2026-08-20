import { redirect } from 'next/navigation';

export default async function MerchantLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const params = await searchParams;
  const suffix = params.locationId
    ? `?locationId=${encodeURIComponent(params.locationId)}`
    : '';
  redirect(`/merchant/venue${suffix}`);
}
