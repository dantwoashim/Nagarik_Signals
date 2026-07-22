import { wards } from '@/lib/geo/wards';

export function WardSelect() {
  return (
    <label className="field">
      <span>Ward / locality</span>
      <select name="wardId" required>
        {wards.map((ward) => (
          <option key={ward.id} value={ward.id}>{ward.label}</option>
        ))}
      </select>
      <span className="helper">Display uses ward/locality first. Exact GPS is never published on-chain.</span>
    </label>
  );
}
