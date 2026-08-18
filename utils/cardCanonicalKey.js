const normalizePart = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const normalizeCardName = normalizePart;

export const buildCardCanonicalKey = (owner, name) => {
  const normalizedOwner = normalizePart(owner);
  const normalizedName = normalizeCardName(name);
  if (!normalizedOwner || !normalizedName) return null;
  return `${normalizedOwner}__${normalizedName}`;
};
