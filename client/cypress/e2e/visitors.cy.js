describe('Admin — Visiteurs', () => {
  it('a few public page visits show up in the admin stats', () => {
    // Generate some deterministic traffic — other specs in the suite also
    // navigate public pages, so this test doesn't assume it's the only
    // source of traffic, just that it's never zero by the time it runs.
    cy.visit('/');
    cy.visit('/services');
    cy.visit('/contact');

    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Visiteurs').click();

    cy.get('.kpi-card').should('have.length', 4);
    cy.contains('.kpi-card', 'Visiteurs uniques').find('.kpi-value').invoke('text').then((text) => {
      expect(Number(text)).to.be.greaterThan(0);
    });
    cy.contains('.kpi-card', 'Pages vues').find('.kpi-value').invoke('text').then((text) => {
      expect(Number(text)).to.be.greaterThan(0);
    });

    cy.contains('.rank-list .rank-row', 'Accueil').should('exist');
  });

  it('switching period reloads the stats under a new label', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Visiteurs').click();

    cy.get('.period-select').should('contain', '30 derniers jours').click();
    cy.contains('.period-menu button', '7 derniers jours').click();
    cy.get('.period-select').should('contain', '7 derniers jours');
    cy.get('.kpi-card').should('have.length', 4);
  });

  it('an info button explains what the metric means', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Visiteurs').click();

    cy.contains('.kpi-card', 'Taux de rebond').find('.card-info-btn').click();
    cy.get('.explain-card').should('be.visible').and('contain', 'Taux de rebond');
    cy.get('.explain-close').click();
    cy.get('.explain-card').should('not.exist');
  });

  it('clicking a chart bar shows that day\'s detail', () => {
    cy.adminLogin();
    cy.contains('button.admin-nav-link', 'Visiteurs').click();

    cy.get('.visitor-chart-col').should('have.length', 30);
    cy.get('.visitor-chart-col').eq(10).click();
    cy.get('.chart-readout').should('contain', 'visite');
  });
});
