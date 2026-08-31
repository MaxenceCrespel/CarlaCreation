describe('Admin — Clients', () => {
  it('creates a client fiche, finds it via search, adds a note, then deletes it', () => {
    const name = `Cypress Client ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Clients').click();

    cy.contains('button', '+ Ajouter un client').click();
    cy.get('#client-add-name').type(name);
    cy.get('#client-add-phone').type('0611223344');
    cy.contains('form button', 'Créer la fiche').click();

    cy.contains('tr', name).should('be.visible');

    // Search narrows the list down to this fiche
    cy.get('#client-search').type(name);
    cy.contains('tr', name).should('be.visible');

    cy.contains('tr', name).within(() => {
      cy.contains('button', 'Voir la fiche').click();
    });
    cy.get('#client-detail-notes').type('A fait un balayage, très satisfaite.');
    cy.contains('button', 'Enregistrer').click();
    // Saving already closes the modal (onUpdated clears the selection) —
    // no separate "Fermer" click needed.
    cy.contains('.modal-card', 'Fiche client').should('not.exist');

    cy.contains('tr', name).within(() => {
      cy.contains('button', 'Voir la fiche').click();
    });
    cy.contains('button', 'Supprimer la fiche').click();
    cy.contains('tr', name).should('not.exist');
  });
});
