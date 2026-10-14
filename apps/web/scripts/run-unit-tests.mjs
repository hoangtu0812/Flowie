import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = '.test-build/tests';
const tests = readdirSync(directory)
   .filter((file) => file.endsWith('.test.js'))
   .map((file) => join(directory, file));
if (!tests.length) throw new Error('No compiled unit tests found');
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
