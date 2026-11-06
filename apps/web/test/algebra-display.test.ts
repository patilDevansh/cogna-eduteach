import { it } from 'node:test';
import assert from 'node:assert/strict';
import { prettyAlgebra } from '../src/components/games/pretty-algebra';
it('renders all nonnegative integer powers without changing values', () => {
  assert.equal(prettyAlgebra('9x^4 - 12x^5 + 6x^6'), '9x⁴ − 12x⁵ + 6x⁶');
  assert.equal(prettyAlgebra('x^10 + x^0'), 'x¹⁰ + x⁰');
});
