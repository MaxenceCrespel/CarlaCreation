import { useSiteConfig } from '../context/SiteConfigContext';
import { useSeo } from '../hooks/useSeo';

export default function CGV() {
  const { siteName, legalForm, siret, siteEmail, sitePhone } = useSiteConfig();
  useSeo({ title: 'Conditions générales de vente', path: '/cgv' });

  return (
    <section className="section">
      <div className="container legal-content">
        <p className="eyebrow center">Avant de réserver</p>
        <h1 className="center">Conditions générales de vente</h1>

        <p className="section-lead">
          Les présentes conditions régissent les prestations de coiffure et de soins des ongles proposées par{' '}
          {siteName} ({legalForm}, SIRET {siret || "en cours d'immatriculation"}) via le site de réservation en
          ligne. Toute réservation implique l'acceptation pleine et entière de ces conditions.
        </p>

        <h2>1. Prestations et tarifs</h2>
        <p>
          Les prestations proposées, leur durée et leur tarif sont indiqués sur la page{' '}
          <a href="/services">Prestations</a>. Les tarifs sont exprimés en euros, toutes taxes comprises (TVA non
          applicable, article 293 B du Code général des impôts — régime de la micro-entreprise). Une réduction
          (tarif spécial ou code promo) peut s'appliquer selon les conditions affichées au moment de la réservation.
        </p>

        <h2>2. Réservation</h2>
        <p>
          La réservation se fait en ligne via le formulaire du site, par téléphone ou en personne. Une demande de
          réservation en ligne n'est confirmée qu'après validation explicite par {siteName} — vous en êtes informé·e
          par email.
        </p>

        <h2>3. Paiement</h2>
        <p>
          Selon l'option choisie à la réservation, le règlement s'effectue soit intégralement en ligne par carte
          bancaire au moment de la réservation (paiement sécurisé via notre prestataire Stripe), soit sur place le
          jour de la prestation (espèces ou carte).
        </p>
        <p>
          Pour un paiement en ligne, le montant n'est définitivement débité qu'une fois votre rendez-vous confirmé
          par {siteName} — une demande non confirmée ne donne lieu à aucun débit.
        </p>

        <h2>4. Annulation et remboursement</h2>
        <p>
          Vous pouvez annuler votre rendez-vous vous-même depuis le lien reçu par email. Si vous avez payé en ligne
          et que vous annulez suffisamment à l'avance (le délai applicable vous est rappelé lors de l'annulation),
          le montant payé est remboursé automatiquement sur le moyen de paiement utilisé. Passé ce délai, le
          montant reste dû au titre du temps réservé qui n'a pas pu être proposé à une autre cliente.
        </p>
        <p>
          {siteName} se réserve le droit d'annuler ou de reporter un rendez-vous en cas d'imprévu (maladie,
          urgence) ; vous en êtes alors informé·e dans les meilleurs délais et tout paiement en ligne déjà effectué
          est intégralement remboursé.
        </p>

        <h2>5. Droit de rétractation</h2>
        <p>
          Conformément à l'article L221-28 13° du Code de la consommation, le droit de rétractation ne s'applique
          pas aux prestations de services pleinement exécutées à la date convenue avec votre accord exprès. En
          réservant un créneau daté et en payant tout ou partie du prix à l'avance, vous demandez expressément
          l'exécution de la prestation à cette date et renoncez à votre droit de rétractation pour cette
          prestation.
        </p>

        <h2>6. Responsabilité</h2>
        <p>
          {siteName} s'engage à exécuter les prestations avec soin et selon les règles de l'art. Merci de signaler
          toute allergie, sensibilité cutanée ou contre-indication médicale avant le début de la prestation.
        </p>

        <h2>7. Contact</h2>
        <p>
          Pour toute question relative à ces conditions : {siteEmail} — {sitePhone}.
        </p>
      </div>
    </section>
  );
}
