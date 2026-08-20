import { redirect } from 'next/navigation';

export default async function MerchantFloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const params = await searchParams;
  const location = params.locationId
    ? `&locationId=${encodeURIComponent(params.locationId)}`
    : '';
  redirect(`/merchant/venue?view=map${location}`);
}
