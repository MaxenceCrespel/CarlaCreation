describe('Admin login', () => {
  it('rejects an incorrect password', () => {
    cy.visit('/admin');
    cy.get('#username').type('admin');
    cy.get('#password').type('definitely-the-wrong-password');
    cy.contains('button', 'Se connecter').click();
    cy.get('.form-feedback.error').should('be.visible');
  });

  it('logs in with valid credentials and shows the reservations tab', () => {
    cy.adminLogin();
    cy.contains('button.admin-tab', 'Réservations').should('have.class', 'is-active');
  });
});
