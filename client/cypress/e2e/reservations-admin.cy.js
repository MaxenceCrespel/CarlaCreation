describe('Admin — Réservations (création manuelle)', () => {
  it('logs a manual booking, refuses it, then deletes it', () => {
    const clientName = `Cypress Manuel ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Réservations').click();
    cy.contains('button', '+ Ajouter une réservation').click();

    cy.get('#manual-service').select(1);
    cy.get('#manual-date').type('2099-06-15');
    cy.get('#manual-time').type('10:00');
    cy.get('#manual-name').type(clientName);
    cy.get('#manual-email').type('cypress-manuel@example.com');
    cy.get('#manual-phone').type('0600000042');
    cy.contains('form button', 'Ajouter la réservation').click();

    cy.contains('tr', clientName).should('be.visible');

    cy.contains('tr', clientName).within(() => {
      cy.contains('button', 'Refuser').click();
    });

    // Refused rows drop out of the default "Confirmées" filter — switch to
    // "Toutes" to find it again for cleanup.
    cy.get('#status-filter').select('Toutes');
    cy.contains('tr', clientName).within(() => {
      cy.contains('button', 'Supprimer').click();
    });
    cy.contains('button', 'Supprimer définitivement').click();
    cy.contains('tr', clientName).should('not.exist');
  });
});
