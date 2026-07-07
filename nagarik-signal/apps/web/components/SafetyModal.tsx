export function SafetyModal() {
  const rules = [
    'Public infrastructure only',
    'No faces or license plates',
    'No private homes',
    'No personal accusations',
    'Not for emergencies',
    'Resolution proof must show the public asset, not private people',
    'Reports may become public proof',
  ];
  return (
    <section className="panel pad">
      <span className="eyebrow">Before reporting</span>
      <h2 style={{ marginTop: 0 }}>Safety rules</h2>
      <p className="muted" style={{ lineHeight: 1.55 }}>
        Nagarik Signal creates public proof. Keep the record about infrastructure, not private people.
      </p>
      <ul style={{ display: 'grid', gap: 8, paddingLeft: 20, lineHeight: 1.5 }}>
        {rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
      <div className="notice">
        Unsafe media can be hidden by stewards, but the public proof record remains visible. Resolution proof is evidence of a steward update, not an official government claim.
      </div>
    </section>
  );
}
