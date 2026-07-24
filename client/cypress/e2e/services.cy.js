describe('Services page', () => {
  it('lists prestations in both the Coiffure and Ongles categories', () => {
    cy.visit('/services');

    // Categories are now browsed via buttons (main category, then
    // subcategory pills if any) rather than one long stacked list.
    cy.contains('button.category-tab', 'Coiffure').should('be.visible').and('have.class', 'is-active');
    cy.get('.service-card').its('length').should('be.gte', 1);

    cy.contains('button.category-tab', 'Ongles').should('be.visible').click();
    cy.contains('button.category-tab', 'Ongles').should('have.class', 'is-active');
    cy.get('.service-card').its('length').should('be.gte', 1);
  });
});
