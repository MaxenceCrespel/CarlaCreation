describe('Services page', () => {
  it('lists prestations in both the Coiffure and Ongles categories', () => {
    cy.visit('/services');
    cy.contains('h2.category-title', 'Coiffure').should('be.visible');
    cy.contains('h2.category-title', 'Ongles').should('be.visible');
    cy.get('.service-card').its('length').should('be.gte', 2);
  });
});
