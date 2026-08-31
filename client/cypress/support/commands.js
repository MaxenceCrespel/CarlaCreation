// Logs into the admin area via the real login form and waits for the
// dashboard to render — factored out since most admin specs need this
// as their very first step. Credentials come from Cypress env vars
// (CYPRESS_ADMIN_USERNAME/CYPRESS_ADMIN_PASSWORD) so they match whatever
// account was seeded for this run instead of being hard-coded.
//
// Wrapped in cy.session() so a full spec run does ONE real login (cached
// across every `it()` that calls this, keyed by username+password) instead
// of one per test — the login endpoint has its own tight rate limit
// (10 attempts / 15min, see AuthController) specifically to resist
// brute-forcing, and a growing admin test suite logging in fresh every
// test was enough on its own to trip that limit mid-run.
Cypress.Commands.add('adminLogin', () => {
  const username = Cypress.env('ADMIN_USERNAME') || 'admin';
  const password = Cypress.env('ADMIN_PASSWORD');
  if (!password) {
    throw new Error('CYPRESS_ADMIN_PASSWORD is not set — cannot log in as admin.');
  }

  cy.session(
    ['admin', username, password],
    () => {
      cy.visit('/admin');
      cy.get('#username').type(username);
      cy.get('#password').type(password, { log: false });
      cy.contains('button', 'Se connecter').click();
      cy.contains('h1', 'Administration').should('be.visible');
    },
    {
      validate() {
        cy.request('/api/admin/services').its('status').should('eq', 200);
      },
    },
  );
  cy.visit('/admin');
  cy.contains('h1', 'Administration').should('be.visible');
});
