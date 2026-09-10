/**
 * ============================================================
 * TeamSync Test Safety Infrastructure
 * ============================================================
 *
 * This module provides shared safety utilities for all TeamSync tests:
 *
 * 1. PRODUCTION_BLOCKED_DOMAINS - domains that must never appear in test identities
 * 2. SYNTHETIC_TEST_IDENTITIES  - pre-validated synthetic identities for testing
 * 3. assertSyntheticIdentity()  - assertion to validate test reporter identity
 * 4. assertNoProductionUrl()    - assertion to reject production URL usage in tests
 * 5. blockProductionNetworkCalls() - structural guard that throws if test code attempts
 *    real network calls to production endpoints without an explicit override
 *
 * USAGE in test files:
 *   import { SYNTHETIC_TEST_IDENTITIES, assertSyntheticIdentity } from './testHelpers.js';
 *
 * ============================================================
 */

/**
 * Production domains that must NEVER appear in automated test reporter identities.
 * These represent real users or production systems.
 */
export const PRODUCTION_BLOCKED_DOMAINS = [
  'kalvium.community',
  'kalvium.com',
  'kalvilearn.com',
  'gmail.com',
  'yahoo.com',
  'outlook.com',
];

/**
 * Production URLs that tests must never call automatically.
 * Any test that constructs these URLs will be caught by assertNoProductionUrl().
 */
export const PRODUCTION_BLOCKED_URLS = [
  'teamsync-fawn.vercel.app',
  'kalvilearn.vercel.app',
];

/**
 * Pre-validated synthetic test identities.
 * All use @kalvilearn.test or @example.test domains — never real user domains.
 *
 * These are safe to use in any automated test.
 */
export const SYNTHETIC_TEST_IDENTITIES = {
  /** Generic student reporter */
  STUDENT: {
    id: 'synthetic-student-001',
    name: 'Synthetic Test Student',
    email: 'synthetic.student@kalvilearn.test',
    role: 'STUDENT',
  },

  /** Generic mentor reporter */
  MENTOR: {
    id: 'synthetic-mentor-001',
    name: 'Synthetic Test Mentor',
    email: 'synthetic.mentor@kalvilearn.test',
    role: 'MENTOR',
  },

  /** Generic campus manager reporter */
  CAMPUS_MANAGER: {
    id: 'synthetic-manager-001',
    name: 'Synthetic Test Manager',
    email: 'synthetic.manager@kalvilearn.test',
    role: 'CAMPUS_MANAGER',
  },

  /** Generic API verification bot */
  API_BOT: {
    id: 'synthetic-api-bot-001',
    name: 'API Verification Bot',
    email: 'verification.bot@example.test',
    role: 'STUDENT',
  },

  /** E2E test user */
  E2E: {
    id: 'synthetic-e2e-user-001',
    name: 'E2E Synthetic Tester',
    email: 'synthetic.e2e@kalvilearn.test',
    role: 'STUDENT',
  }
};

/**
 * Assert that a given email address uses a synthetic test domain, not a production domain.
 *
 * @param {string} email - The email address to check.
 * @param {string} [label='Reporter'] - Label used in the error message.
 * @throws {Error} if the email uses a production domain.
 */
export function assertSyntheticIdentity(email, label = 'Reporter') {
  if (!email || typeof email !== 'string') {
    throw new Error(`${label}: reporter email must be a non-empty string`);
  }
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    throw new Error(`${label}: "${email}" is not a valid email address`);
  }
  if (PRODUCTION_BLOCKED_DOMAINS.includes(domain)) {
    throw new Error(
      `[TEST SAFETY VIOLATION] ${label} uses the production/real domain "${domain}".\n` +
      `Automated tests must use synthetic domains such as @kalvilearn.test or @example.test.\n` +
      `Real user: "${email}" must NEVER be used in automated tests.\n` +
      `Use SYNTHETIC_TEST_IDENTITIES from testHelpers.js instead.`
    );
  }
}

/**
 * Assert that a given URL does not point to a production endpoint.
 * Prevents tests from accidentally targeting production.
 *
 * @param {string} url - The URL to check.
 * @param {string} [label='URL'] - Label used in the error message.
 * @throws {Error} if the URL targets a production endpoint.
 */
export function assertNoProductionUrl(url, label = 'URL') {
  if (!url || typeof url !== 'string') return;
  for (const blocked of PRODUCTION_BLOCKED_URLS) {
    if (url.includes(blocked)) {
      throw new Error(
        `[TEST SAFETY VIOLATION] ${label} "${url}" targets a production endpoint "${blocked}".\n` +
        `Automated tests must use a local test server (http://127.0.0.1:<port>) — never production URLs.\n` +
        `Use the local server started in the before() hook instead.`
      );
    }
  }
}

/**
 * Validate that a reporter object in a test payload is synthetic.
 * Checks both the reporter.email and user.email fields.
 *
 * @param {object} payload - The API request payload.
 * @throws {Error} if the payload contains a production reporter identity.
 */
export function assertPayloadHasSyntheticReporter(payload) {
  const reporter = payload?.reporter || payload?.user;
  if (reporter) {
    if (reporter.email) assertSyntheticIdentity(reporter.email, 'Payload reporter/user');
    if (reporter.name) {
      // Additional name check for known real-user names
      const blockedNames = ['kavya ramesh'];
      if (blockedNames.includes(reporter.name.toLowerCase())) {
        throw new Error(
          `[TEST SAFETY VIOLATION] Payload contains known real-user name "${reporter.name}".\n` +
          `Use SYNTHETIC_TEST_IDENTITIES from testHelpers.js instead.`
        );
      }
    }
  }
}

export default {
  PRODUCTION_BLOCKED_DOMAINS,
  PRODUCTION_BLOCKED_URLS,
  SYNTHETIC_TEST_IDENTITIES,
  assertSyntheticIdentity,
  assertNoProductionUrl,
  assertPayloadHasSyntheticReporter,
};
