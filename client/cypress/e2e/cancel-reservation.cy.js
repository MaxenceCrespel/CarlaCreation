describe('Client self-cancellation', () => {
  it('requires a reason before cancelling, then shows it to the admin', () => {
    // 1. ADMIN: open a day so there's a real slot to book — same approach
    // as booking.cy.js.
    cy.intercept('PUT', '/api/admin/settings/daily-hours/*').as('saveDay');

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Horaires').click();
    cy.get('.day-chip.is-unset').eq(3).click();
    cy.get('.day-editor-closed input[type="checkbox"]').uncheck();
    cy.get('.day-editor').contains('button', 'Enregistrer').click();

    cy.wait('@saveDay').then(({ request }) => {
      const openedDate = request.url.split('/').pop();

      // 2. VISITOR: book that slot.
      cy.intercept('GET', '/api/hours').as('getHours');
      cy.intercept('GET', '/api/reservations/availability*').as('getSlots');
      cy.visit('/booking');

      cy.wait('@getHours').then((hoursResult) => {
        const openedDayIndex = hoursResult.response.body.days.findIndex((d) => d.date === openedDate);

        cy.get('#clientName').type('Cypress Cancel Test');
        cy.get('.service-pick-card').first().click();
        cy.contains('button', 'Suivant').click();
        cy.contains('button', 'Suivant').click();
        cy.get('.day-chip', { timeout: 15000 }).eq(openedDayIndex).click();
        cy.wait('@getSlots');
        cy.get('#slot').should('not.be.disabled');
        cy.get('#slot').select(0);
        cy.contains('button', 'Suivant').click();
        cy.get('#clientEmail').type('cypress-cancel@example.com');
        cy.get('#clientPhone').type('0600000098');
        cy.contains('button', 'Vérifier et confirmer ma demande').click();
        cy.get('.modal-card').contains('button', 'Confirmer le rendez-vous').click();
        cy.contains('bien été envoyée').should('be.visible');

        // 3. Follow the "manage my booking" link to the self-cancel page.
        cy.contains('a', 'Voir ou annuler ce rendez-vous').click();
        cy.contains('h1', 'Suivi de votre demande').should('be.visible');

        cy.contains('button', 'Annuler mon rendez-vous').click();

        // Submitting with no reason picked is blocked.
        cy.contains('button', "Confirmer l'annulation").click();
        cy.contains('Merci de choisir un motif').should('be.visible');
        cy.contains('.status-badge', 'Annulé').should('not.exist');

        // Picking a reason (+ an optional free-text detail) actually cancels it.
        cy.get('#cancel-reason-select').select('Contrainte professionnelle');
        cy.get('#cancel-reason-details').type('Réunion imprévue au travail.');
        cy.contains('button', "Confirmer l'annulation").click();
        cy.contains('.status-badge', 'Annulé', { timeout: 10000 }).should('be.visible');

        // 4. ADMIN: the reason (motif + detail) shows up on the reservation.
        cy.visit('/admin');
        cy.contains('button.admin-nav-link', 'Réservations').click();
        cy.get('#status-filter').select('Toutes');
        cy.contains('tr', 'Cypress Cancel Test')
          .should('contain', 'Contrainte professionnelle')
          .and('contain', 'Réunion imprévue au travail.');
      });
    });
  });
});
