import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const layout=readFileSync('app/dashboard/legal/layout.tsx','utf8');
const home=readFileSync('app/dashboard/legal/page.tsx','utf8');
const review=readFileSync('app/dashboard/legal/contratistas-documentos/page.tsx','utf8');
test('contractor-document review stays within Legal layout',()=>{
 assert.match(layout,/href: '\/dashboard\/legal\/contratistas-documentos'/);
 assert.match(home,/\/dashboard\/legal\/contratistas-documentos/);
 assert.match(review,/<CarpetaArranquePage legalContext/);
 assert.doesNotMatch(home,/href="\/dashboard\/sostenibilidad\/prevencion-riesgos\/carpeta-arranque"/);
});
test('Legal navigation prioritizes essential areas and groups others',()=>{
 assert.match(layout,/Navegación principal de Legal/);
 assert.match(layout,/<details/);
 assert.match(layout,/Archivo Legal/);
});

test('imports from Legal stay in Legal navigation',()=>{
 const shared=readFileSync('app/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/page.tsx','utf8');
 const legal=readFileSync('app/dashboard/legal/contratistas-documentos/page.tsx','utf8');
 const importer=readFileSync('app/dashboard/legal/contratistas-documentos/importar/page.tsx','utf8');
 assert.match(shared,/legalContext \? "\/dashboard\/legal\/contratistas-documentos\/importar"/);
 assert.match(legal,/<CarpetaArranquePage legalContext/);
 assert.match(importer,/<CarpetaArranqueImportPage legalContext/);
});
