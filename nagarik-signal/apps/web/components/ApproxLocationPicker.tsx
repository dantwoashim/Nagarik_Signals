export function ApproxLocationPicker() {
  return (
    <div className="grid-auto">
      <label className="field">
        <span>Approx latitude</span>
        <input name="latDisplay" type="number" step="0.001" defaultValue="27.700" required />
      </label>
      <label className="field">
        <span>Approx longitude</span>
        <input name="lngDisplay" type="number" step="0.001" defaultValue="85.305" required />
      </label>
    </div>
  );
}
