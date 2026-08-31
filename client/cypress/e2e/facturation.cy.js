describe('Admin — Facturation', () => {
  it('creates an invoice, marks it paid, then deletes it', () => {
    const clientName = `Cypress Facture ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Facturation').click();

    cy.contains('button', '+ Nouvelle facture').click();
    cy.get('#invoice-client-name').type(clientName);
    cy.get('input[placeholder="Description"]').first().type('Coupe et brushing');
    cy.get('input[title="Prix unitaire (€)"]').first().clear().type('50');
    cy.contains('form button', 'Créer la facture').click();

    cy.contains('tr', clientName).should('be.visible').and('contain', 'Non payée');

    cy.contains('tr', clientName).within(() => {
      cy.get('input[placeholder="Moyen de paiement"]').type('Espèces');
      cy.contains('button', 'Marquer payée').click();
    });
    cy.contains('tr', clientName).should('contain', 'Payée');

    cy.contains('tr', clientName).within(() => {
      cy.contains('button', 'Supprimer').click();
    });
    cy.contains('tr', clientName).should('not.exist');
  });
});
