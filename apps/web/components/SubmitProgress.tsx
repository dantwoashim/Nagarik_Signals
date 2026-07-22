export type SubmitStep =
  | 'idle'
  | 'uploading'
  | 'hashing'
  | 'anchoring'
  | 'confirming'
  | 'indexed'
  | 'failed';

const steps: Array<{ id: SubmitStep; label: string }> = [
  { id: 'uploading', label: 'Prepare photo' },
  { id: 'hashing', label: 'Create commitments' },
  { id: 'anchoring', label: 'Anchor Solana account' },
  { id: 'confirming', label: 'Confirm transaction' },
  { id: 'indexed', label: 'Publish record' },
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
            <span className="progress-icon" aria-hidden="true">
              {current === 'failed' && index === Math.max(0, currentIndex)
                ? <WarningCircle size={16} weight="fill" />
                : className === 'done'
                  ? <CheckCircle size={16} weight="fill" />
                  : className === 'active'
                    ? <SpinnerGap className="progress-spinner" size={16} weight="bold" />
                    : <Circle size={16} weight="regular" />}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
import { CheckCircle, Circle, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
