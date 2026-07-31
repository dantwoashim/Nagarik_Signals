import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSubmissionInput, SubmissionInputError } from './submissionInput';

const valid = {
  schemaVersion: 'submission-v2',
  title: '  Loose   drain cover beside a walkway  ',
  description: 'The cover is displaced and leaves an opening beside the pedestrian path.',
  category: 'water',
  observedOn: '2026-07-30',
  mediaReceipt: 'nmr.1.example',
  location: {
    latitudeE6: 27_700_123,
    longitudeE6: 85_312_345,
    wardId: 'ward-1',
    geometryVersion: 'wards-v1',
    localityLabel: '  Central   walkway ',
  },
  acknowledgements: {
    publicInfrastructureOnly: true,
    nonEmergency: true,
    publicationAfterReview: true,
  },
};

test('submission input normalizes user text and enforces civic dates', () => {
  const parsed = parseSubmissionInput(valid, '2026-07-31');
  assert.equal(parsed.title, 'Loose drain cover beside a walkway');
  assert.equal(parsed.location.localityLabel, 'Central walkway');

  assert.throws(
    () => parseSubmissionInput({ ...valid, observedOn: '2026-08-01' }, '2026-07-31'),
    (error: unknown) =>
      error instanceof SubmissionInputError && error.code === 'submission_invalid',
  );
  assert.throws(
    () =>
      parseSubmissionInput(
        {
          ...valid,
          acknowledgements: { ...valid.acknowledgements, nonEmergency: false },
        },
        '2026-07-31',
      ),
    SubmissionInputError,
  );
});
