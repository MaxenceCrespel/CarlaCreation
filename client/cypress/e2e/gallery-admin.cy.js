describe('Admin — Galerie', () => {
  it('uploads a single photo, sees it in the grid, then deletes it', () => {
    const altText = `Cypress Photo ${Date.now()}`;

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Galerie').click();

    cy.contains('button', '+ Ajouter une photo').click();
    cy.contains('button', 'Photo simple').click();
    cy.get('#photo-after').selectFile('public/icon-512.png', { force: true });
    cy.get('#photo-alt').type(altText);
    cy.contains('form button', 'Téléverser la photo').click();

    // The caption is an editable <input> — read the DOM value directly
    // rather than relying on jQuery :contains() text matching, which
    // proved unreliable against nested input values here.
    cy.get('.alt-input', { timeout: 15000 }).should(($inputs) => {
      expect($inputs.toArray().some((el) => el.value === altText)).to.be.true;
    });
    cy.get('.alt-input').then(($inputs) => {
      const match = $inputs.toArray().find((el) => el.value === altText);
      cy.wrap(match).closest('.admin-gallery-card').within(() => {
        cy.contains('button', 'Supprimer').click();
      });
    });
    cy.get('body').should(($body) => {
      const inputs = $body.find('.alt-input').toArray();
      expect(inputs.some((el) => el.value === altText)).to.be.false;
    });
  });
});
