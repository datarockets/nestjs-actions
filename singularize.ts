export function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('ches')) return word.slice(0, -2);
  if (word.endsWith('xes')) return word.slice(0, -2);
  if (word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}
