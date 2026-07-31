import type { Metadata } from 'next';

import { OperatorAuthPanel } from '@/components/operator/OperatorAuthPanel';
import { createServerSupabaseClient, getSupabaseConfig } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator workspace',
  robots: { index: false, follow: false },
};

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NAGARIK_E2E_OPERATOR_FIXTURE === 'true'
  ) {
    return children;
  }

  if (!getSupabaseConfig().configured) {
    return (
      <section className="container page-section operator-page">
        <OperatorAuthPanel mode="unavailable" />
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <section className="container page-section operator-page">
        <header className="operator-entry-heading">
          <span className="eyebrow">Private operations</span>
          <h1>Operator workspace</h1>
        </header>
        <OperatorAuthPanel mode="sign_in" />
      </section>
    );
  }

  const [{ data: assurance }, { data: factorData }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (assurance?.currentLevel !== 'aal2') {
    const factors = (factorData?.totp ?? [])
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? 'Authenticator',
      }));
    return (
      <section className="container page-section operator-page">
        <header className="operator-entry-heading">
          <span className="eyebrow">Private operations</span>
          <h1>Operator workspace</h1>
        </header>
        <OperatorAuthPanel mode="mfa" email={user.email ?? 'this account'} factors={factors} />
      </section>
    );
  }

  return children;
}
