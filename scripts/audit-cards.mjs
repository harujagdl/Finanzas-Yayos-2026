#!/usr/bin/env node
import fs from 'node:fs';
import { buildCardCanonicalKey } from '../utils/cardCanonicalKey.js';

const REFERENCE_FIELDS = ['cardId', 'targetCardId', 'creditCardId', 'accountId'];
const NAME_FIELDS = ['card', 'cardName', 'targetCardName'];
const CARD_FIELDS = ['name', 'owner', 'createdAt', 'updatedAt', 'balance', 'limit', 'cutDay', 'closingDay', 'payDay', 'dueDay', 'cycleMode', 'payGoal', 'last4'];

const parseArgs = (argv) => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') result.input = argv[++i];
    else if (argv[i] === '--output') result.output = argv[++i];
    else throw new Error(`Argumento no soportado: ${argv[i]}`);
  }
  if (!result.input) throw new Error('Uso: node scripts/audit-cards.mjs --input <export.json> [--output <report.json>]');
  return result;
};

const unwrap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if (value.mapValue) return unwrapFields(value.mapValue.fields || {});
  if (value.arrayValue) return (value.arrayValue.values || []).map(unwrap);
  return value;
};
const unwrapFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, unwrap(value)]));

const normalizeDocument = (document, collectionName) => {
  if (document?.fields && document?.name) {
    return { id: document.name.split('/').pop(), ...unwrapFields(document.fields), _collection: collectionName };
  }
  return { ...document, id: document.id || document._id, _collection: collectionName };
};

export const normalizeExport = (raw) => {
  const source = raw.collections || raw;
  return Object.fromEntries(Object.entries(source).map(([name, value]) => {
    const docs = Array.isArray(value) ? value : value?.documents || [];
    return [name, docs.map((doc) => normalizeDocument(doc, name))];
  }));
};

const meaningful = (value) => value !== null && value !== undefined && value !== '';
const timestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const referencesFor = (collections, card) => {
  const byCollection = {};
  const details = [];
  const nameOnly = [];
  for (const [collection, documents] of Object.entries(collections)) {
    if (collection === 'cards') continue;
    for (const document of documents) {
      const matchedFields = REFERENCE_FIELDS.filter((field) => document[field] === card.id);
      if (matchedFields.length) {
        byCollection[collection] = (byCollection[collection] || 0) + 1;
        details.push({ collection, documentId: document.id, fields: matchedFields });
      } else {
        const matchingNames = NAME_FIELDS.filter((field) => meaningful(document[field]) && buildCardCanonicalKey(document.owner || card.owner, document[field]) === card.canonicalKey);
        if (matchingNames.length) nameOnly.push({ collection, documentId: document.id, fields: matchingNames });
      }
    }
  }
  return { total: details.length, byCollection, details, nameOnly };
};

const conflictsFor = (cards) => CARD_FIELDS.filter((field) => {
  const values = new Set(cards.map((card) => JSON.stringify(card[field])).filter((value) => value !== undefined));
  return values.size > 1;
});

export const auditCards = (collections) => {
  const cards = (collections.cards || []).map((card) => ({ ...card, canonicalKey: buildCardCanonicalKey(card.owner, card.name) }));
  const invalidCards = cards.filter((card) => !card.id || !card.canonicalKey).map((card) => card.id || null);
  const buckets = new Map();
  cards.filter((card) => card.id && card.canonicalKey).forEach((card) => {
    if (!buckets.has(card.canonicalKey)) buckets.set(card.canonicalKey, []);
    buckets.get(card.canonicalKey).push(card);
  });

  const duplicateGroups = [...buckets.entries()].filter(([, group]) => group.length > 1).map(([canonicalKey, group]) => {
    const documents = group.map((card) => ({ ...card, references: referencesFor(collections, card) }));
    const conflicts = conflictsFor(documents);
    const ranked = [...documents].sort((a, b) =>
      b.references.total - a.references.total ||
      CARD_FIELDS.filter((field) => meaningful(b[field])).length - CARD_FIELDS.filter((field) => meaningful(a[field])).length ||
      timestamp(a.createdAt) - timestamp(b.createdAt)
    );
    const first = ranked[0];
    const second = ranked[1];
    const decisiveReferences = first.references.total > second.references.total;
    const safe = conflicts.length === 0 && decisiveReferences;
    return {
      canonicalKey,
      status: safe ? 'SAFE_TO_MERGE' : 'REQUIRES_MANUAL_REVIEW',
      proposedCanonicalCardId: safe ? first.id : null,
      proposedMapping: safe ? Object.fromEntries(ranked.slice(1).map((card) => [card.id, first.id])) : {},
      conflicts,
      documents
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'AUDIT_READ_ONLY',
    summary: {
      totalCards: cards.length,
      logicalUniqueCards: buckets.size,
      duplicateGroups: duplicateGroups.length,
      documentsProposedForMerge: duplicateGroups.reduce((sum, group) => sum + Object.keys(group.proposedMapping).length, 0),
      invalidCards: invalidCards.length
    },
    invalidCardIds: invalidCards,
    duplicateGroups
  };
};

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const collections = normalizeExport(JSON.parse(fs.readFileSync(args.input, 'utf8')));
    const report = auditCards(collections);
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (args.output) fs.writeFileSync(args.output, output, { flag: 'wx' });
    else process.stdout.write(output);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
