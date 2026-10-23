import { useSiteConfig } from '../context/SiteConfigContext';
import { useSeo } from '../hooks/useSeo';
import LegalToc from '../components/LegalToc';

export default function Confidentialite() {
  const { siteName, siteEmail } = useSiteConfig();
  useSeo({ title: 'Politique de confidentialité', path: '/confidentialite' });

  return (
    <section className="section">
      <div className="container legal-content">
        <p className="eyebrow center">Vos données</p>
        <h1 className="center">Politique de confidentialité</h1>
        <LegalToc />

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
        <ul>
          <li>
            <strong>Compte client</strong> (identité, coordonnées, points de fidélité, parrainage) : conservé tant que vous
            vous connectez. Sans aucune connexion pendant <strong>3 ans</strong>, vous êtes prévenu·e par email puis le compte
            est supprimé automatiquement (environ 30 jours plus tard) ; une simple connexion suffit à le conserver.
          </li>
          <li>
            <strong>Fiche client et réservations sans compte</strong> : conservées au maximum 3 ans après le dernier
            rendez-vous, puis supprimées.
          </li>
          <li>
            <strong>Messages envoyés via le formulaire de contact</strong> : 3 ans maximum.
          </li>
          <li>
            <strong>Factures</strong> : conservées 10 ans, durée imposée par le Code de commerce (obligation légale
            comptable). Elles ne sont utilisées qu'à ce titre.
          </li>
          <li>
            <strong>Inscription non confirmée</strong> (lien de confirmation jamais utilisé) : effacée sous 7 jours.
          </li>
        </ul>

        <h2>5. Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de portabilité, de suppression et
          d'opposition concernant vos données.
        </p>
        <ul>
          <li>
            <strong>Accès et portabilité</strong> : depuis votre espace « Mon compte », le bouton « Télécharger mes
            données » vous fournit un fichier contenant vos informations, réservations, points et codes.
          </li>
          <li>
            <strong>Rectification</strong> : vous pouvez modifier votre nom, téléphone, date de naissance et mot de passe
            depuis « Mon compte ».
          </li>
          <li>
            <strong>Suppression</strong> : le bouton « Supprimer mon compte » efface immédiatement votre compte, vos points
            de fidélité et vos codes personnels, et anonymise vos réservations (seules les factures déjà émises sont
            conservées, voir ci-dessus). Si vous n'avez pas de compte, écrivez-nous à {siteEmail}.
          </li>
        </ul>
        <p>
          Pour tout autre exercice de vos droits, contactez-nous à {siteEmail}. Vous pouvez également introduire une
          réclamation auprès de la CNIL (cnil.fr).
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
