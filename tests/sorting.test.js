import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory } from '../js/sorting.js';

test('guesses categories from catalog names', () => {
  assert.equal(guessCategory('Brick 2 x 4'), 'Bricks');
  assert.equal(guessCategory('Plate 1 x 2 Jumper'), 'Plates');
  assert.equal(guessCategory('Tile 2 x 2 with Studs on Edge'), 'Tiles');
  assert.equal(guessCategory('Bar 1 x 3 with Clip (Robot Arm)'), 'Brackets, Hinges & Clips');
  assert.equal(guessCategory('Technic Pin with Friction Ridges'), 'Technic');
  assert.equal(guessCategory('Mystery thing'), '');
});
