import {rmSync} from 'node:fs';
import {resolve} from 'node:path';

// Next 16 can fail while reading a stale Webpack filesystem cache.
// Only generated build cache is removed; source and data files are untouched.
rmSync(resolve('.next/cache/webpack'),{recursive:true,force:true});
