import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

const root = process.cwd();
const failures = [];

function checkFile(file, label = file) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) {
    failures.push(`${label} missing`);
    return null;
  }
  if (statSync(absolute).size === 0) failures.push(`${label} empty`);
  return readFileSync(absolute, 'utf8');
}

function readJson(file) {
  const text = checkFile(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function requireIncludes(file, text, label = text) {
  const content = checkFile(file);
  if (content && !content.includes(text)) failures.push(`${file} missing ${label}`);
}

const transcript = checkFile('dist/final-command-transcript.txt', 'final command transcript');
if (transcript) {
  for (const command of [
    'npm run build --workspace app',
    'npm run build --workspace viral-sync-sdk',
    'cargo check --manifest-path programs/viral_sync/Cargo.toml',
    'npm run test:protocol',
    'npm run civic:verify-receipt',
  ]) {
    if (!transcript.includes(command)) failures.push(`final transcript missing ${command}`);
  }
  if (/EXIT_CODE=(?!0\b)\d+/.test(transcript)) failures.push('final transcript contains non-zero exit code');
}

const browser = readJson('dist/phase6-browser-readiness.json');
if (browser) {
  if (browser.ok !== true) failures.push('browser readiness is not ok');
  if (!String(browser.screenshots ?? '').includes('phase6-mobile-screenshots')) failures.push('mobile screenshots path missing');
  const routes = new Set((browser.results ?? []).map((item) => `${item.size}:${item.route}`));
  for (const key of ['mobile:/', 'mobile:/participate/ward12-water-repair', 'mobile:/verify/ward12-water-repair', 'mobile:/ledger', 'desktop:/ledger']) {
    if (!routes.has(key)) failures.push(`browser readiness missing ${key}`);
  }
}

for (const screenshot of ['home-mobile.png', 'participate-ward12-water-repair-mobile.png', 'verify-ward12-water-repair-mobile.png', 'ledger-mobile.png']) {
  checkFile(path.join('dist', 'phase6-mobile-screenshots', screenshot), `mobile screenshot ${screenshot}`);
}

requireIncludes('README.md', 'Phase 5 Conviction Signal');
requireIncludes('README.md', 'npm run civic:verify-receipt');
requireIncludes('README.md', 'npm run civic:conviction-artifact');
requireIncludes('docs/phase6-submission-readiness.md', 'Fresh Clone Verification');
requireIncludes('docs/phase6-submission-readiness.md', 'Hosted App Verification');
requireIncludes('docs/phase6-submission-readiness.md', 'Accessibility Verification');
requireIncludes('docs/final-video-checklist.md', '3-minute');
requireIncludes('docs/frontier-final-go-no-go.md', 'GO');

const conviction = readJson('app/public/proofs/civic-conviction-signal.json');
if (conviction) {
  if (conviction.generatedForPhase !== 'phase-5') failures.push('conviction artifact is not phase-5');
  if (conviction.creditPolicy?.transferable !== false) failures.push('conviction artifact has transfer path');
  if (conviction.settlementIndependence?.dependsOnConviction !== false) failures.push('conviction artifact couples settlement to conviction');
}

const readiness = readJson('app/public/proofs/frontier-readiness.json');
if (readiness?.status !== 'GO') failures.push('frontier readiness is not GO');

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, failures: [] }, null, 2));
