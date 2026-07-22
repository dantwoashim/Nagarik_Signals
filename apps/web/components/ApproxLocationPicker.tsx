export function ApproxLocationPicker() {
  return (
    <div className="grid-auto">
      <label className="field">
        <span>Approx latitude</span>
        <input name="latDisplay" type="number" step="0.001" min="26" max="31" defaultValue="27.700" required aria-describedby="approx-location-note" />
      </label>
      <label className="field">
        <span>Approx longitude</span>
        <input name="lngDisplay" type="number" step="0.001" min="80" max="89" defaultValue="85.305" required aria-describedby="approx-location-note" />
      </label>
      <span id="approx-location-note" className="helper location-helper">Use ward-level coordinates only. Do not enter a private home or a person&apos;s precise location.</span>
    </div>
  );
}
