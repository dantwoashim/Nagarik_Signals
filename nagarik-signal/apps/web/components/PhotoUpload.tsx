export function PhotoUpload() {
  return (
    <label className="field">
      <span>Safe public photo</span>
      <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" required />
      <span className="helper">JPG, PNG, or WebP. The server strips metadata, compresses the image, stores the sanitized file, and hashes those sanitized bytes.</span>
    </label>
  );
}
