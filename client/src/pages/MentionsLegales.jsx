import { useSiteConfig } from '../context/SiteConfigContext';
import { useSeo } from '../hooks/useSeo';
import LegalToc from '../components/LegalToc';

export default function MentionsLegales() {
  const { siteName, legalForm, siret, sitePhone, siteEmail, sitePublicArea } = useSiteConfig();
  useSeo({ title: 'Mentions légales', path: '/mentions-legales' });

  return (
    <section className="section">
      <div className="container legal-content">
        <p className="eyebrow center">Informations légales</p>
        <h1 className="center">Mentions légales</h1>
        <LegalToc />

        <h2>Édition du site</h2>
        <p>
          Le présent site est édité par <strong>{siteName}</strong>, {legalForm}.
        </p>
        <ul>
          <li>
            <strong>SIRET :</strong>{' '}
            {siret || "en cours d'immatriculation — ce numéro sera complété dès réception par l'administration"}
          </li>
          <li><strong>Secteur d'activité :</strong> {sitePublicArea}</li>
          <li><strong>Téléphone :</strong> {sitePhone}</li>
          <li><strong>Email :</strong> {siteEmail}</li>
        </ul>
        <p className="section-lead">
          {siteName} exerce son activité à domicile et ne reçoit pas de public à une adresse fixe librement
          communicable — l'adresse exacte du siège n'est donc pas publiée ici. Elle peut être obtenue sur demande
          auprès de l'administration compétente (SIRENE/INSEE) une fois le SIRET attribué, conformément aux
          obligations de publication applicables aux micro-entrepreneurs exerçant à domicile.
        </p>

        <h2>Directeur de la publication</h2>
        <p>{siteName}, en la personne de sa gérante.</p>

        <h2>Hébergement</h2>
        <p>
          Le site est hébergé sur un serveur privé virtuel (VPS) chez un hébergeur européen. Les coordonnées
          complètes de l'hébergeur sont communiquées sur demande à l'adresse email ci-dessus.
        </p>

        <h2>Propriété intellectuelle</h2>
        <p>
          L'ensemble des contenus présents sur ce site (textes, photographies, logo) est la propriété de{' '}
          {siteName}, sauf mention contraire. Toute reproduction, totale ou partielle, sans autorisation préalable
          est interdite.
        </p>

        <h2>Données personnelles</h2>
        <p>
          Les informations relatives à la collecte et au traitement des données personnelles sont détaillées dans
          notre <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </div>
    </section>
  );
}
