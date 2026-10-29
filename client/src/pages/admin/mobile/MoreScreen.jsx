import { Icon, TopBar } from './ui';

const GROUPS = [
  { title: 'Agenda', items: [{ route: 'disponibilites', label: 'Disponibilités' }] },
  {
    title: 'Clientèle',
    items: [
      { route: 'messages', label: 'Messages', count: 'messages' },
      { route: 'avis', label: 'Avis', count: 'reviews' },
    ],
  },
  {
    title: 'Vitrine',
    items: [
      { route: 'prestations', label: 'Prestations' },
      { route: 'galerie', label: 'Galerie' },
      { route: 'promotions', label: 'Promotions' },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { route: 'chiffres', label: 'Chiffres' },
      { route: 'facturation', label: 'Facturation', count: 'unpaidInvoices' },
      { route: 'depenses', label: 'Dépenses' },
      { route: 'stock', label: 'Stock', count: 'lowStock' },
    ],
  },
  { title: 'Compte', items: [{ route: 'reglages', label: 'Réglages' }] },
];

// Toutes les sections qui ne sont pas dans la barre du bas, rangées par
// thème, avec une pastille quand quelque chose attend.
export default function MoreScreen({ go, counts, onLogout }) {
  return (
    <div className="m-screen">
      <TopBar title="Plus" />
      {GROUPS.map((g) => (
        <section key={g.title} className="m-section">
          <h2 className="m-eyebrow">{g.title}</h2>
          <div className="m-card m-list">
            {g.items.map((item) => (
              <button key={item.route} type="button" className="m-list-item m-menu-item" onClick={() => go(`plus/${item.route}`)}>
                <span className="m-grow">{item.label}</span>
                {item.count && counts[item.count] > 0 && <span className="m-count">{counts[item.count]}</span>}
                <Icon name="next" size={18} />
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="m-section">
        <div className="m-card m-list">
          <a className="m-list-item m-menu-item" href="/" target="_blank" rel="noopener noreferrer">
            <span className="m-grow">Voir le site</span>
            <Icon name="external" size={18} />
          </a>
          <button type="button" className="m-list-item m-menu-item m-danger-text" onClick={onLogout}>
            <span className="m-grow">Se déconnecter</span>
          </button>
        </div>
      </section>
    </div>
  );
}
