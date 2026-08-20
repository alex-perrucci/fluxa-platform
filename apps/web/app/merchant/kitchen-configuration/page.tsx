import { redirect } from 'next/navigation';

export default function KitchenConfigurationPage() {
  redirect('/merchant/operations?view=printing');
}
