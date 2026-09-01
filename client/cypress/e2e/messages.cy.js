describe('Contact messages', () => {
  const senderName = `Cypress Sender ${Date.now()}`;
  const messageText = 'Un message de test automatise, question sur les disponibilites.';

  it('a visitor submits the contact form', () => {
    cy.visit('/contact');
    cy.get('#contactName').type(senderName);
    cy.get('#contactEmail').type('cypress-contact@example.com');
    cy.get('#contactMessage').type(messageText);
    cy.contains('button', 'Envoyer le message').click();
    cy.get('.form-feedback.success').should('be.visible');
  });

  it('the message shows up unread in the admin Messages tab, then can be marked read and deleted', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Messages').click();

    cy.contains('.admin-review-card', senderName).within(() => {
      cy.contains('.status-badge', 'Non lu').should('be.visible');
      cy.contains(messageText).should('be.visible');
      cy.contains('button', 'Marquer lu').click();
    });

    // The default filter is "Non lus", so the now-read message drops out of
    // it — switch to "Tous" to keep interacting with it.
    cy.contains('button.admin-filter-btn', 'Tous').click();
    cy.contains('.admin-review-card', senderName).within(() => {
      cy.contains('.status-badge', 'Lu').should('be.visible');
      cy.contains('button', 'Supprimer').click();
    });

    cy.contains('.admin-review-card', senderName).should('not.exist');
  });
});
