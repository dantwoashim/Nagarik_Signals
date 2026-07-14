import { CheckCircle, ShieldCheck } from '@phosphor-icons/react/dist/ssr';

export function SafetyModal() {
  const rules = [
    'Public infrastructure only',
    'No faces, plates, or private homes',
    'No names or personal accusations',
    'Not for emergencies',
  ];
  return (
    <aside className="safety-brief">
      <div className="safety-brief-icon" aria-hidden="true"><ShieldCheck size={25} weight="bold" /></div>
      <span className="eyebrow">Safety boundary</span>
      <h2>Keep people out of the record</h2>
      <p>Nagarik Signal is for public infrastructure evidence, never private allegations.</p>
      <ul>
        {rules.map((rule) => <li key={rule}><CheckCircle size={17} weight="fill" aria-hidden="true" />{rule}</li>)}
      </ul>
      <p className="safety-note">Unsafe media can be hidden, but the proof trail remains. Resolution evidence is a steward update, not an official government claim.</p>
    </aside>
  );
}
