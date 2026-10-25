import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import FaqSection from '../components/FaqSection';
import { useSiteConfig } from '../context/SiteConfigContext';
import { useSeo } from '../hooks/useSeo';
import { SERVICE_AREA } from './About';

function buildFaq(radiusKm) {
  const travel = Number.isFinite(radiusKm)
    ? `Le déplacement est offert jusqu'à ${radiusKm} km autour de Loos. Au-delà, des frais s'ajoutent selon la distance : ils sont calculés automatiquement avec votre adresse et affichés avant que vous validiez la réservation.`
    : 'Les frais de déplacement éventuels sont calculés automatiquement avec votre adresse et affichés avant que vous validiez la réservation.';
  return [
    { q: 'Combien coûte le déplacement ?', a: travel },
    {
      q: 'Quelles prestations sont possibles à domicile ?',
      a: 'Coupes, brushings, colorations, balayages, ombrés, patines, chignons et coiffures de mariage ou de cérémonie, ainsi que les prestations d\'ongles. À la réservation, vous choisissez « À domicile » et la durée de chaque prestation est indiquée.',
    },
    {
      q: 'Combien de temps faut-il prévoir ?',
      a: 'La durée de chaque prestation est indiquée sur la page Prestations et au moment de la réservation, et le créneau proposé en tient compte.',
    },
    {
      q: 'Puis-je réserver pour plusieurs personnes ?',
      a: 'Oui. Lors de la réservation, ajoutez une ou plusieurs personnes (par exemple un enfant ou une amie) : les créneaux sont enchaînés sur le même rendez-vous, au même endroit.',
    },
    {
      q: 'Comment régler une prestation à domicile ?',
      a: 'Par carte en ligne, au moment de la réservation, ou sur place en espèces ou par chèque.',
    },
  ];
}

// Landing page for the main search intent (coiffeuse à domicile, Loos / Lille).
export default function HomeService() {
  const { travelFreeRadiusKm } = useSiteConfig();
  useSeo({
    title: 'Coiffeuse à domicile à Loos, Lille et alentours',
    description:
      'Coiffeuse à domicile à Loos, Lille, Ronchin, Wattignies, Seclin, Tourcoing : coupe, balayage, couleur, chignon et coiffure de mariage chez vous. Réservation en ligne.',
    path: '/coiffeuse-a-domicile',
  });
  const faq = useMemo(() => buildFaq(travelFreeRadiusKm), [travelFreeRadiusKm]);

  return (
    <>
      <section className="section page-hero">
        <div className="container">
          <p className="eyebrow center">Service à domicile</p>
          <h1 className="center">Coiffeuse à domicile à Loos, Lille et alentours</h1>
          <p className="section-lead center">
            Je viens chez vous avec tout le matériel : coupe, balayage, couleur, chignon ou coiffure de mariage, dans le
            confort de votre salon. Vous réservez en ligne, je me déplace.
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container about-sections">
          <div className="card">
            <h2>Pourquoi se faire coiffer à domicile</h2>
            <ul className="checklist">
              <li><strong>Sans déplacement ni attente</strong> : vous restez chez vous, je m'occupe du reste.</li>
              <li><strong>Pour les grands jours</strong> : une coiffure de mariage ou de cérémonie dans le calme, avant de partir.</li>
              <li><strong>Pour toute la famille</strong> : plusieurs personnes à la suite, sur un seul rendez-vous.</li>
              <li><strong>Un résultat soigné</strong> : mêmes techniques et mêmes produits professionnels qu'au studio.</li>
            </ul>
          </div>

          <div className="card">
            <h2>Où je me déplace</h2>
            <p>
              Je me déplace à {SERVICE_AREA.join(', ')} et dans toutes les communes de la métropole lilloise.
              {Number.isFinite(travelFreeRadiusKm) ? ` Le déplacement est offert jusqu'à ${travelFreeRadiusKm} km.` : ''}
            </p>
            <ul className="area-list" aria-label="Communes desservies">
              {SERVICE_AREA.map((town) => (
                <li key={town}>{town}</li>
              ))}
              <li>et alentours</li>
            </ul>
          </div>

          <div className="card">
            <h2>Mes prestations à domicile</h2>
            <ul className="checklist">
              <li><strong>Coupes femme, homme et enfant</strong>, brushing et patine.</li>
              <li><strong>Couleur, balayage et ombré</strong>, avec coupe et brushing.</li>
              <li><strong>Chignons et coiffures d'événement</strong>, dont le forfait mariage avec essais.</li>
              <li><strong>Ongles</strong> : pose de capsules, semi-permanent, remplissage et nail art.</li>
            </ul>
            <p>
              Retrouvez tous les tarifs et durées sur la page <Link to="/services">Prestations</Link>, et mes
              travaux dans la <Link to="/gallery">galerie</Link>. Pour mieux me connaître : <Link to="/a-propos">à propos de Carla</Link>.
            </p>
          </div>

          <FaqSection faq={faq} />

          <p className="center">
            <Link to="/booking" className="btn btn-primary">Réserver à domicile</Link>{' '}
            <Link to="/contact" className="btn btn-outline">Me contacter</Link>
          </p>
        </div>
      </section>
    </>
  );
}
