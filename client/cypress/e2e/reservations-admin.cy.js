function addManual(clientName, time) {
  cy.contains('button', '+ Ajouter une réservation').click();
  cy.get('#manual-service').click();
  cy.get('.service-picker-item').first().click();
  cy.get('#manual-date').type('2099-06-15');
  cy.get('#manual-time').type(time);
  cy.get('#manual-name').type(clientName);
  cy.get('#manual-email').type('cypress-manuel@example.com');
  cy.get('#manual-phone').type('0600000042');
  cy.contains('form button', 'Ajouter la réservation').click();
}

function refuseAndDelete(clientName) {
  cy.contains('tr', clientName).within(() => {
    cy.contains('button', 'Refuser').click();
    cy.confirmDialog();
  });
  // Refused rows drop out of the default "Confirmées" filter — switch to
  // "Toutes" to find it again for cleanup.
  cy.get('#status-filter').select('Toutes');
  cy.contains('tr', clientName).within(() => {
    cy.contains('button', 'Supprimer').click();
  });
  cy.contains('button', 'Supprimer définitivement').click();
  cy.contains('tr', clientName).should('not.exist');
}

describe('Admin — Réservations (création manuelle)', () => {
  it('logs a manual booking, refuses it, then deletes it', () => {
    const clientName = `Cypress Manuel ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Réservations').click();
    addManual(clientName, '10:00');

    cy.contains('tr', clientName).should('be.visible');
    refuseAndDelete(clientName);
  });

  it('never refuses an overlap: asks for confirmation, then books anyway', () => {
    const first = `Cypress Premier ${Date.now()}`;
    const second = `Cypress Second ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Réservations').click();
    addManual(first, '10:00');
    cy.contains('tr', first).should('be.visible');

    addManual(second, '10:00');
    cy.get('[role="alertdialog"]').within(() => {
      cy.contains('chevauche');
      cy.contains(first);
      cy.contains('button', 'Confirmer malgré le chevauchement').click();
    });
    cy.contains('tr', second).should('be.visible');

    refuseAndDelete(second);
    cy.get('#status-filter').select('Confirmées');
    refuseAndDelete(first);
  });
});
