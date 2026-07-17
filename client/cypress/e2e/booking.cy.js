// Realistic end-to-end journey: an admin opens a day that has never been
// configured before (every day is closed by default until explicitly
// opened — see api/src/modules/settings/settings.service.ts), then a
// visitor books that same day from the public booking page.
//
// Rather than matching a specific calendar date between the admin and
// client day-pickers (fragile — both render a rolling window and format
// dates as short labels, not raw ISO strings), this picks the first
// never-configured day in the admin calendar, opens it, then on the client
// side relies on it being the only ".day-chip.is-open" day.
describe('Booking flow', () => {
  it('admin opens an unconfigured day', () => {
    cy.adminLogin();
    cy.contains('button.admin-tab', 'Horaires').click();

    cy.get('.day-chip.is-unset').first().click();
    cy.contains('button', 'Enregistrer').click();
    cy.contains('Enregistré').should('be.visible');
  });

  it('a visitor books that day', () => {
    // Intercept /api/hours so the test fails with a clear, inspectable
    // reason (bad/empty response) instead of a vague "element never
    // found" timeout if the day picker doesn't render as expected.
    cy.intercept('GET', '/api/hours').as('getHours');

    cy.visit('/booking');
    cy.wait('@getHours').then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      const openDays = response.body.days.filter((d) => d.isSet && !d.isClosed && d.ranges.length > 0);
      expect(openDays, 'at least one day should be open after the previous test').to.have.length.greaterThan(0);
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
