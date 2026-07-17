import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section" style={{ textAlign: 'center', padding: '120px 0' }}>
      <div className="container">
        <h1>404 — Page introuvable</h1>
        <p>La page que vous cherchez n'existe pas ou a été déplacée.</p>
        <Link to="/" className="btn btn-primary">Retour à l'accueil</Link>
      </div>
    </section>
  );
}
