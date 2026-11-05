/** Un R2 mínimo en memoria para las pruebas (put, get, head, delete): suficiente para los archivos de la app. */
export function fakeBucket() {
  const files = new Map<string, { bytes: Uint8Array; contentType?: string; uploaded: Date }>();
  const bucket = {
    async put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
      files.set(key, { bytes: new Uint8Array(value), contentType: opts?.httpMetadata?.contentType, uploaded: new Date() });
    },
    async get(key: string) {
      const f = files.get(key);
      return f ? { body: f.bytes, httpMetadata: { contentType: f.contentType }, uploaded: f.uploaded } : null;
    },
    async head(key: string) { const f = files.get(key); return f ? { httpMetadata: { contentType: f.contentType }, uploaded: f.uploaded } : null; },
    async delete(key: string) { files.delete(key); },
  };
  return { bucket: bucket as unknown as R2Bucket, files };
}
