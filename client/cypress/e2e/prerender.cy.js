// Les pages publiques sont prérendues par le serveur : le HTML brut (sans
// JavaScript, comme le lit un robot) contient déjà le contenu de la page.
const PAGES = [
  ['/', 'Réserver un créneau'],
  ['/services', 'Des soins pour chaque style'],
  ['/gallery', 'Quelques-uns de mes travaux'],
  ['/booking', 'Prenez rendez-vous'],
  ['/contact', 'Venez me rencontrer'],
  ['/a-propos', 'coiffeuse et prothésiste ongulaire'],
  ['/coiffeuse-a-domicile', 'Coiffeuse à domicile'],
];

describe('Pages prérendues (HTML brut)', () => {
  PAGES.forEach(([path, text]) => {
    it(`${path} contient son contenu sans exécuter de JavaScript`, () => {
      cy.request({ url: path, headers: { Accept: 'text/html' } }).then(({ body }) => {
        expect(body).to.match(/<div id="root"><[a-z]/);
        expect(body).to.contain('<h1');
        expect(body).to.contain(text);
        expect(body).to.contain('window.__PRELOAD__=');
      });
    });
  });

  it("la liste des prestations est dans le HTML de /services", () => {
    cy.request({ url: '/services', headers: { Accept: 'text/html' } }).then(({ body }) => {
      expect(body).to.contain('"/services":[{');
      expect(body).to.contain('service-card');
    });
  });

  it('une page privée reste construite par le navigateur (pas de prérendu)', () => {
    cy.request({ url: '/mon-compte', headers: { Accept: 'text/html' } }).then(({ body }) => {
      expect(body).to.contain('<div id="root"></div>');
    });
  });

  it('la page prérendue est ensuite reprise par le navigateur', () => {
    cy.visit('/services');
    cy.contains('h1', 'Des soins pour chaque style');
    cy.get('.service-card').should('have.length.greaterThan', 0);
  });
});
