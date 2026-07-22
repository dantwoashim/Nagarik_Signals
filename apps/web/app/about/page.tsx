import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  CheckCircle,
  Fingerprint,
  MapPin,
  PaperPlaneTilt,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr';
import { appConfig } from '@/lib/constants/config';

const solanaChecks = [
  ['Evidence', 'The delivered photo bytes are hashed and compared with the Issue account.'],
  ['Issue details', 'Canonical title, description, category, source, and review dates produce one metadata commitment.'],
  ['Approximate place', 'Rounded coordinates produce a location commitment without publishing an exact reporter position.'],
  ['Record history', 'StatusUpdate accounts and a rolling timeline hash preserve ordered platform updates.'],
] as const;

export default function AboutPage() {
  return (
    <section className="about-page-clean">
      <header className="container about-intro">
        <span className="eyebrow">How it works</span>
        <h1>How Nagarik Signal works</h1>
        <p>A public record keeps civic evidence, source details, approximate location, and follow-up together.</p>
      </header>

      <section className="about-flow-band" aria-labelledby="about-flow-heading">
        <div className="container">
          <h2 id="about-flow-heading" className="sr-only">Reporting flow</h2>
          <div className="about-flow">
            <article>
              <Camera size={23} weight="regular" />
              <span className="mono">01</span>
              <h3>Prepare evidence</h3>
              <p>The photo is decoded, resized, stripped of metadata, and stored behind the public media route.</p>
            </article>
            <article>
              <Fingerprint size={23} weight="regular" />
              <span className="mono">02</span>
              <h3>Anchor commitments</h3>
              <p>Evidence, issue details, location, and initial history are committed to an Issue account on Solana.</p>
            </article>
            <article>
              <PaperPlaneTilt size={23} weight="regular" />
              <span className="mono">03</span>
              <h3>Track follow-up</h3>
              <p>Public signals, steward updates, and official-channel artifacts remain visibly separate.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="container about-solana" aria-labelledby="about-solana-heading">
        <div className="about-section-heading">
          <span className="eyebrow">Why Solana</span>
          <h2 id="about-solana-heading">A record anyone can check</h2>
          <p>Solana provides a public timestamp and compact commitments that can be compared independently.</p>
        </div>
        <div className="about-check-grid">
          {solanaChecks.map(([title, copy]) => (
            <article key={title}>
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              <div><h3>{title}</h3><p>{copy}</p></div>
            </article>
          ))}
        </div>
        <details className="about-technical-record">
          <summary>Network details</summary>
          <dl>
            <div><dt>Network</dt><dd>{appConfig.cluster}</dd></div>
            <div><dt>Program</dt><dd><code className="mono">{appConfig.programId}</code></dd></div>
            <div><dt>Issue account</dt><dd><code className="mono">[&quot;issue&quot;, issue_id]</code></dd></div>
            <div><dt>Signal account</dt><dd><code className="mono">[&quot;verification&quot;, issue, signer]</code></dd></div>
            <div><dt>Status account</dt><dd><code className="mono">[&quot;status_update&quot;, issue, sequence]</code></dd></div>
          </dl>
        </details>
      </section>

      <section className="about-routing-band" aria-labelledby="about-routing-heading">
        <div className="container about-routing">
          <div className="about-section-heading">
            <span className="eyebrow">Official follow-up</span>
            <h2 id="about-routing-heading">Carry the public record into an official channel</h2>
            <p>The public URL gives residents and civic groups one stable reference for follow-up.</p>
          </div>
          <div className="official-channel-grid">
            <a href="https://gunaso.opmcm.gov.np/" target="_blank" rel="noreferrer">
              <strong>Hello Sarkar</strong><span>Federal grievance portal and 1111 service</span><ArrowRight size={17} weight="bold" />
            </a>
            <a href="https://gunaso.kathmandu.gov.np/register" target="_blank" rel="noreferrer">
              <strong>Kathmandu Gunaso</strong><span>Municipal grievance registration</span><ArrowRight size={17} weight="bold" />
            </a>
            <a href="https://apps.apple.com/np/app/connect-kmc/id6767496815" target="_blank" rel="noreferrer">
              <strong>Connect KMC</strong><span>Kathmandu services and Public Eye reports</span><ArrowRight size={17} weight="bold" />
            </a>
          </div>
        </div>
      </section>

      <section id="safety" className="container about-safety-clean" aria-labelledby="about-safety-heading">
        <div className="about-section-heading">
          <span className="eyebrow"><ShieldCheck size={15} weight="bold" /> Privacy and safety</span>
          <h2 id="about-safety-heading">Keep the record focused on public infrastructure</h2>
        </div>
        <div className="about-safety-points">
          <div><Camera size={20} weight="regular" /><strong>Safe photos</strong><span>Faces, plates, private homes, names, and accusations stay out.</span></div>
          <div><MapPin size={20} weight="regular" /><strong>Approximate location</strong><span>Coordinates are rounded before publication.</span></div>
          <div><ShieldCheck size={20} weight="regular" /><strong>Clear boundaries</strong><span>Emergency services remain the right route for immediate danger.</span></div>
        </div>
      </section>

      <section className="container about-boundary" aria-label="Integrity check boundary">
        <div>
          <span className="eyebrow">Current network</span>
          <h2>Public proof on Solana devnet</h2>
          <p>The integrity check covers digital evidence and record commitments. Physical conditions and official actions require their own evidence.</p>
        </div>
        <div className="row-actions">
          <Link className="button primary" href="/explore">Explore records <ArrowRight size={17} weight="bold" /></Link>
          <Link className="button secondary" href="/report">Report an issue</Link>
        </div>
      </section>
    </section>
  );
}
