import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const file of ['firebase/firestore.rules','firebase/firestore.maintenance.rules']) {
  test(`${file} protege installment_plans por owner`,()=>{
    const rules=readFileSync(file,'utf8');
    const block=rules.match(/match \/installment_plans\/\{id\} \{([\s\S]*?)\n    \}/)?.[1]||'';
    assert.match(block,/allow read: if canRead(?:Maintenance)?\(\)/);
    assert.match(block,/allow create: if canCreate\(\)/);
    assert.match(block,/allow (?:update, delete: if canUpdateOrDelete\(\)|update: if canUpdateOrDeleteStrict\(\) \|\| canClaimLegacyOwner\(\);[\s\S]*allow delete: if canUpdateOrDeleteStrict\(\))/);
    assert.doesNotMatch(rules,/allow read, write: if true/);
  });
}
