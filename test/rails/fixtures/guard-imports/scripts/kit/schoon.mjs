// Mag: Node-builtins (met en zonder `node:`) en relatieve imports.
import fs from 'node:fs';
import path from 'path';
import { hulp } from './hulp.mjs';

export const schoon = [fs, path, hulp];
