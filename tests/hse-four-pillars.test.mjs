import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync('app/dashboard/sostenibilidad/page.tsx','utf8');
test('dashboard retains all four established pillars',()=>{for(const name of ['HSE / Prevención de Riesgos','Medio Ambiente','Comunidades','Proyectos de Sostenibilidad']) assert.match(source,new RegExp(name));assert.match(source,/Qué requiere atención/);});
