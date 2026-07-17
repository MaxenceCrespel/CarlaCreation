describe('Booking flow', () => {
  let openedDate;
  let openedDayIndex;

  it('admin opens an unconfigured day', () => {
    cy.intercept('PUT', '/api/admin/settings/daily-hours/*').as('saveDay');

    cy.adminLogin();
    cy.contains('button.admin-tab', 'Horaires').click();

    cy.get('.day-chip.is-unset').first().click();
    
    // Uncheck "closed" status to open the day
    cy.get('.day-editor-closed input[type="checkbox"]').uncheck();
    cy.contains('button', 'Enregistrer').click();

    cy.wait('@saveDay').then(({ request, response }) => {
      expect(response.statusCode, 'PUT daily-hours status').to.eq(200);
      openedDate = request.url.split('/').pop();
      cy.log(`Opened date: ${openedDate}`);
    });
    cy.contains('Enregistré').should('be.visible');
  });

  it('a visitor books that day', () => {
    cy.intercept('GET', '/api/hours').as('getHours');

    cy.visit('/booking');
    cy.wait('@getHours').then(({ response }) => {
      expect(response.statusCode, 'GET /api/hours status').to.eq(200);
      
      // Dynamically locate the position of our configured day in the calendar array
      openedDayIndex = response.body.days.findIndex((d) => d.date === openedDate);
      
      const day = response.body.days[openedDayIndex];
      expect(day, `day ${openedDate} (opened in the previous test) should be present in /api/hours`).to.exist;
      expect(
        Boolean(day.isSet && !day.isClosed && day.ranges.length > 0),
        `day ${openedDate} should be open — got ${JSON.stringify(day)}`,
      ).to.eq(true);
    });

    // Select a service to reveal the date picker sections
    cy.get('.service-pick-card').first().click();
    
    // Target the precise day chip matching the index from the API response
    cy.get('.day-chip', { timeout: 15000 }).eq(openedDayIndex).click();

    // Verify slot loading and select the first available auto-suggested slot safely
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