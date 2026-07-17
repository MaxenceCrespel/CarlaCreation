describe('Booking flow', () => {
  it('admin opens an unconfigured day and a visitor books it', () => {
    // 1. ADMIN FLOW
    cy.intercept('PUT', '/api/admin/settings/daily-hours/*').as('saveDay');

    cy.adminLogin();
    cy.contains('button.admin-tab', 'Horaires').click();

    // Pick an unset day slightly in the future (index 3) to avoid "today" expiring slots 
    cy.get('.day-chip.is-unset').eq(3).click();
    cy.get('.day-editor-closed input[type="checkbox"]').uncheck();
    cy.contains('button', 'Enregistrer').click();

    cy.wait('@saveDay').then(({ request, response }) => {
      expect(response.statusCode, 'PUT daily-hours status').to.eq(200);
      const openedDate = request.url.split('/').pop();
      cy.log(`Opened date: ${openedDate}`);

      // 2. VISITOR FLOW
      cy.intercept('GET', '/api/hours').as('getHours');
      cy.intercept('GET', '/api/reservations/availability*').as('getSlots');
      
      cy.visit('/booking');

      cy.wait('@getHours').then((hoursResult) => {
        expect(hoursResult.response.statusCode, 'GET /api/hours status').to.eq(200);
        
        const openedDayIndex = hoursResult.response.body.days.findIndex((d) => d.date === openedDate);
        const day = hoursResult.response.body.days[openedDayIndex];
        
        expect(day, `day ${openedDate} should be present in /api/hours`).to.exist;
        expect(
          Boolean(day.isSet && !day.isClosed && day.ranges.length > 0),
          `day ${openedDate} should be open — got ${JSON.stringify(day)}`,
        ).to.eq(true);

        // Pick a service to unveil components
        cy.get('.service-pick-card').first().click();
        
        // Click the exact day chip calculated by index
        cy.get('.day-chip', { timeout: 15000 }).eq(openedDayIndex).click();

        // Wait for slots to load from the server
        cy.wait('@getSlots').then((slotsResult) => {
          expect(slotsResult.response.statusCode, 'GET availability status').to.eq(200);
          expect(slotsResult.response.body.slots.length, 'Available open slots validation').to.be.greaterThan(0);
        });

        // Safe to interact with the select input now
        cy.get('#slot').should('not.be.disabled');
        cy.get('#slot option').should('have.length.at.least', 1);
        cy.get('#slot').select(0);

        cy.get('#clientName').type('Cypress Visitor');
        cy.get('#clientEmail').type('cypress-visitor@example.com');
        cy.get('#clientPhone').type('0600000099');

        cy.contains('button', 'Confirmer ma demande de rendez-vous').click();
        cy.contains('bien été envoyée').should('be.visible');
      });
    });
  });
});