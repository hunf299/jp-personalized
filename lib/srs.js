export class Flashcard { constructor(o){ Object.assign(this, o||{}); } }
export class KanjiCard { constructor(o){ Object.assign(this, o||{}); } }
export class GrammarRule { constructor(o){ Object.assign(this, o||{}); } }
export function updateCard(card, quality){ return { ...card, lastQuality: quality }; }
export function generateRadicalExercises(n){ return [{ prompt: 'Tìm Kanji có bộ 木' }]; }
export function getRelatedGrammarRules(rules, id){
  const me = rules.find(r=>r.id===id);
  return rules.filter(r=> r.baseForm && me && r.baseForm===me.baseForm && r.id!==id);
}
