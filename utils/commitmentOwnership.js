const clampPercentage = (value) => Math.min(100, Math.max(0, Number(value)));

const hasValidPercentage = (value) => value !== ''
  && value != null
  && Number.isFinite(Number(value))
  && Number(value) > 0
  && Number(value) <= 100;

/**
 * Resolves ownership from the commitment itself. Card data, merchant names and
 * the document owner (`yair`/`haru`) are deliberately not consulted.
 */
export function resolveCommitmentOwnership(commitment = {}) {
  const explicitType = commitment.ownershipType === 'personal' || commitment.ownershipType === 'shared'
    ? commitment.ownershipType
    : null;
  const legacyShared = commitment.scope === 'shared'
    || commitment.owner === 'both'
    || commitment.shared === true
    || commitment.isShared === true;
  const legacyPersonal = commitment.scope === 'personal'
    || commitment.shared === false
    || commitment.isShared === false;
  const ownershipType = explicitType || (legacyShared ? 'shared' : legacyPersonal ? 'personal' : 'unknown');

  if(ownershipType === 'personal') {
    return {
      ownershipType,
      ownerSharePercentage: 100,
      effectiveMultiplier: 1,
      ownershipSource: explicitType ? 'ownershipType' : 'legacy-personal',
      needsClassification: false
    };
  }

  if(ownershipType === 'shared') {
    const percentageFields = ['ownerSharePercentage', 'splitPercentage'];
    const percentageField = percentageFields.find((field) => hasValidPercentage(commitment[field]));
    const percentage = percentageField ? clampPercentage(commitment[percentageField]) : 50;
    return {
      ownershipType,
      ownerSharePercentage: percentage,
      effectiveMultiplier: percentage / 100,
      ownershipSource: percentageField
        ? (explicitType ? `ownershipType+${percentageField}` : `legacy-shared+${percentageField}`)
        : (explicitType ? 'ownershipType+shared-fallback-50' : 'legacy-shared-fallback-50'),
      needsClassification: false
    };
  }

  return {
    ownershipType: 'unknown',
    ownerSharePercentage: null,
    effectiveMultiplier: null,
    ownershipSource: 'missing',
    needsClassification: true
  };
}
