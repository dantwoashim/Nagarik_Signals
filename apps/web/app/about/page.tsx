import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  CheckCircle,
  Database,
  Fingerprint,
  MapPin,
  PaperPlaneTilt,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr';

const integrityChecks = [
  [
    'Evidence bytes',
    'A reviewed public image is hashed so later changes can be detected independently.',
  ],
  [
    'Public record',
    'Canonical issue details produce one versioned metadata commitment without storage URLs.',
  ],
  [
    'Approximate place',
    'A coarse location cell is committed while the privately reviewed point stays private.',
  ],
  [
    'Ordered history',
    'Deterministic event accounts checkpoint lifecycle, corrections, handoffs, and removal.',
  ],
] as const;

export default function AboutPage() {
  return (
    <div className="prod-about">
      <header className="container page-section prod-about-intro">
        <span className="eyebrow">How it works</span>
        <h1>A public history built from reviewed evidence</h1>
        <p>
          Nagarik Signal keeps private intake, public information, attention signals, official
          follow-up, and cryptographic integrity in separate layers.
        </p>
      </header>

      <section className="prod-about-flow" aria-labelledby="workflow-heading">
        <div className="container">
          <h2 id="workflow-heading">From a private report to a public record</h2>
          <div>
            <article>
              <Camera size={23} weight="regular" />
              <span className="mono">01</span>
              <h3>Private intake</h3>
              <p>
                The image is decoded, resized, stripped of metadata, and held in private storage.
              </p>
            </article>
            <article>
              <ShieldCheck size={23} weight="regular" />
              <span className="mono">02</span>
              <h3>Human review</h3>
              <p>A moderator reviews safety, wording, location, and any required redaction.</p>
            </article>
            <article>
              <Fingerprint size={23} weight="regular" />
              <span className="mono">03</span>
              <h3>Public commitment</h3>
              <p>An approved public version is committed before it becomes publicly visible.</p>
            </article>
            <article>
              <PaperPlaneTilt size={23} weight="regular" />
              <span className="mono">04</span>
              <h3>Follow-up</h3>
              <p>
                Status, corrections, and official routing extend the same ordered public history.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="container prod-about-integrity" aria-labelledby="integrity-model-heading">
        <header>
          <span className="eyebrow">Why Solana</span>
          <h2 id="integrity-model-heading">A checkpoint outside the application database</h2>
          <p>
            Postgres runs the moderated workflow. Solana holds compact commitments that another
            party can read and compare without trusting the application database.
          </p>
        </header>
        <div className="prod-about-checks">
          {integrityChecks.map(([title, copy]) => (
            <article key={title}>
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
        <details className="prod-about-technical">
          <summary>Protocol structure</summary>
          <dl>
            <div>
              <dt>Issue commitment</dt>
              <dd>
                <code className="mono">[&quot;issue&quot;, protocol, issue_key]</code>
              </dd>
            </div>
            <div>
              <dt>Commitment event</dt>
              <dd>
                <code className="mono">[&quot;event&quot;, issue, event_id]</code>
              </dd>
            </div>
            <div>
              <dt>Retry safety</dt>
              <dd>Deterministic IDs, expected heads, and durable outbox jobs</dd>
            </div>
            <div>
              <dt>Public meaning</dt>
              <dd>Integrity and ordering, not physical truth or official action</dd>
            </div>
          </dl>
        </details>
      </section>

      <section className="prod-about-boundaries">
        <div className="container">
          <header>
            <span className="eyebrow">
              <Database size={14} weight="bold" /> Clear boundaries
            </span>
            <h2>What each layer means</h2>
          </header>
          <dl>
            <div>
              <dt>Lifecycle</dt>
              <dd>The platform&apos;s current reviewed state for the issue.</dd>
            </div>
            <div>
              <dt>Attention signals</dt>
              <dd>Invited pilot attention, separate from truth and identity.</dd>
            </div>
            <div>
              <dt>Official follow-up</dt>
              <dd>External routing or receipt only when an actual reference exists.</dd>
            </div>
            <div>
              <dt>Integrity check</dt>
              <dd>Whether public bytes and metadata still match the recorded commitment.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="safety" className="container prod-about-safety" aria-labelledby="safety-heading">
        <header>
          <span className="eyebrow">
            <ShieldCheck size={14} weight="bold" /> Privacy and safety
          </span>
          <h2 id="safety-heading">Public infrastructure, with private intake by default</h2>
        </header>
        <div>
          <article>
            <Camera size={20} weight="regular" />
            <strong>Reviewed media</strong>
            <span>
              Original uploads are private. Only an approved derivative can become public.
            </span>
          </article>
          <article>
            <MapPin size={20} weight="regular" />
            <strong>Coarse public location</strong>
            <span>The public map shows an area instead of a reporter&apos;s exact point.</span>
          </article>
          <article>
            <ShieldCheck size={20} weight="regular" />
            <strong>Non-emergency scope</strong>
            <span>
              Immediate danger still belongs with emergency and responsible local services.
            </span>
          </article>
        </div>
      </section>

      <section className="container prod-about-actions">
        <div>
          <h2>Open the public record</h2>
          <p>Inspect the evidence, history, location boundary, and integrity check together.</p>
        </div>
        <div className="row-actions">
          <Link className="button primary" href="/explore">
            Explore records <ArrowRight size={17} weight="bold" />
          </Link>
          <Link className="button secondary" href="/report">
            Report an issue
          </Link>
        </div>
      </section>
    </div>
  );
}
