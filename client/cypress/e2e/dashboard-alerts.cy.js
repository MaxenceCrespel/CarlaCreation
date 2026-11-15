// Rendez-vous passé et confirmé, jamais marqué « terminé » : le tableau de
// bord le signale et permet de le régulariser d'un clic.
describe('Admin — alertes du tableau de bord', () => {
  it('flags a past confirmed booking, then clears it once marked completed', () => {
    const clientName = `Cypress Alerte ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Réservations').click();
    cy.contains('button', '+ Ajouter une réservation').click();
    cy.get('#manual-service').click();
    cy.get('.service-picker-item').first().click();
    cy.get('#manual-date').type('2020-03-10');
    cy.get('#manual-time').type('10:00');
    cy.get('#manual-name').type(clientName);
    cy.get('#manual-email').type('cypress-alerte@example.com');
    cy.get('#manual-phone').type('0600000043');
    cy.contains('form button', 'Ajouter la réservation').click();

    // Même alerte sur l'écran « Aujourd'hui » du téléphone.
    cy.viewport('iphone-x');
    cy.visit('/admin');
    cy.get('.m-alert').should('contain', clientName).and('contain', 'pas marqué terminé');
    cy.viewport(1280, 720);
    cy.visit('/admin');

    cy.contains('button.admin-nav-link', 'Tableau de bord').click();
    cy.contains('.reservation-alert', clientName).within(() => {
      cy.contains('pas encore marqué terminé');
      cy.contains('button', 'Marquer terminé').click();
    });
    cy.contains('.reservation-alert', clientName).should('not.exist');

    // Nettoyage : suppression depuis l'onglet Réservations.
    cy.contains('button.admin-nav-link', 'Réservations').click();
    cy.get('#status-filter').select('Toutes');
    cy.contains('tr', clientName).within(() => {
      cy.contains('button', 'Supprimer').click();
    });
    cy.contains('button', 'Supprimer définitivement').click();
    cy.contains('tr', clientName).should('not.exist');
  });
});
