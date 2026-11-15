// Fixed test accounts in the development User Pool (docs/decisions/2026-11-15-test-accounts.md, #157).
// The password is KUSAKARI_TEST_PASSWORD in kusakari-terraform/.env.test-accounts. E2E tests that use the E2E database
// change these members' account types per test with prepareMember (business-helpers.js).
export const USER_EMAIL = 'user01@example.com';
export const MANAGER_EMAIL = 'manager01@example.com';
export const ADMIN_EMAIL = 'admin01@example.com';
