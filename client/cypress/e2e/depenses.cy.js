describe('Admin — Dépenses', () => {
  it('adds an expense, sees it listed, then deletes it', () => {
    const description = `Cypress Dépense ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Dépenses').click();

    cy.contains('button', '+ Ajouter une dépense').click();
    cy.get('#expense-date').type('2026-01-15');
    cy.get('#expense-category').type('Produits');
    cy.get('#expense-amount').type('45.90');
    cy.get('#expense-description').type(description);
    cy.contains('form button', 'Ajouter').click();

    // The description cell is an editable <input> — read the DOM value
    // directly rather than relying on jQuery :contains() text matching,
    // which proved unreliable against nested input values here.
    cy.get('.admin-table input').should(($inputs) => {
      expect($inputs.toArray().some((el) => el.value === description)).to.be.true;
    });
    cy.get('.admin-table input').then(($inputs) => {
      const match = $inputs.toArray().find((el) => el.value === description);
      cy.wrap(match).closest('tr').within(() => {
        cy.contains('button', 'Supprimer').click();
      });
    });
    cy.get('body').should(($body) => {
      const inputs = $body.find('.admin-table input').toArray();
      expect(inputs.some((el) => el.value === description)).to.be.false;
    });
  });
});
