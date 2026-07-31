import assert from 'node:assert/strict';
import test from 'node:test';

import { safeAlertWebhookUrl } from './alertEndpoint';

test('alert endpoints require credential-free public HTTPS URLs', () => {
  assert.equal(safeAlertWebhookUrl('https://alerts.example/nagarik')?.hostname, 'alerts.example');
  for (const value of [
    'http://alerts.example/nagarik',
    'https://localhost/alert',
    'https://127.0.0.1/alert',
    'https://[::1]/alert',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/alert',
    'https://alerts.example/nagarik?token=secret',
    'https://user:password@alerts.example/nagarik',
  ]) {
    assert.equal(safeAlertWebhookUrl(value), null);
  }
});
