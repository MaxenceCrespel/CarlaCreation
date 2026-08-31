describe('Admin — Stock', () => {
  it('adds a product, sees it listed, then deletes it', () => {
    const productName = `Cypress Produit ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Stock').click();

    cy.contains('button', '+ Ajouter un produit').click();
    cy.get('#product-name').type(productName);
    // These two fields default to non-empty values ('unité', '0.00') —
    // clear first or the typed text lands in the middle of the default.
    cy.get('#product-unit').clear().type('flacon');
    cy.get('#product-quantity').clear().type('5');
    cy.get('#product-threshold').clear().type('2');
    cy.get('#product-price').clear().type('12.50');
    cy.contains('form button', 'Ajouter').click();

    // The name cell is an editable <input> — cy.contains's usual text/value
    // matching was unreliable here in practice, so this reads the DOM
    // value directly instead of trusting a jQuery :contains() match.
    cy.get('.admin-table input').should(($inputs) => {
      expect($inputs.toArray().some((el) => el.value === productName)).to.be.true;
    });
    cy.get('.admin-table input').then(($inputs) => {
      const match = $inputs.toArray().find((el) => el.value === productName);
      cy.wrap(match).closest('tr').within(() => {
        cy.contains('button', 'Supprimer').click();
      });
    });
    // The table itself may disappear entirely if that was the last
    // product — check the whole page, not just a (possibly absent) table.
    cy.get('body').should(($body) => {
      const inputs = $body.find('.admin-table input').toArray();
      expect(inputs.some((el) => el.value === productName)).to.be.false;
    });
  });
});
