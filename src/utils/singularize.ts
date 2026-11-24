const uncountable = new Set([
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
]);

const irregulars: Record<string, string> = {
  people: 'person',
  children: 'child',
  men: 'man',
  women: 'woman',
};

export function singularize(word: string): string {
  const lower = word.toLowerCase();

  if (uncountable.has(lower)) return word;
  if (irregulars[lower]) return irregulars[lower];

  // matrices → matrix
  if (lower.endsWith('trices')) return word.slice(0, -6) + 'trix';
  // indices → index, vertices → vertex
  if (lower.endsWith('ices')) return word.slice(0, -4) + 'ex';

  if (lower.endsWith('ves')) {
    const stem = word.slice(0, -3);
    // knives → knife, wives → wife
    if (lower.endsWith('ives') || lower.endsWith('aves')) return stem + 'fe';
    // wolves → wolf, halves → half
    return stem + 'f';
  }

  if (lower.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (lower.endsWith('sses')) return word.slice(0, -2);
  if (lower.endsWith('shes')) return word.slice(0, -2);
  if (lower.endsWith('ches')) return word.slice(0, -2);
  if (lower.endsWith('xes')) return word.slice(0, -2);
  if (lower.endsWith('zzes')) return word.slice(0, -3);
  if (lower.endsWith('zes')) return word.slice(0, -2);

  // analyses → analysis, bases → basis
  if (lower.endsWith('ses') && lower.endsWith('yses'))
    return word.slice(0, -3) + 'sis';
  if (lower.endsWith('ses') && lower.endsWith('ases'))
    return word.slice(0, -2) + 'is';
  if (lower.endsWith('ses')) return word.slice(0, -2);

  if (lower.endsWith('ss')) return word;
  if (lower.endsWith('s')) return word.slice(0, -1);

  return word;
}
