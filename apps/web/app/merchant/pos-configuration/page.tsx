import { redirect } from 'next/navigation';

export default function PosConfigurationPage() {
  redirect('/merchant/operations?view=devices');
}
