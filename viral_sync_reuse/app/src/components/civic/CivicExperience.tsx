import Link from 'next/link';
import {
  ArrowRight,
  Bank,
  ChartLineUp,
  CheckCircle,
  Coins,
  Database,
  Fingerprint,
  HandCoins,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Pulse,
  Receipt,
  Scales,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr';
import type { ComponentType, ReactNode } from 'react';
import type { CivicMarket, CivicPassVerification } from '@/lib/civic/types';
import { civicSourceArtifacts } from '@/lib/civic/civicProof';
import { CivicParticipationFlow } from './CivicParticipationFlow';
import { ReplayRejectionPanel } from './ReplayRejectionPanel';
import { VerifierStationFlow } from './VerifierStationFlow';

type Icon = ComponentType<{ size?: number; weight?: 'regular' | 'bold' | 'duotone' | 'fill'; className?: string }>;

const navLinks = [
  { href: '/market/ward12-water-repair', label: 'Market' },
  { href: '/participate/ward12-water-repair', label: 'Action' },
  { href: '/verify/ward12-water-repair', label: 'Verify' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/for-sponsors', label: 'Sponsors' },
];

const loopSteps = [
  {
    label: 'Forecast',
    detail: 'People signal what they expect will happen. No payout is tied to being right.',
    icon: ChartLineUp,
  },
  {
    label: 'Fund',
    detail: 'A sponsor funds rewards for useful participation, not attention metrics.',
    icon: HandCoins,
  },
  {
    label: 'Verify',
    detail: 'A station validates the action context and issues a receipt path.',
    icon: ShieldCheck,
  },
  {
    label: 'Settle',
    detail: 'Solana records receipt, nullifier, settlement, and replay rejection evidence.',
    icon: Receipt,
  },
] as const;

export function CivicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[var(--civic-paper)] text-[var(--civic-ink)]">
      <CivicNav />
      {children}
    </main>
  );
}

export function CivicNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--civic-line)] bg-[rgba(248,247,241,0.9)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-3 text-[var(--civic-ink)]">
          <span className="grid size-9 place-items-center rounded-lg border border-[var(--civic-line-strong)] bg-[var(--civic-ink)] text-white shadow-sm transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
            <Scales size={18} weight="bold" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Viral Sync</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--civic-muted)]">Civic receipts</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-lg border border-[var(--civic-line)] bg-white/70 p-1 text-sm font-semibold text-[var(--civic-muted)] shadow-sm md:flex" aria-label="Civic navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 transition-colors hover:bg-[var(--civic-ink)] hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/demo"
          className="hidden h-10 items-center gap-2 rounded-md bg-[var(--civic-green)] px-4 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 md:inline-flex"
        >
          Run judge demo
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </header>
  );
}

export function CivicHome({ market }: { market: CivicMarket }) {
  return (
    <CivicShell>
      <section className="relative overflow-hidden border-b border-[var(--civic-line)]">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(19,22,17,0.055)_1px,transparent_1px),linear-gradient(180deg,rgba(19,22,17,0.045)_1px,transparent_1px)] bg-[size:72px_72px]" aria-hidden="true" />
        <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] w-full min-w-0 max-w-[1240px] grid-cols-1 items-center gap-10 overflow-hidden px-4 py-12 pb-24 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-16 lg:pb-16">
          <div className="min-w-0 max-w-3xl overflow-hidden">
            <div className="mb-6 flex max-w-full flex-wrap items-center gap-2 overflow-hidden">
              <SignalBadge tone="dark">{market.phaseLabel}</SignalBadge>
              <SignalBadge tone="green">{market.statusLabel}</SignalBadge>
              <SignalBadge tone="amber">No wagering</SignalBadge>
            </div>
            <h1 className="max-w-full text-balance break-words text-[clamp(2.08rem,9vw,5.7rem)] font-semibold leading-[1] text-[var(--civic-ink)] sm:text-[clamp(2.55rem,8vw,5.7rem)] sm:leading-[0.95]">
              Verified civic rewards, settled with receipts.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--civic-muted)] sm:text-xl sm:leading-8">
              A sponsor funds useful participation. Residents contribute a civic signal. A verifier confirms action. Solana settles the receipt, blocks replay, and exposes the proof trail.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href={`/participate/${market.slug}`}>Start action flow</PrimaryLink>
              <SecondaryLink href="/ledger">Inspect proof ledger</SecondaryLink>
            </div>
            <div className="mt-10 grid gap-3 border-y border-[var(--civic-line)] py-5 sm:grid-cols-3">
              <HeroStat label="Receipt" value="Devnet settled" />
              <HeroStat label="Replay" value={`${market.evidence.gauntletLabel} rejected`} />
              <HeroStat label="Reward basis" value="Verified action" />
            </div>
          </div>
          <CivicMarketConsole market={market} />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1240px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--civic-green)]">Product loop</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--civic-ink)] sm:text-4xl">
            The interface must make the fraud boundary obvious in one pass.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--civic-muted)]">
            Judges should understand the product before they read the code. The protocol details sit behind a clear loop: forecast demand, fund action, verify participation, settle a receipt.
          </p>
        </div>
        <div className="grid gap-3">
          {loopSteps.map((step, index) => (
            <ProcessRow key={step.label} index={index + 1} icon={step.icon} title={step.label} text={step.detail} />
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1240px] gap-4 px-4 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <SponsorPoolPanel market={market} />
        <ReplayRejectionPanel market={market} />
      </section>
      <ProofBoundary market={market} compact />
    </CivicShell>
  );
}

export function CivicMarketPage({ market }: { market: CivicMarket }) {
  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow={market.locality}
          title={market.title}
          text={market.summary}
          primary={{ href: `/participate/${market.slug}`, label: 'Create participation pass' }}
          secondary={{ href: `/verify/${market.slug}`, label: 'Verify receipt path' }}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--civic-muted)]">Forecast question</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight text-[var(--civic-ink)]">{market.question}</h2>
              </div>
              <Pulse size={24} weight="duotone" className="shrink-0 text-[var(--civic-amber)]" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
              {market.signals.map((signal, index) => (
                <SignalPanel key={signal.id} signal={signal} prominent={index === 0} />
              ))}
            </div>
          </section>
          <SponsorPoolPanel market={market} />
        </div>
        <section className="mt-4 min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ListChecks size={22} weight="bold" className="text-[var(--civic-green)]" />
            <h2 className="text-xl font-semibold">Resolution rules</h2>
          </div>
          <div className="mt-4 divide-y divide-[var(--civic-line)]">
            {market.outcomes.map((outcome) => (
              <div key={outcome.id} className="grid gap-3 py-4 md:grid-cols-[0.72fr_0.48fr_1fr]">
                <div>
                  <p className="font-semibold text-[var(--civic-ink)]">{outcome.label}</p>
                  <p className="text-sm text-[var(--civic-muted)]">Target: {outcome.target}</p>
                </div>
                <StatusPill status={outcome.verificationStatus} />
                <p className="text-sm leading-6 text-[var(--civic-muted)]">{outcome.resolutionRule}</p>
              </div>
            ))}
          </div>
        </section>
      </PageFrame>
    </CivicShell>
  );
}

export function CivicParticipationPage({ market }: { market: CivicMarket }) {
  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow="Verified participation"
          title="Earned by useful action, not by guessing correctly."
          text="The pass flow signs a reusable participation packet, then routes the user into verification, receipt review, replay proof, and ledger inspection."
          primary={{ href: `/api/civic/participation-pass?slug=${market.slug}`, label: 'Open pass JSON' }}
          secondary={{ href: `/market/${market.slug}`, label: 'Back to market' }}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <CivicParticipationFlow market={market} />
          <ProofBoundary market={market} mode="panel" />
        </div>
      </PageFrame>
    </CivicShell>
  );
}

export function CivicVerifyPage({
  market,
  passToken,
  initialVerification,
}: {
  market: CivicMarket;
  passToken?: string;
  initialVerification?: CivicPassVerification;
}) {
  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow="Independent verification"
          title="Believe the receipt only after the verifier path holds."
          text="The verifier separates Solana-settled evidence from civic adapters that still require real production integrations."
          primary={{ href: '/ledger', label: 'Open civic ledger' }}
          secondary={{ href: '/proofs/civic-verifier.json', label: 'Open verifier JSON' }}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <VerifierStationFlow marketSlug={market.slug} passToken={passToken} initialVerification={initialVerification} />
          <ReplayRejectionPanel market={market} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <DarkEvidencePanel market={market} />
          <VerificationChecklist />
        </div>
      </PageFrame>
    </CivicShell>
  );
}

export function CivicLedgerPage({ market }: { market: CivicMarket }) {
  const rows = [
    ['Market opened', 'verified proof sidecar', 'Civic signal and reward model published.'],
    ['Action pool mapped', market.sponsorPool.custodyStatus.replaceAll('_', ' '), market.sponsorPool.releaseRule],
    ['Receipt recorded', 'verified devnet', market.evidence.receiptPda],
    ['Reward settled', 'verified devnet', market.evidence.settlementPda],
    ['Replay controls', 'verified devnet', `${market.evidence.gauntletLabel} invalid flows rejected.`],
  ];
  const sourceHashes = civicSourceArtifacts.filter((artifact) =>
    ['manifest', 'verifier', 'negative-paths', 'proof-feed'].includes(artifact.id)
  );

  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow="Public ledger"
          title="A receipt feed with explicit proof limits."
          text="This is the bridge between the product story and the raw artifacts. The app should never imply more than the receipts prove."
          primary={{ href: '/proofs/civic-ledger.json', label: 'Open ledger JSON' }}
          secondary={{ href: '/proofs/civic-market-ward12-water-repair.json', label: 'Open market packet' }}
        />
        <section className="mt-10 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck size={24} weight="duotone" className="text-[var(--civic-green)]" />
              <h2 className="text-xl font-semibold">Independent verification</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--civic-muted)]">
              A reviewer can verify the civic receipt bundle offline. The command checks receipt PDA, nullifier, settlement record, source artifact hashes, non-wager boundary, and compatibility claims.
            </p>
            <code className="mt-4 block max-w-full overflow-x-auto rounded-md bg-[var(--civic-ink)] px-4 py-3 font-mono text-xs text-white">
              npm run civic:verify-receipt
            </code>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <PrimaryLink href="/proofs/civic-proof-sidecar.json">Open proof sidecar</PrimaryLink>
              <SecondaryLink href="/proofs/civic-verifier.json">Open verifier JSON</SecondaryLink>
            </div>
          </section>
          <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Fingerprint size={24} weight="duotone" className="text-[var(--civic-amber)]" />
              <h2 className="text-xl font-semibold">Source hash bindings</h2>
            </div>
            <div className="mt-4 space-y-3">
              {sourceHashes.map((artifact) => (
                <FactRow key={artifact.id} label={artifact.id.replaceAll('-', ' ')} value={artifact.sha256} mono />
              ))}
            </div>
          </section>
        </section>
        <LedgerTable rows={rows} />
        <div className="mt-4">
          <ReplayRejectionPanel market={market} />
        </div>
      </PageFrame>
    </CivicShell>
  );
}

export function SponsorPage({ market }: { market: CivicMarket }) {
  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow="For sponsors"
          title="Fund participation you can audit."
          text="A sponsor pool pays only when a verifier-backed civic action receipt exists. The forecast explains demand; the receipt path handles settlement evidence."
          primary={{ href: `/participate/${market.slug}`, label: 'Preview action flow' }}
          secondary={{ href: '/how-it-works', label: 'Read model' }}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <SponsorPoolPanel market={market} />
          <div className="grid gap-4">
            <CivicRail icon={LockKey} title="Abuse controls" text="Nullifier, lineage, authority, and verifier-station checks reject replay and wrong-signer flows." detail={`${market.evidence.gauntletLabel} negative paths are published.`} />
            <CivicRail icon={Database} title="Civic data boundary" text="Official civic data and private identity adapters are not claimed live." detail="The missing integrations are visible in the product." />
          </div>
        </div>
      </PageFrame>
    </CivicShell>
  );
}

export function HowItWorksPage({ market }: { market: CivicMarket }) {
  return (
    <CivicShell>
      <PageFrame>
        <CivicPageHeader
          eyebrow="System model"
          title="Prediction signal plus action reward plus receipt settlement."
          text="The project is deliberately not a pure forecasting app and not a donation tracker. The Solana primitive is the settlement receipt that makes action rewards auditable."
          primary={{ href: `/market/${market.slug}`, label: 'Open live market' }}
          secondary={{ href: '/proofs/civic-readiness.json', label: 'Readiness JSON' }}
        />
        <div className="mt-10 grid gap-3">
          {[
            ['Signal', 'Residents, analysts, or agents express probability and confidence around a civic outcome.'],
            ['Sponsor', 'A public-good sponsor funds a reward pool for useful verified participation.'],
            ['Verify', 'A verifier station confirms the participant and action context.'],
            ['Settle', 'The Solana receipt path records the event, blocks replay, and settles reward units.'],
            ['Audit', 'JSON artifacts and explorer links let reviewers verify the claim boundary.'],
          ].map(([label, text], index) => (
            <div key={label} className="grid gap-4 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm md:grid-cols-[80px_1fr]">
              <span className="font-mono text-sm text-[var(--civic-muted)]">0{index + 1}</span>
              <div>
                <h2 className="text-xl font-semibold text-[var(--civic-ink)]">{label}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--civic-muted)]">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </PageFrame>
    </CivicShell>
  );
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[1240px] overflow-hidden px-4 py-10 pb-24 sm:px-6 lg:px-8 lg:py-14 lg:pb-14">
      {children}
    </section>
  );
}

function CivicMarketConsole({ market }: { market: CivicMarket }) {
  return (
    <section className="min-w-0 rounded-lg border border-[rgba(19,22,17,0.14)] bg-white shadow-[0_30px_80px_-40px_rgba(19,22,17,0.45)]">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-[var(--civic-line)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--civic-muted)]">{market.locality}</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight">{market.title}</h2>
            </div>
            <MapPin size={24} weight="duotone" className="text-[var(--civic-green)]" />
          </div>
          <div className="mt-6 rounded-lg border border-[var(--civic-line)] bg-[var(--civic-wash)] p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--civic-muted)]">Forecast signal</p>
                <strong className="mt-2 block text-4xl font-semibold text-[var(--civic-ink)]">62%</strong>
              </div>
              <span className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[var(--civic-green-ink)]">Repair likely</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <span className="block h-full w-[62%] rounded-full bg-[var(--civic-green)]" />
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--civic-muted)]">Demo conviction signal. It cannot change reward settlement.</p>
          </div>
          <div className="mt-4 grid gap-3">
            <ConsoleFact label="Question" value={market.question} />
            <ConsoleFact label="Data status" value={market.sourceDatasetLabel} />
          </div>
        </div>
        <div className="bg-[var(--civic-ink)] p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Solana receipt spine</p>
              <h3 className="mt-2 text-2xl font-semibold">Evidence that survives the demo.</h3>
            </div>
            <ShieldCheck size={25} weight="duotone" className="text-[var(--civic-green-light)]" />
          </div>
          <div className="mt-6 space-y-3">
            <DarkFact label="Program" value={market.evidence.programId} mono />
            <DarkFact label="Receipt PDA" value={market.evidence.receiptPda} mono />
            <DarkFact label="Nullifier" value={market.evidence.nullifierPda} mono />
            <DarkFact label="Settlement" value={market.evidence.settlementPda} mono />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-[var(--civic-ink)]" href={`/participate/${market.slug}`}>
              Participate
            </Link>
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white" href="/ledger">
              Ledger
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SponsorPoolPanel({ market }: { market: CivicMarket }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-[var(--civic-ink)] p-5 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <Coins size={24} weight="duotone" className="text-[var(--civic-green-light)]" />
        <h2 className="text-xl font-semibold">Sponsor action pool</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/62">The reward is unlocked by a verified civic action receipt. The forecast does not decide who gets paid.</p>
      <div className="mt-5 grid gap-3">
        <DarkFact label="Sponsor" value={market.sponsorPool.sponsorLabel} />
        <DarkFact label="Available" value={market.sponsorPool.availableLabel} />
        <DarkFact label="Action reward" value={market.sponsorPool.actionRewardLabel} />
        <DarkFact label="Release rule" value={market.sponsorPool.releaseRule} />
      </div>
    </section>
  );
}

function ProofBoundary({ market, compact = false, mode = 'section' }: { market: CivicMarket; compact?: boolean; mode?: 'section' | 'panel' }) {
  return (
    <section className={mode === 'panel' ? 'min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm' : 'border-t border-[var(--civic-line)] bg-white'}>
      <div className={mode === 'panel' ? '' : 'mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8'}>
        <div className="flex items-center gap-3">
          <WarningCircle size={23} weight="duotone" className="text-[var(--civic-red)]" />
          <h2 className="text-xl font-semibold">Proof boundary</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--civic-muted)]">
          This is the trust contract. It tells judges exactly what is live, what is not live, and what must exist before production use.
        </p>
        <div className={`mt-5 grid gap-4 ${compact ? 'lg:grid-cols-[1fr_1fr_1fr]' : 'lg:grid-cols-[1fr_1fr_1fr]'}`}>
          <BoundaryColumn title="Proven now" items={market.proofBoundary.proven} tone="green" />
          <BoundaryColumn title="Not proven yet" items={market.proofBoundary.notProven} tone="red" />
          <BoundaryColumn title="Production requirements" items={market.proofBoundary.requiredForProduction} tone="amber" />
        </div>
      </div>
    </section>
  );
}

function BoundaryColumn({ title, items, tone }: { title: string; items: string[]; tone: 'green' | 'red' | 'amber' }) {
  const color =
    tone === 'green' ? 'text-[var(--civic-green)]' : tone === 'red' ? 'text-[var(--civic-red)]' : 'text-[var(--civic-amber)]';
  return (
    <div className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-[var(--civic-wash)] p-4">
      <h3 className={`text-sm font-semibold uppercase tracking-[0.14em] ${color}`}>{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--civic-muted)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CivicRail({ icon: IconComponent, title, text, detail }: { icon: Icon; title: string; text: string; detail: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
      <IconComponent size={25} weight="duotone" className="text-[var(--civic-green)]" />
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--civic-muted)]">{text}</p>
      <p className="mt-4 rounded-md bg-[var(--civic-wash)] px-3 py-2 text-xs font-medium leading-5 text-[var(--civic-muted)]">{detail}</p>
    </article>
  );
}

function CivicPageHeader({
  eyebrow,
  title,
  text,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  text: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}) {
  return (
    <div className="min-w-0 max-w-4xl overflow-hidden">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--civic-green)]">{eyebrow}</p>
      <h1 className="mt-3 max-w-full text-balance break-words text-[clamp(2.1rem,8vw,4.9rem)] font-semibold leading-[1.01] text-[var(--civic-ink)] md:leading-[0.98]">{title}</h1>
      <p className="mt-5 max-w-2xl break-words text-base leading-7 text-[var(--civic-muted)] sm:text-lg sm:leading-8">{text}</p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <PrimaryLink href={primary.href}>{primary.label}</PrimaryLink>
        <SecondaryLink href={secondary.href}>{secondary.label}</SecondaryLink>
      </div>
    </div>
  );
}

function ProcessRow({ index, icon: IconComponent, title, text }: { index: number; icon: Icon; title: string; text: string }) {
  return (
    <article className="grid gap-4 rounded-lg border border-[var(--civic-line)] bg-white p-4 shadow-sm sm:grid-cols-[64px_48px_1fr] sm:items-center">
      <span className="font-mono text-sm text-[var(--civic-muted)]">0{index}</span>
      <span className="grid size-11 place-items-center rounded-lg bg-[var(--civic-green-soft)] text-[var(--civic-green)]">
        <IconComponent size={22} weight="duotone" />
      </span>
      <div>
        <h3 className="font-semibold text-[var(--civic-ink)]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--civic-muted)]">{text}</p>
      </div>
    </article>
  );
}

function SignalPanel({ signal, prominent }: { signal: CivicMarket['signals'][number]; prominent?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg border border-[var(--civic-line)] bg-[var(--civic-wash)] p-4 ${prominent ? 'sm:row-span-2' : ''}`}>
      <p className="text-xs font-medium text-[var(--civic-muted)]">{signal.label}</p>
      <strong className={`${prominent ? 'text-4xl' : 'text-2xl'} mt-2 block font-semibold text-[var(--civic-ink)]`}>{signal.value}</strong>
      <p className="mt-3 text-xs leading-5 text-[var(--civic-muted)]">{signal.source}</p>
    </div>
  );
}

function DarkEvidencePanel({ market }: { market: CivicMarket }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-[var(--civic-ink)] p-5 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <Bank size={24} weight="duotone" className="text-[var(--civic-green-light)]" />
        <h2 className="text-xl font-semibold">Devnet receipt evidence</h2>
      </div>
      <div className="mt-5 space-y-3">
        <DarkFact label="Cluster" value={market.evidence.cluster} />
        <DarkFact label="Program ID" value={market.evidence.programId} mono />
        <DarkFact label="Receipt PDA" value={market.evidence.receiptPda} mono />
        <DarkFact label="Nullifier PDA" value={market.evidence.nullifierPda} mono />
        <DarkFact label="Settlement PDA" value={market.evidence.settlementPda} mono />
        <DarkFact label="Negative paths" value={`${market.evidence.gauntletLabel} rejected`} />
      </div>
    </section>
  );
}

function VerificationChecklist() {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--civic-line)] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <MagnifyingGlass size={24} weight="duotone" className="text-[var(--civic-amber)]" />
        <h2 className="text-xl font-semibold">Verification checklist</h2>
      </div>
      <div className="mt-5 space-y-3">
        <CheckItem label="Published manifest is bound" state="pass" />
        <CheckItem label="Verifier output is bound" state="pass" />
        <CheckItem label="Receipt PDA is present" state="pass" />
        <CheckItem label="Replay nullifier is present" state="pass" />
        <CheckItem label="Official civic data feed" state="missing" />
        <CheckItem label="Private identity adapter" state="missing" />
      </div>
    </section>
  );
}

function LedgerTable({ rows }: { rows: string[][] }) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-[var(--civic-line)] bg-white shadow-sm">
      <div className="hidden grid-cols-[0.7fr_0.55fr_1fr] border-b border-[var(--civic-line)] bg-[var(--civic-wash)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--civic-muted)] md:grid">
        <span>Event</span>
        <span>Status</span>
        <span>Evidence</span>
      </div>
      {rows.map(([event, status, evidence]) => (
        <div key={event} className="grid min-w-0 gap-2 border-b border-[var(--civic-line)] px-4 py-4 last:border-b-0 md:grid-cols-[0.7fr_0.55fr_1fr] md:gap-3">
          <strong className="min-w-0 text-sm text-[var(--civic-ink)]">{event}</strong>
          <span className="min-w-0 text-sm capitalize text-[var(--civic-muted)]">{status}</span>
          <span className="min-w-0 break-all font-mono text-xs leading-5 text-[var(--civic-muted)]">{evidence}</span>
        </div>
      ))}
    </section>
  );
}

function SignalBadge({ children, tone }: { children: ReactNode; tone: 'dark' | 'green' | 'amber' }) {
  const className =
    tone === 'dark'
      ? 'border-[var(--civic-line)] bg-white text-[var(--civic-ink)]'
      : tone === 'green'
        ? 'border-[rgba(22,122,75,0.18)] bg-[var(--civic-green-soft)] text-[var(--civic-green-ink)]'
        : 'border-[rgba(162,100,19,0.18)] bg-[var(--civic-amber-soft)] text-[var(--civic-amber-ink)]';
  return <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${className}`}>{children}</span>;
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--civic-muted)]">{label}</p>
      <strong className="mt-1 block break-words text-sm font-semibold text-[var(--civic-ink)]">{value}</strong>
    </div>
  );
}

function ConsoleFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--civic-wash)] px-3 py-2.5">
      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--civic-muted)]">{label}</span>
      <span className="mt-1 block min-w-0 break-words text-sm leading-6 text-[var(--civic-ink)]">{value}</span>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--civic-ink)] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 sm:w-auto" href={href}>
      {children}
      <ArrowRight size={16} weight="bold" />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-[var(--civic-line-strong)] bg-white px-5 text-sm font-semibold text-[var(--civic-ink)] transition-colors hover:bg-[var(--civic-wash)] sm:w-auto" href={href}>
      {children}
    </Link>
  );
}

function FactRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-md bg-[var(--civic-wash)] px-3 py-2 sm:grid-cols-[132px_1fr]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--civic-muted)]">{label}</span>
      <span className={`${mono ? 'break-all font-mono text-xs leading-5' : 'text-sm'} min-w-0 break-words text-[var(--civic-ink)]`}>{value}</span>
    </div>
  );
}

function DarkFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 sm:grid-cols-[124px_1fr]">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">{label}</span>
      <span className={`${mono ? 'break-all font-mono text-xs leading-5' : 'text-sm'} min-w-0 break-words text-white`}>{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const pass = status === 'verified_devnet';
  return (
    <span className={`inline-flex h-8 w-fit items-center gap-2 rounded-md px-2.5 text-xs font-semibold capitalize ${pass ? 'bg-[var(--civic-green-soft)] text-[var(--civic-green-ink)]' : 'bg-[var(--civic-amber-soft)] text-[var(--civic-amber-ink)]'}`}>
      {pass ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function CheckItem({ label, state }: { label: string; state: 'pass' | 'missing' }) {
  const pass = state === 'pass';
  return (
    <div className="flex flex-col gap-2 rounded-md bg-[var(--civic-wash)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="min-w-0 text-sm text-[var(--civic-ink)]">{label}</span>
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${pass ? 'bg-[var(--civic-green-soft)] text-[var(--civic-green-ink)]' : 'bg-[var(--civic-amber-soft)] text-[var(--civic-amber-ink)]'}`}>
        {pass ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
        {pass ? 'pass' : 'not integrated'}
      </span>
    </div>
  );
}
