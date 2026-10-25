describe('Page À propos', () => {
  it('shows the presentation, the service area and the FAQ', () => {
    cy.visit('/a-propos');
    cy.contains('h1', 'coiffeuse et prothésiste ongulaire à Loos').should('be.visible');
    cy.contains('Ronchin').should('be.visible');
    cy.contains('summary', 'Quels moyens de paiement').click();
    cy.contains('Le paiement par carte en ligne').should('be.visible');
    cy.get('script[data-seo="faq"]').should('exist');
    cy.title().should('contain', 'À propos');
  });

  it('is linked from the main menu', () => {
    cy.visit('/');
    cy.get('.main-nav').contains('a', 'À propos').click({ force: true });
    cy.location('pathname').should('eq', '/a-propos');
  });
});
