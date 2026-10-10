import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brickArchitectLabelUrl, labelNumber } from '../js/labels.js';
import { createStore, memoryBackend } from '../js/store.js';

test('Brick Architect label address follows brickarchitect.com/label/<number>.lbx', () => {
  assert.equal(brickArchitectLabelUrl({ partNum: '3009' }), 'https://brickarchitect.com/label/3009.lbx');
  assert.equal(brickArchitectLabelUrl({ partNum: '3069b' }), 'https://brickarchitect.com/label/3069b.lbx');
  assert.equal(brickArchitectLabelUrl({ partNum: '' }), '');
});

test('a part can use a different label number, kept with the part', () => {
  const store = createStore(memoryBackend());
  store.ensurePart('15573');
  assert.equal(labelNumber(store.getPart('15573')), '15573');
  store.savePart('15573', { labelNum: '3794' });
  assert.equal(brickArchitectLabelUrl(store.getPart('15573')), 'https://brickarchitect.com/label/3794.lbx');
  assert.equal(JSON.parse(store.exportJSON()).parts[0].labelNum, '3794');
});
