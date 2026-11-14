describe('Home page', () => {
  it('loads with the nav, hero and reviews section visible', () => {
    cy.visit('/');
    cy.get('.main-nav').should('be.visible');
    cy.contains('.hero-actions a', 'Réserver un créneau').should('be.visible');
    cy.get('#testimonials').should('exist');
    cy.get('#testimonials').contains('Avis clients');
  });

  it('promotes the loyalty programme and links to account creation', () => {
    cy.visit('/');
    cy.get('#fidelite').should('exist').within(() => {
      cy.contains('Programme de fidélité');
      cy.contains('1 point tous les 4 €');
      cy.contains('Parrainez une amie');
      cy.contains('a', 'Créer mon compte gratuit').should('have.attr', 'href', '/mon-compte');
    });
  });
});
