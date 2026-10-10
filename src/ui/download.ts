/** Offers a blob as a file download. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name for `name` with the extension, without the characters file systems refuse. */
export function fileNameFor(name: string, extension: string): string {
  const suffix = `.${extension}`;
  let base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim();
  if (base.toLowerCase().endsWith(suffix)) base = base.slice(0, -suffix.length);
  return `${base.replace(/^\.+/, '') || 'layer'}${suffix}`;
}
