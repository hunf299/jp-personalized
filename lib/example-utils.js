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
  const frontMap = new Map();

  list.forEach((card) => {
    if (!card) return;
    const frontKey = normalizeKey(card.front);
    if (!frontKey) return;
    const typeStr = String(card.type || '').toLowerCase();
    const entry = {
      id: card.id != null ? card.id : null,
      front: card.front ?? '',
      back: card.back ?? '',
      type: card.type || null,
    };
    const isExampleType = typeStr.includes('example') || typeStr.includes('sentence');
    if (!frontMap.has(frontKey) || isExampleType) {
      frontMap.set(frontKey, entry);
    }
  });

  const byCardId = {};
  const refsByCardId = {};
  list.forEach((card) => {
    if (!card || card.id == null) return;
    const refs = parseExampleRefs(card.example);
    if (!refs.length) return;
    refsByCardId[String(card.id)] = refs;
    const matches = refs
        .map((ref) => frontMap.get(normalizeKey(ref)))
        .filter(Boolean);
    if (matches.length) {
      byCardId[String(card.id)] = matches;
    }
  });

  return {
    byCardId,
    refsByCardId,
    pool: chooseExamplePool(frontMap),
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
