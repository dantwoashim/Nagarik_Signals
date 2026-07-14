export type SubmitStep =
  | 'idle'
  | 'uploading'
  | 'hashing'
  | 'anchoring'
  | 'confirming'
  | 'indexed'
  | 'failed';

const steps: Array<{ id: SubmitStep; label: string }> = [
  { id: 'uploading', label: 'Uploading evidence and stripping metadata' },
  { id: 'hashing', label: 'Hashing canonical metadata and location' },
  { id: 'anchoring', label: 'Creating Issue PDA on Solana devnet' },
  { id: 'confirming', label: 'Confirming transaction' },
  { id: 'indexed', label: 'Indexing public issue record' },
];

export function SubmitProgress({ current }: { current: SubmitStep }) {
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <ol className="progress-list" aria-label="Submit progress">
      {steps.map((step, index) => {
        const className = current === 'failed'
          ? ''
          : index < currentIndex || current === 'indexed'
            ? 'done'
            : index === currentIndex
              ? 'active'
              : '';
        return (
          <li key={step.id} className={className} aria-current={className === 'active' ? 'step' : undefined}>
            <span className="mono" aria-hidden="true">{className === 'done' ? '[x]' : '-'}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
