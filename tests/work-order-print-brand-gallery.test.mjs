import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('components/maintenance/work-order-execution-panel.tsx','utf8');
test('OT print retains official branding and highlighted register',()=>{
 assert.match(source,/la-patagua-official\.svg/);
 assert.match(source,/motil-wordmark\.png/);
 assert.match(source,/ot-print-registry/);
 assert.match(source,/print-color-adjust/);
});
test('OT print includes every signed evidence image with 2 large and rest thumbnails',()=>{
 assert.doesNotMatch(source,/\.filter\(\(photo:.*\.slice\(0, 2\)/);
 assert.match(source,/reportPhotos\.slice\(0, 2\)/);
 assert.match(source,/reportPhotos\.slice\(2\)/);
 assert.match(source,/ot-print-thumbs/);
 assert.match(source,/img\.decode\(\)/);
});

test('A4 photographic evidence uses enlarged print slots',()=>{assert.match(source,/height: 250px !important/);assert.match(source,/height: 125px !important/);assert.match(source,/ot-print-thumbs mt-3 grid grid-cols-3/);});


test('OT print uses refreshed web-safe photo previews instead of expiring raw HEIC urls',()=>{
 assert.match(source,/refreshInterval: 10 \* 60 \* 1000/);
 assert.match(source,/revalidateOnFocus: true/);
 assert.match(source,/revalidateOnReconnect: true/);
 assert.match(source,/photo\.preview_url \|\| photo\.signed_url \|\| null/);
});
