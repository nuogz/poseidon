import { strict as AS } from 'assert';

import Poseidon from '../index.js';

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';


const dirScript = dirname(fileURLToPath(import.meta.url));


const C = new Poseidon(resolve(dirScript, 'config'));


const result = C.$.getTypesExist();

AS.deepEqual(result, [
	'.hidden',
	'_',
	'null',
	'number',
	'object',
	'path',
	'string',
]);


(console ?? {}).log('Test passed ✔ ');
