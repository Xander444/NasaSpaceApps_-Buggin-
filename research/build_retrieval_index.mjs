// Build the compact, version-matched index used only by the server-side SI bridge.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(ROOT, 'public', 'search', 'index.json');
const outputPath = path.join(ROOT, 'public', 'search', 'research-retrieval-index.json.gz');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// Generic file inventory records are not scientific evidence and dominate memory.
// Retain content/test records plus image/video inventory needed by the explicit filter.
const documents = source.documents.filter(document => document.kind !== 'file'
  || document.tags.includes('images/video')
  || /\.(avi|mp4|jpe?g|png|mov|tiff?)$/i.test(document.title));
const compact = {
  schema_version: source.schema_version,
  index_version: source.index_version,
  config: source.config,
  investigations: source.investigations,
  documents,
};
const encoded = Buffer.from(JSON.stringify(compact));
fs.writeFileSync(outputPath, zlib.gzipSync(encoded, {level: 9, mtime: 0}));
console.log(JSON.stringify({
  output: path.relative(ROOT, outputPath),
  index_version: compact.index_version,
  documents: documents.length,
  compressed_bytes: fs.statSync(outputPath).size,
}));
