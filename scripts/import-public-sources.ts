import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import { coarseGeohash } from '../apps/web/lib/geo/geohash';
import { canonicalize } from '../apps/web/lib/proof/canonicalize';
import { buildProofMetadata } from '../apps/web/lib/proof/metadata';
import type { CivicIssue, IssueCategory, IssueProvenance } from '../apps/web/lib/types';
import {
  bytesToHex,
  deriveIssuePda,
  ensureRegistry,
  explorerUrl,
  getProgram,
  hexToBytes32,
  sha256Hex,
} from './lib/nagarikClient';

type SourceDossier = {
  slug: string;
  title: string;
  summary: string;
  category: IssueCategory;
  wardId: string;
  locality: string;
  latDisplay: number;
  lngDisplay: number;
  firstObservedAt: string;
  provenance: IssueProvenance;
};

type LocalModel = {
  version: number;
  storage: string;
  updatedAt: string;
  issues: CivicIssue[];
  verifications: unknown[];
  statusUpdates: unknown[];
  sessions: unknown[];
  stewards: unknown[];
};

const categoryValues: Record<IssueCategory, number> = {
  road: 0,
  waste: 1,
  water: 2,
  electricity_lighting: 3,
  public_facility: 4,
  public_safety_hazard: 5,
  other_public_infrastructure: 6,
};

const root = resolve(process.cwd());
const sourcesPath = resolve(root, 'data', 'public-sources', 'nepal-civic-watch-2026.json');
const modelPath = resolve(root, 'data', 'read-model', 'nagarik-signal.json');
const receiptPath = resolve(root, 'data', 'public-sources', 'onchain-receipt.json');
const execute = process.argv.includes('--execute');

function isoFromUnix(value: anchor.BN | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const seconds = value instanceof anchor.BN ? value.toNumber() : Number(value);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function classifyLegacyRecords(model: LocalModel) {
  model.issues = model.issues.map((issue) => ({
    ...issue,
    recordKind: issue.recordKind ?? (issue.proof.proofStatus === 'seeded_demo' ? 'illustrative_sample' : 'qa_fixture'),
    provenance: issue.provenance ?? null,
  }));
}

async function main() {
  const sources = JSON.parse(await readFile(sourcesPath, 'utf8')) as SourceDossier[];
  const model = JSON.parse(await readFile(modelPath, 'utf8')) as LocalModel;
  classifyLegacyRecords(model);

  const prepared = await Promise.all(sources.map(async (source) => {
    const imagePath = resolve(root, 'apps', 'web', 'public', 'source-dossiers', `${source.slug}.png`);
    const image = await readFile(imagePath);
    const photoUrl = `/source-dossiers/${source.slug}.png`;
    const evidenceHash = createHash('sha256').update(image).digest('hex');
    const geohash = coarseGeohash(source.latDisplay, source.lngDisplay);
    const metadata = buildProofMetadata({
      title: source.title,
      description: source.summary,
      category: source.category,
      wardId: source.wardId,
      locality: source.locality,
      latDisplay: source.latDisplay,
      lngDisplay: source.lngDisplay,
      geohash,
      firstObservedAt: source.firstObservedAt,
      evidenceHash,
      photoUrl,
      recordKind: 'public_source',
      provenance: source.provenance,
    });
    return {
      source,
      photoUrl,
      evidenceHash,
      metadataHash: sha256Hex(canonicalize(metadata)),
      locationHash: sha256Hex(`${source.wardId}:${geohash}:v1`),
      geohash,
    };
  }));

  const pending = prepared.filter(({ source }) => !model.issues.some(
    (issue) => issue.provenance?.sourceUrl === source.provenance.sourceUrl
  ));
  if (!execute) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'dry_run',
      sourceCount: sources.length,
      pendingCount: pending.length,
      records: pending.map(({ source, evidenceHash, metadataHash, locationHash }) => ({
        slug: source.slug,
        evidenceHash,
        metadataHash,
        locationHash,
      })),
    }, null, 2)}\n`);
    return;
  }

  const program = getProgram();
  const runtimeProgram = program as any;
  const receipts: unknown[] = [];
  for (const record of pending) {
    const registryState = await ensureRegistry(program);
    const issueId = Number(registryState.account.issueCount.toString()) + 1;
    const issuePda = deriveIssuePda(issueId);
    const firstObservedUnix = Math.floor(Date.parse(record.source.firstObservedAt) / 1000);
    const txSig = await runtimeProgram.methods
      .createIssue(
        new anchor.BN(issueId),
        categoryValues[record.source.category],
        new anchor.BN(firstObservedUnix),
        hexToBytes32(record.metadataHash),
        hexToBytes32(record.evidenceHash),
        hexToBytes32(record.locationHash)
      )
      .accounts({
        registry: registryState.registry,
        reporter: program.provider.publicKey,
        issue: issuePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const account = await runtimeProgram.account.issue.fetch(issuePda) as Record<string, any>;
    const proofAnchoredAt = isoFromUnix(account.proofAnchoredAt) ?? new Date().toISOString();
    const issue: CivicIssue = {
      id: String(issueId),
      issueId,
      title: record.source.title,
      description: record.source.summary,
      category: record.source.category,
      wardId: record.source.wardId,
      locality: record.source.locality,
      status: 'submitted',
      geohash: record.geohash,
      firstObservedAt: new Date(record.source.firstObservedAt).toISOString(),
      proofAnchoredAt,
      reporterMode: 'wallet',
      reporterPubkey: program.provider.publicKey.toBase58(),
      recordKind: 'public_source',
      provenance: record.source.provenance,
      verificationCount: Number(account.verificationCount ?? 0),
      updateCount: Number(account.updateCount ?? 0),
      photoUrl: record.photoUrl,
      resolutionHash: null,
      resolutionPhotoUrl: null,
      safetyReviewStatus: 'visible',
      latDisplay: record.source.latDisplay,
      lngDisplay: record.source.lngDisplay,
      proof: {
        issuePda: issuePda.toBase58(),
        metadataHash: record.metadataHash,
        evidenceHash: record.evidenceHash,
        locationHash: record.locationHash,
        timelineHash: bytesToHex(account.timelineHash),
        proofStatus: 'indexed_devnet',
        createTxSig: txSig,
        latestTxSig: txSig,
        explorerUrl: explorerUrl(issuePda.toBase58()),
      },
      timeline: [{
        seq: 0,
        status: 'submitted',
        label: 'source dossier anchored',
        note: 'A checked public-source dossier was anchored on Solana devnet. It is not a firsthand field report.',
        proofHash: record.metadataHash,
        txSig,
        statusUpdatePda: null,
        createdAt: proofAnchoredAt,
      }],
    };
    model.issues.push(issue);
    model.updatedAt = new Date().toISOString();
    await writeJsonAtomic(modelPath, model);
    receipts.push({
      slug: record.source.slug,
      issueId,
      issuePda: issuePda.toBase58(),
      txSig,
      metadataHash: record.metadataHash,
      evidenceHash: record.evidenceHash,
      locationHash: record.locationHash,
      sourceUrl: record.source.provenance.sourceUrl,
    });
  }

  const receipt = {
    ok: true,
    generatedAt: new Date().toISOString(),
    cluster: 'devnet',
    programId: program.programId.toBase58(),
    reporterPubkey: program.provider.publicKey.toBase58(),
    records: receipts,
  };
  await writeJsonAtomic(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
