import {createRequire} from 'node:module';
import {dirname} from 'node:path';

export const resolveProjectRoot = (baseUrl = import.meta.url) => (
  dirname(createRequire(baseUrl).resolve('#cc18-project-root'))
);
