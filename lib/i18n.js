import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import initI18N from '@nuogz/i18n';



export const { T, TT } = await initI18N(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
