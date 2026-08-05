import assert from 'node:assert/strict';
import test from 'node:test';

import { transformBipadAlert, transformBipadIncident } from './officialAlerts';

const now = new Date('2026-08-05T05:00:00.000Z');

test('DOR alert exposes only public-safe closure fields', () => {
  const result = transformBipadAlert(
    {
      id: 45330,
      title: 'Road closed in Bharatpur-29, Chitwan',
      point: { type: 'Point', coordinates: [84.4868, 27.8207] },
      createdOn: '2026-08-05T07:45:04.579864+05:45',
      startedOn: '2026-08-05T07:00:00+05:45',
      expireOn: '2026-08-05T09:45:03.916647+05:45',
      source: 'dor',
      verified: true,
      public: true,
      referenceData: JSON.stringify([
        {
          fields: {
            location: 'Bharatpur-29, Chitwan',
            status: 'CLOSED',
            closure_reason: 'Landslide',
            road_refno: 'NH44',
            contact_person: 'private contact must not escape',
          },
        },
      ]),
    },
    now,
  );
  assert.equal(result?.kind, 'road_closure');
  assert.equal(result?.longitude, 84.487);
  assert.doesNotMatch(JSON.stringify(result), /private contact/i);
});

test('unverified and stale alerts are rejected', () => {
  assert.equal(
    transformBipadAlert(
      {
        id: 1,
        point: { coordinates: [85.3, 27.7] },
        createdOn: '2026-08-01T00:00:00Z',
        source: 'dor',
        verified: false,
        public: true,
      },
      now,
    ),
    null,
  );
});

test('verified public-area incidents retain rounded location and source boundary', () => {
  const result = transformBipadIncident(
    {
      id: 92624,
      title: 'Flood at Tuteshwor Forest, Bardibas Municipality-5',
      streetAddress: 'Tuteshwor Forest',
      point: { coordinates: [85.85261335, 27.05885809] },
      createdOn: '2026-08-05T09:45:04.149599+05:45',
      reportedOn: '2026-08-05T09:02:58+05:45',
      verified: true,
      approved: true,
    },
    now,
  );
  assert.equal(result?.latitude, 27.059);
  assert.equal(result?.status, 'reported');
  assert.match(result?.summary ?? '', /No physical follow-up/);
});
