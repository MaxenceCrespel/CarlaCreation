// Realistic end-to-end journey: an admin opens a day that has never been
// configured before (every day is closed by default until explicitly
// opened — see api/src/modules/settings/settings.service.ts), then a
// visitor books that same day from the public booking page.
//
// The exact date opened by the admin is captured from the PUT request
// itself and re-checked explicitly in the second test, instead of assuming
// "first unset chip in the admin calendar" and "first open chip in the
// client calendar" refer to the same day — if they ever don't line up
// (different window sizes, ordering, whatever), this fails with a clear
// "day X should be open, got {...}" message instead of a vague timeout.
describe('Booking flow', () => {
  let openedDate;

  it('admin opens an unconfigured day', () => {
    cy.intercept('PUT', '/api/admin/settings/daily-hours/*').as('saveDay');

    cy.adminLogin();
    cy.contains('button.admin-tab', 'Horaires').click();

    cy.get('.day-chip.is-unset').first().click();
    // An unset day's `isClosed` defaults to true (the API's "closed by
    // default" sentinel — see getEffectiveHoursForDate) and DayEditor seeds
    // its checkbox straight from that, so it starts out checked. Uncheck it
    // before saving, or the day gets saved as closed with no ranges — which
    // is exactly what was happening before this fix (confirmed via the
    // /api/hours diagnostic below: isClosed: true, ranges: []).
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
      const day = response.body.days.find((d) => d.date === openedDate);
      expect(day, `day ${openedDate} (opened in the previous test) should be present in /api/hours`).to.exist;
      expect(
        Boolean(day.isSet && !day.isClosed && day.ranges.length > 0),
        `day ${openedDate} should be open — got ${JSON.stringify(day)}`,
      ).to.eq(true);
    });

    cy.get('.service-pick-card').first().click();
    cy.get('.day-chip.is-open', { timeout: 15000 }).first().click();

    cy.get('#slot').should('not.be.disabled');
    cy.get('#slot option').its('length').should('be.gte', 2);
    cy.get('#slot').select(1);

    cy.get('#clientName').type('Cypress Visitor');
    cy.get('#clientEmail').type('cypress-visitor@example.com');
    cy.get('#clientPhone').type('0600000099');

    cy.contains('button', 'Confirmer ma demande de rendez-vous').click();
    cy.contains('bien été envoyée').should('be.visible');
  });
});
