import { Card } from '@/components/ui/card';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export default async function PlatformAdminPage() {
  const session = await requirePlatformAdminSession();

  return (
    <main className="shell py-10">
      <h1 className="text-3xl font-semibold">
        Amministrazione piattaforma
      </h1>
      <p className="muted mt-2">
        Accesso verificato per {session.user.displayName}. L’onboarding
        transazionale dei tenant verrà implementato nella Fase 08.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Card>
          <p className="muted text-sm">Organizzazioni attive</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Errori operativi</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
      </div>
    </main>
  );
}
