describe('Reviews', () => {
  const reviewerName = `Cypress Reviewer ${Date.now()}`;

  it('a visitor submits a review (stays pending, not shown publicly yet)', () => {
    cy.visit('/');
    cy.get('#reviewName').type(reviewerName);
    cy.get('#reviewComment').type('Un avis de test automatise, tout s est bien passe.');
    cy.contains('button', 'Envoyer mon avis').click();
    cy.get('.form-feedback.success').should('be.visible');

    cy.reload();
    cy.get('#testimonials').should('not.contain', reviewerName);
  });

  it('admin approves it, and it becomes publicly visible', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Avis').click();

    cy.contains('.admin-review-card', reviewerName).within(() => {
      cy.contains('button', 'Approuver').click();
    });
    // Wait for the approval PATCH to actually complete (surfaced via the
    // success toast) before navigating away — without this, a slow request
    // can lose the race against cy.visit below and the review shows as
    // still-pending on the reload.
    cy.get('.toast.is-visible').should('contain', 'Avis approuvé');

    cy.visit('/');
    cy.get('#testimonials').contains(reviewerName).should('be.visible');
  });
});
