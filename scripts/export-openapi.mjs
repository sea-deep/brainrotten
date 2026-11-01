import fs from 'node:fs';
import {videoOpenApi} from '../packages/contracts/dist/index.js';
for(const mode of ['local','hosted'])fs.writeFileSync(`apps/web/public/openapi.${mode}.json`,JSON.stringify(videoOpenApi(mode),null,2)+'\n');
