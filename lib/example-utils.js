export function parseExampleRefs(raw) {
  if (Array.isArray(raw)) {
    return raw
        .map((item) => (item == null ? '' : String(item).trim()))
        .filter(Boolean);
  }
  if (raw == null) return [];
  const str = String(raw).trim();
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed
          .map((item) => (item == null ? '' : String(item).trim()))
          .filter(Boolean);
    }
  } catch (e) {
    // ignore JSON parse errors
  }
  return str
      .split(/\r?\n|[|,;\t]/)
      .map((item) => item.trim())
      .filter(Boolean);
}

function normalizeKey(value) {
  return value == null ? '' : String(value).trim();
}

function chooseExamplePool(frontMap) {
  const unique = new Map();
  frontMap.forEach((entry) => {
    if (!entry) return;
    const key = entry.id != null ? String(entry.id) : `${entry.front}__${entry.back}`;
    if (!unique.has(key)) unique.set(key, entry);
  });
  return Array.from(unique.values());
}

export function createExampleLookup(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const exampleByFront = new Map();
  const exampleById = new Map();
  const exampleEntries = [];

  list.forEach((card) => {
    if (!card) return;
    const entry = {
      id: card.id != null ? card.id : null,
      front: card.front ?? '',
      back: card.back ?? '',
      spell: card.spell ?? '',
      type: card.type || null,
    };
    const typeStr = String(card.type || '').toLowerCase();
    const isExampleType = typeStr.includes('example') || typeStr.includes('sentence');
    if (!isExampleType) return;

    exampleEntries.push(entry);

    const idKey = entry.id != null ? String(entry.id) : null;
    if (idKey && !exampleById.has(idKey)) {
      exampleById.set(idKey, entry);
    }

    const frontKey = normalizeKey(entry.front);
    if (frontKey && !exampleByFront.has(frontKey)) {
      exampleByFront.set(frontKey, entry);
    }
  });

  const byCardId = {};
  const refsByCardId = {};

  const findExample = (ref) => {
    const normalized = normalizeKey(ref);
    if (!normalized) return null;

    if (exampleById.has(normalized)) {
      return exampleById.get(normalized);
    }

    const strippedId = normalized.replace(/^id:/i, '').trim();
    if (strippedId && exampleById.has(strippedId)) {
      return exampleById.get(strippedId);
    }

    if (exampleByFront.has(normalized)) {
      return exampleByFront.get(normalized);
    }

    const lower = normalized.toLowerCase();
    for (const [key, value] of exampleByFront.entries()) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }

    return null;
  };

  list.forEach((card) => {
    if (!card || card.id == null) return;
    const refs = parseExampleRefs(card.example);
    if (!refs.length) return;
    const idKey = String(card.id);
    refsByCardId[idKey] = refs;
    const matches = refs
        .map((ref) => findExample(ref))
        .filter(Boolean);
    if (matches.length) {
      byCardId[idKey] = matches;
    }
  });

  return {
    byCardId,
    refsByCardId,
    pool: chooseExamplePool(exampleEntries),
  };
}

export function exampleKey(example) {
  if (!example) return null;
  if (example.id != null) return `id:${example.id}`;
  const front = normalizeKey(example.front);
  const back = normalizeKey(example.back);
  if (front || back) return `text:${front}|${back}`;
  return null;
}
