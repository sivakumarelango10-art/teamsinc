import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAttendanceSessionState, isFounderUser } from '../server/services/liveAttendanceService.js';

describe('Live weekly attendance session state', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');

  it('reports a missing session as not started', () => {
    assert.equal(getAttendanceSessionState(null, now), 'NOT_STARTED');
  });

  it('keeps an open session open before its server expiry', () => {
    assert.equal(
      getAttendanceSessionState({
        status: 'OPEN',
        expires_at: '2026-11-04T12:00:01.000Z'
      }, now),
      'OPEN'
    );
  });

  it('closes an open session at the exact expiry boundary', () => {
    assert.equal(
      getAttendanceSessionState({
        status: 'OPEN',
        expires_at: '2026-11-04T12:00:00.000Z'
      }, now),
      'CLOSED'
    );
  });

  it('keeps an explicitly closed session closed', () => {
    assert.equal(
      getAttendanceSessionState({
        status: 'CLOSED',
        expires_at: '2026-11-04T12:10:00.000Z'
      }, now),
      'CLOSED'
    );
  });

  it('preserves cancellation state', () => {
    assert.equal(
      getAttendanceSessionState({ status: 'CANCELLED' }, now),
      'CANCELLED'
    );
  });

  it('recognizes only the Founder role for live session management', () => {
    assert.equal(isFounderUser({ role: 'FOUNDER' }), true);
    assert.equal(isFounderUser({ role: 'ADMIN' }), false);
    assert.equal(isFounderUser({ role: 'MEMBER' }), false);
    assert.equal(isFounderUser(null), false);
  });
});
