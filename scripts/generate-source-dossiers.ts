import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

type SourceDossier = {
  slug: string;
  title: string;
  summary: string;
  locality: string;
  provenance: {
    publisher: string;
    publishedAt: string;
    checkedAt: string;
    statusAtCheck: string;
  };
};

const root = resolve(process.cwd());
const sourcePath = resolve(root, 'data', 'public-sources', 'nepal-civic-watch-2026.json');
const outputDirectory = resolve(root, 'apps', 'web', 'public', 'source-dossiers');

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function wrap(value: string, width: number, maxLines: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(' ').length;
  if (consumed < value.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:]?$/, '')}...`;
  }
  return lines;
}

function textLines(lines: string[], x: number, y: number, lineHeight: number, className: string) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`)
    .join('');
}

function dossierSvg(record: SourceDossier) {
  const title = wrap(record.title, 40, 4);
  const summary = wrap(record.summary, 73, 5);
  const published = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' }).format(
    new Date(record.provenance.publishedAt)
  );
  const checked = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' }).format(
    new Date(record.provenance.checkedAt)
  );
  return `
    <svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      <style>
        .sans { font-family: Inter, Arial, sans-serif; fill: #171716; }
        .label { font-family: Inter, Arial, sans-serif; fill: #6c6a66; font-size: 21px; font-weight: 700; }
        .title { font-family: Inter, Arial, sans-serif; fill: #171716; font-size: 49px; font-weight: 760; }
        .body { font-family: Inter, Arial, sans-serif; fill: #403f3c; font-size: 24px; font-weight: 420; }
        .meta { font-family: Inter, Arial, sans-serif; fill: #171716; font-size: 21px; font-weight: 650; }
        .meta-small { font-family: Inter, Arial, sans-serif; fill: #6c6a66; font-size: 17px; font-weight: 520; }
      </style>
      <rect width="1200" height="800" fill="#f4f3ef" />
      <rect width="18" height="800" fill="#b52b38" />
      <rect x="72" y="64" width="1056" height="672" rx="4" fill="#ffffff" stroke="#d9d7d1" stroke-width="2" />
      <text x="116" y="119" class="label">NAGARIK SIGNAL / PUBLIC-SOURCE DOSSIER</text>
      <rect x="894" y="91" width="190" height="40" rx="20" fill="#e9f1ea" />
      <text x="989" y="118" text-anchor="middle" class="meta" fill="#265d3b">NEEDS RECHECK</text>
      ${textLines(title, 116, 190, 58, 'title')}
      <line x1="116" y1="421" x2="1084" y2="421" stroke="#d9d7d1" stroke-width="2" />
      ${textLines(summary, 116, 468, 36, 'body')}
      <line x1="116" y1="642" x2="1084" y2="642" stroke="#d9d7d1" stroke-width="2" />
      <text x="116" y="676" class="label">SOURCE</text>
      <text x="116" y="705" class="meta">${escapeXml(record.provenance.publisher)}</text>
      <text x="116" y="728" class="meta-small">Published ${escapeXml(published)} / original link on issue page</text>
      <text x="1084" y="676" text-anchor="end" class="label">AREA</text>
      <text x="1084" y="705" text-anchor="end" class="meta">${escapeXml(record.locality)}</text>
      <text x="1084" y="728" text-anchor="end" class="meta-small">Source checked ${escapeXml(checked)}</text>
    </svg>`;
}

async function main() {
  const records = JSON.parse(await readFile(sourcePath, 'utf8')) as SourceDossier[];
  await mkdir(outputDirectory, { recursive: true });
  for (const record of records) {
    const outputPath = resolve(outputDirectory, `${record.slug}.png`);
    if (dirname(outputPath) !== outputDirectory) throw new Error(`Unsafe output path: ${outputPath}`);
    await sharp(Buffer.from(dossierSvg(record))).png({ compressionLevel: 9 }).toFile(outputPath);
    process.stdout.write(`${record.slug}.png\n`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
