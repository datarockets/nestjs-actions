import { singularize } from './singularize';

describe('singularize', () => {
  it.each([
    ['threads', 'thread'],
    ['stories', 'story'],
    ['categories', 'category'],
    ['addresses', 'address'],
    ['classes', 'class'],
    ['dishes', 'dish'],
    ['matches', 'match'],
    ['boxes', 'box'],
    ['quizzes', 'quiz'],
    ['wolves', 'wolf'],
    ['knives', 'knife'],
    ['halves', 'half'],
    ['wives', 'wife'],
    ['indices', 'index'],
    ['matrices', 'matrix'],
    ['analyses', 'analysis'],
    ['bases', 'basis'],
    ['people', 'person'],
    ['children', 'child'],
    ['men', 'man'],
    ['women', 'woman'],
  ])('%s → %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });

  it.each([
    'data',
    'media',
    'criteria',
    'status',
    'bus',
    'campus',
    'virus',
    'corpus',
    'genus',
    'apparatus',
    'access',
    'address',
  ])('returns uncountable word "%s" as-is', (word) => {
    expect(singularize(word)).toBe(word);
  });

  it('returns non-plural words as-is', () => {
    expect(singularize('thread')).toBe('thread');
  });
});
