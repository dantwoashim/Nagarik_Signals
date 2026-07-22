'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react';

export function PhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function updateFile(nextFile: File | null) {
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = '';
    updateFile(null);
    inputRef.current?.focus();
  }

  return (
    <div className="field photo-upload-field">
      <span id="safe-photo-label">Photo</span>
      <input
        ref={inputRef}
        id="safe-public-photo"
        className="visually-hidden-input"
        type="file"
        name="photo"
        accept="image/png,image/jpeg,image/webp"
        required
        aria-labelledby="safe-photo-label"
        onChange={(event) => updateFile(event.target.files?.[0] ?? null)}
      />
      <label className={file ? 'photo-dropzone has-file' : 'photo-dropzone'} htmlFor="safe-public-photo">
        {previewUrl ? (
          <span
            className="photo-preview"
            style={{ backgroundImage: `url(${previewUrl})` }}
            role="img"
            aria-label={`Selected evidence preview: ${file?.name ?? 'photo'}`}
          />
        ) : (
          <span className="photo-upload-icon" aria-hidden="true"><ImageSquare size={34} weight="regular" /></span>
        )}
        <span className="photo-dropzone-copy">
          <strong>{file ? 'Photo ready' : 'Choose a clear infrastructure photo'}</strong>
          <span>{file ? 'Choose again to replace it' : 'JPG, PNG, or WebP'}</span>
        </span>
        <span className="photo-dropzone-action">
          {file ? <CheckCircle size={18} weight="fill" /> : <UploadSimple size={18} weight="bold" />}
          {file ? 'Replace' : 'Choose photo'}
        </span>
      </label>
      {file ? (
        <div className="photo-file-meta" aria-live="polite">
          <span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB selected</small></span>
          <button type="button" className="icon-button compact" onClick={clearFile} aria-label="Remove selected photo" title="Remove selected photo">
            <Trash size={17} weight="bold" />
          </button>
        </div>
      ) : null}
      <details className="photo-processing-details">
        <summary>How the photo is processed</summary>
        <p>The file is decoded, resized, stripped of metadata, re-encoded, and hashed before publication.</p>
      </details>
    </div>
  );
}
