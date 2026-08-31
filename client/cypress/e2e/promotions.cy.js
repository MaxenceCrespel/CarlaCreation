describe('Admin — Promotions', () => {
  it('adds a rate-based promotion, sees it listed, then deletes it', () => {
    const label = `Cypress Promo ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Promotions').click();

    cy.contains('button', '+ Ajouter une promotion').click();
    cy.get('#promo-label').type(label);
    cy.get('#promo-percent').clear().type('15');
    cy.contains('form button', 'Ajouter').click();

    // The label cell is an editable <input> — read the DOM value directly
    // rather than relying on jQuery :contains() text matching, which
    // proved unreliable against nested input values here.
    cy.get('.admin-table input').should(($inputs) => {
      expect($inputs.toArray().some((el) => el.value === label)).to.be.true;
    });
    cy.get('.admin-table input').then(($inputs) => {
      const match = $inputs.toArray().find((el) => el.value === label);
      cy.wrap(match).closest('tr').within(() => {
        cy.contains('button', 'Supprimer').click();
      });
    });
    cy.get('body').should(($body) => {
      const inputs = $body.find('.admin-table input').toArray();
      expect(inputs.some((el) => el.value === label)).to.be.false;
    });
  });

  it('requires a code for a code-based promotion', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Promotions').click();

    cy.contains('button', '+ Ajouter une promotion').click();
    cy.get('#promo-label').type(`Cypress Code Promo ${Date.now()}`);
    cy.get('#promo-percent').clear().type('10');
    cy.get('#promo-requires-code').check();
    cy.contains('form button', 'Ajouter').click();

    cy.get('.toast.is-visible').should('contain', 'code');
  });
});
