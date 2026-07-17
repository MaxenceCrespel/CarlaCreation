// Logs into the admin area via the real login form and waits for the
// dashboard to render — factored out since most admin specs need this
// as their very first step. Credentials come from Cypress env vars
// (CYPRESS_ADMIN_USERNAME/CYPRESS_ADMIN_PASSWORD) so they match whatever
// account was seeded for this run instead of being hard-coded.
Cypress.Commands.add('adminLogin', () => {
  const username = Cypress.env('ADMIN_USERNAME') || 'admin';
  const password = Cypress.env('ADMIN_PASSWORD');
  if (!password) {
    throw new Error('CYPRESS_ADMIN_PASSWORD is not set — cannot log in as admin.');
  }

  cy.visit('/admin');
  cy.get('#username').type(username);
  cy.get('#password').type(password, { log: false });
  cy.contains('button', 'Se connecter').click();
  cy.contains('h1', 'Administration').should('be.visible');
});
