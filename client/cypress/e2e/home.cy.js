describe('Home page', () => {
  it('loads with the nav, hero and reviews section visible', () => {
    cy.visit('/');
    cy.get('.main-nav').should('be.visible');
    cy.contains('.hero-actions a', 'Réserver un créneau').should('be.visible');
    cy.get('#testimonials').should('exist');
    cy.get('#testimonials').contains('Avis clients');
  });
});
