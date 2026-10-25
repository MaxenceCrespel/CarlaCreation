import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSiteConfig } from '../context/SiteConfigContext';
import FaqSection from '../components/FaqSection';
import { useSeo } from '../hooks/useSeo';

// Towns Carla travels to, shown on the page and in the structured data.
export const SERVICE_AREA = ['Loos', 'Lille', 'Ronchin', 'Wattignies', 'Seclin', 'Tourcoing'];

function buildFaq(radiusKm) {
  const travel = Number.isFinite(radiusKm)
    ? `Le déplacement est offert jusqu'à ${radiusKm} km ; au-delà, des frais de déplacement s'ajoutent selon la distance. Ils sont calculés automatiquement avec votre adresse avant que vous validiez la réservation.`
    : 'Les frais de déplacement éventuels sont calculés automatiquement avec votre adresse avant que vous validiez la réservation.';
  return [
    {
      q: 'Vous déplacez-vous à domicile autour de Lille ?',
      a: `Oui. Je me déplace chez vous à Loos, Lille, Ronchin, Wattignies, Seclin, Tourcoing et dans toutes les communes de la métropole lilloise. ${travel}`,
    },
    {
      q: 'Quelles sont vos spécialités en coiffure ?',
      a: 'Les coupes femme avec balayage, ombré et colorations, les chignons et les coiffures d\'événement, notamment pour les mariages et les cérémonies. Je fais aussi les coupes homme et enfant, le brushing et la permanente.',
    },
    {
      q: 'Faites-vous les coiffures de mariage et d\'événements ?',
      a: 'Oui : chignons, attaches et coiffures de mariage ou de cérémonie, chez vous ou à mon studio. Le forfait mariage comprend deux essais en amont, puis la coiffure le jour J (détails et tarif sur la page Prestations). Contactez-moi avec la date et le lieu pour que je vérifie ma disponibilité.',
    },
    {
      q: 'Proposez-vous aussi des prestations d\'ongles ?',
      a: 'Oui : pose de vernis semi-permanent, pose de capsules, manucure et nail art. Tous les tarifs sont sur la page Prestations.',
    },
    {
      q: 'Comment réserver un rendez-vous ?',
      a: 'En ligne, à tout moment, depuis la page de réservation : vous choisissez la prestation, le lieu (studio ou domicile) et un créneau disponible. Je confirme ensuite votre rendez-vous, et vous recevez un email.',
    },
    {
      q: 'Quels moyens de paiement acceptez-vous ?',
      a: 'Le paiement par carte en ligne, sécurisé, au moment de la réservation (le montant n\'est débité qu\'à la confirmation de votre rendez-vous), ou sur place en espèces ou par chèque.',
    },
    {
      q: 'Puis-je annuler ou modifier mon rendez-vous ?',
      a: 'Oui, depuis le lien reçu par email, en quelques clics. Si vous avez payé en ligne, le montant vous est remboursé automatiquement à l\'annulation.',
    },
  ];
}

export default function About() {
  const { travelFreeRadiusKm } = useSiteConfig();
  useSeo({
    title: 'À propos — Coiffeuse à domicile à Lille, Loos, Ronchin, Wattignies',
    description:
      'Carla Création, coiffeuse et prothésiste ongulaire à Loos : coupes femme, balayage, couleur, chignons et coiffures de mariage, à domicile autour de Lille ou au studio.',
    path: '/a-propos',
  });

  const faq = useMemo(() => buildFaq(travelFreeRadiusKm), [travelFreeRadiusKm]);

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">À propos</p>
          <h1 className="center">Carla, coiffeuse et prothésiste ongulaire à Loos, près de Lille</h1>
          <p className="section-lead center">
            Je m'appelle Carla. Depuis plus de 8 ans, je coiffe et j'embellis chez vous ou dans mon studio, avec un seul objectif : révéler votre
            beauté et sublimer votre confiance, pour le quotidien comme pour les grands jours.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container about-sections">
          <div className="card">
            <h2>Mes spécialités</h2>
            <ul className="checklist">
              <li><strong>Coupes femme et balayage</strong> : une coupe pensée pour votre visage et votre style de vie, avec un balayage lumineux et naturel.</li>
              <li><strong>Colorations</strong> : couleurs, nuances et soins pour des cheveux brillants.</li>
              <li><strong>Chignons et coiffures d'événement</strong> : mariage, cérémonie, soirée — une coiffure qui tient toute la journée.</li>
              <li><strong>Ongles</strong> : vernis semi-permanent, capsules, manucure et nail art.</li>
            </ul>
            <p>
              Tous les tarifs et durées sont sur la page <Link to="/services">Prestations</Link>, et vous pouvez découvrir
              mes <Link to="/gallery">réalisations</Link> en photos.
            </p>
          </div>

          <div className="card">
            <h2>Coiffeuse à domicile autour de Lille</h2>
            <p>
              Je me déplace chez vous avec tout le matériel, ou je vous reçois à mon studio de Loos. J'interviens à{' '}
              {SERVICE_AREA.join(', ')} et dans toutes les communes de la métropole lilloise.
            </p>
            <ul className="area-list" aria-label="Communes desservies">
              {SERVICE_AREA.map((town) => (
                <li key={town}>{town}</li>
              ))}
              <li>et alentours</li>
            </ul>
            <p>
              {Number.isFinite(travelFreeRadiusKm)
                ? `Déplacement offert jusqu'à ${travelFreeRadiusKm} km. `
                : ''}
              Les éventuels frais de déplacement sont calculés avec votre adresse, avant de réserver.
            </p>
          </div>

          <div className="card">
            <h2>Comment ça se passe</h2>
            <ol className="about-steps">
              <li><strong>Vous réservez en ligne</strong>, à toute heure : prestation, lieu (studio ou domicile) et créneau.</li>
              <li><strong>Je confirme</strong> votre rendez-vous et vous recevez un email avec tous les détails.</li>
              <li><strong>Je viens à vous</strong> (ou je vous accueille au studio) et je prends le temps qu'il faut.</li>
              <li><strong>Vous réglez</strong> par carte en ligne, ou sur place en espèces ou par chèque.</li>
            </ol>
          </div>

          <FaqSection faq={faq} />

          <p className="center">
            <Link to="/booking" className="btn btn-primary">Prendre rendez-vous</Link>{' '}
            <Link to="/contact" className="btn btn-outline">Me contacter</Link>
          </p>
        </div>
      </section>
    </>
  );
}
