import { Card } from '@/components/ui/card';
import { requireMerchantSession } from '@/lib/auth/session';

export default async function MerchantDashboardPage() {
  const session = await requireMerchantSession();

  return (
    <main className="shell py-10">
      <h1 className="text-3xl font-semibold">
        Benvenuto, {session.user.displayName}
      </h1>
      <p className="muted mt-2">
        Lo scaffold è collegato all’autenticazione Fluxa. Eventi e prenotazioni
        verranno aggiunti nelle fasi successive.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Card>
          <p className="muted text-sm">Eventi pubblicati</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Prenotazioni di oggi</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Posti disponibili</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
      </div>
    </main>
  );
}
