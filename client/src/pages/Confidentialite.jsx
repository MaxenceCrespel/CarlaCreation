import { useSiteConfig } from '../context/SiteConfigContext';
import { useSeo } from '../hooks/useSeo';

export default function Confidentialite() {
  const { siteName, siteEmail } = useSiteConfig();
  useSeo({ title: 'Politique de confidentialité', path: '/confidentialite' });

  return (
    <section className="section">
      <div className="container legal-content">
        <p className="eyebrow center">Vos données</p>
        <h1 className="center">Politique de confidentialité</h1>

        <p className="section-lead">
          {siteName} accorde de l'importance à la protection de vos données personnelles. Cette page explique
          quelles données sont collectées via ce site, pourquoi, et comment les contrôler, conformément au
          Règlement Général sur la Protection des Données (RGPD).
        </p>

        <h2>1. Données collectées</h2>
        <ul>
          <li>
            <strong>À la réservation :</strong> nom, email, téléphone, et adresse si la prestation a lieu à votre
            domicile.
          </li>
          <li>
            <strong>Si vous créez un compte :</strong> les mêmes informations, votre mot de passe (jamais stocké en
            clair — uniquement sous forme chiffrée), et votre date de naissance si vous choisissez de la renseigner
            (uniquement pour le jour/mois, afin de vous proposer un code promo d'anniversaire).
          </li>
          <li>
            <strong>Si vous payez en ligne :</strong> vos coordonnées bancaires ne sont jamais vues ni stockées par{' '}
            {siteName} — elles sont saisies directement sur une page sécurisée de notre prestataire de paiement,
            Stripe.
          </li>
          <li>
            <strong>Navigation :</strong> des statistiques de fréquentation anonymes (pages vues, type d'appareil)
            sans cookie publicitaire ni traceur tiers.
          </li>
          <li>
            <strong>Notifications :</strong> si vous autorisez les notifications depuis l'espace admin, un
            identifiant technique propre à votre appareil est conservé pour pouvoir vous notifier.
          </li>
        </ul>

        <h2>2. Pourquoi ces données</h2>
        <p>
          Ces informations servent exclusivement à traiter vos demandes de rendez-vous, vous contacter à leur
          sujet, faire fonctionner votre compte et la carte de fidélité si vous en créez un, et améliorer le site.
          Elles ne sont jamais vendues ni transmises à des tiers à des fins commerciales.
        </p>

        <h2>3. Qui y a accès</h2>
        <p>
          Vos données sont accessibles uniquement par {siteName}. Elles peuvent être transmises à des
          sous-traitants techniques strictement nécessaires au fonctionnement du site : notre hébergeur (stockage
          des données), notre prestataire d'envoi d'emails, et Stripe pour le paiement en ligne.
        </p>

        <h2>4. Durée de conservation</h2>
        <p>
          Les données liées à une réservation sont conservées le temps nécessaire à son traitement puis à des fins
          de suivi de clientèle, sauf demande de suppression de votre part. Les données d'un compte sont conservées
          tant que le compte existe.
        </p>

        <h2>5. Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition
          concernant vos données. Pour exercer ces droits, contactez-nous à {siteEmail}.
        </p>

        <h2>6. Cookies</h2>
        <p>
          Ce site utilise uniquement des cookies techniques indispensables à son fonctionnement (maintien de votre
          session si vous êtes connecté·e, protection contre les attaques CSRF) — aucun cookie publicitaire ou de
          suivi tiers.
        </p>
      </div>
    </section>
  );
}
