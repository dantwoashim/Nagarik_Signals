import assert from 'node:assert/strict';
import test from 'node:test';

import { hasRequiredOperatorRole } from './policy';

test('operator role checks are explicit and system administrators are global', () => {
  assert.equal(hasRequiredOperatorRole(['moderator'], ['moderator']), true);
  assert.equal(hasRequiredOperatorRole(['moderator'], ['steward']), false);
  assert.equal(hasRequiredOperatorRole(['system_admin'], ['privacy_reviewer']), true);
  assert.equal(
    hasRequiredOperatorRole(['system_admin'], ['privacy_reviewer'], {
      allowSystemAdminOverride: false,
    }),
    false,
  );
  assert.equal(
    hasRequiredOperatorRole(['privacy_reviewer'], ['privacy_reviewer'], {
      allowSystemAdminOverride: false,
    }),
    true,
  );
  assert.equal(hasRequiredOperatorRole([], ['auditor']), false);
});
