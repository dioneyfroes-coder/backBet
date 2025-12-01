import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '@/infrastructure/config/swagger';

const outDir = path.resolve(__dirname, '../../docs');
const outFile = path.join(outDir, 'openapi.json');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outFile, JSON.stringify(swaggerSpec, null, 2), { encoding: 'utf8' });

console.log('OpenAPI spec written to', outFile);
