import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section not-found">
      <div className="container">
        <p className="not-found-code" aria-hidden="true">404</p>
        <h1>Cette page s'est éclipsée</h1>
        <p>L'adresse a peut-être changé. Voici de quoi retrouver votre chemin.</p>
        <div className="not-found-actions">
          <Link to="/booking" className="btn btn-primary">Prendre rendez-vous</Link>
          <Link to="/" className="btn btn-outline">Retour à l'accueil</Link>
        </div>
      </div>
    </section>
  );
}
