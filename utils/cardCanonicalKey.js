const normalizePart = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  // Spaces and cosmetic punctuation must not create separate logical cards.
  .replace(/[^a-z0-9]+/g, '');

export const normalizeCardName = normalizePart;

export const buildCardCanonicalKey = (owner, name) => {
  const normalizedOwner = normalizePart(owner);
  const normalizedName = normalizeCardName(name);
  if (!normalizedOwner || !normalizedName) return null;
  return `${normalizedOwner}__${normalizedName}`;
};

// Preferred public name for the runtime logical identity. Keep the old export for
// the read-only audit script and backwards compatibility.
export const buildCardLogicalKey = buildCardCanonicalKey;
