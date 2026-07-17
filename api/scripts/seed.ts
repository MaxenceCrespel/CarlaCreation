import 'dotenv/config';
import { AppDataSource } from '../src/database/data-source';
import { Service } from '../src/database/entities/service.entity';
import { Gallery } from '../src/database/entities/gallery.entity';
import { Review } from '../src/database/entities/review.entity';

// Default content (services, gallery placeholders, sample reviews) — run
// once after `npm run migration:run` against a fresh database. Idempotent:
// each table is only seeded if empty, so re-running is harmless.
async function seedServices(): Promise<void> {
  const repo = AppDataSource.getRepository(Service);
  if ((await repo.count()) > 0) return;

  const defaults = [
    { name: 'Coupe Femme', description: 'Coupe, brushing et coiffage personnalisés.', category: 'coiffure', duration_minutes: 45, price_cents: 4500 },
    { name: 'Coupe Homme', description: 'Coupe précise avec finitions à la tondeuse.', category: 'coiffure', duration_minutes: 30, price_cents: 2500 },
    { name: 'Coloration', description: 'Coloration complète avec soin protecteur.', category: 'coiffure', duration_minutes: 90, price_cents: 7500 },
    { name: 'Balayage', description: 'Balayage main levée pour un effet naturel.', category: 'coiffure', duration_minutes: 120, price_cents: 9500 },
    { name: 'Brushing', description: 'Mise en forme et brillance longue durée.', category: 'coiffure', duration_minutes: 30, price_cents: 3000 },
    { name: 'Soin Capillaire', description: 'Soin profond réparateur et hydratant.', category: 'coiffure', duration_minutes: 30, price_cents: 3500 },
    { name: 'Manucure Classique', description: 'Soin des mains, limage et pose de vernis classique.', category: 'ongles', duration_minutes: 30, price_cents: 2500 },
    { name: 'Pose Semi-Permanent', description: 'Pose vernis semi-permanent longue tenue, large choix de teintes.', category: 'ongles', duration_minutes: 45, price_cents: 3500 },
    { name: 'Nail Art', description: 'Décorations et motifs personnalisés sur mesure.', category: 'ongles', duration_minutes: 60, price_cents: 4500 },
    { name: 'Beauté des Pieds', description: 'Soin complet des pieds avec pose de vernis.', category: 'ongles', duration_minutes: 45, price_cents: 4000 },
  ] as const;

  await repo.save(repo.create(defaults.map((d) => ({ ...d, active: true }))));
  console.log(`Seeded ${defaults.length} services.`);
}

async function seedGallery(): Promise<void> {
  const repo = AppDataSource.getRepository(Gallery);
  if ((await repo.count()) > 0) return;

  const defaults = [
    { url: 'images/placeholder-1.svg', alt_text: 'Réalisation coiffure 1', sort_order: 1 },
    { url: 'images/placeholder-2.svg', alt_text: 'Réalisation coiffure 2', sort_order: 2 },
    { url: 'images/placeholder-3.svg', alt_text: 'Réalisation coiffure 3', sort_order: 3 },
    { url: 'images/placeholder-4.svg', alt_text: 'Réalisation coiffure 4', sort_order: 4 },
    { url: 'images/placeholder-5.svg', alt_text: 'Réalisation coiffure 5', sort_order: 5 },
    { url: 'images/placeholder-6.svg', alt_text: 'Réalisation coiffure 6', sort_order: 6 },
  ];

  await repo.save(repo.create(defaults.map((d) => ({ ...d, is_upload: false }))));
  console.log(`Seeded ${defaults.length} gallery items.`);
}

async function seedReviews(): Promise<void> {
  const repo = AppDataSource.getRepository(Review);
  if ((await repo.count()) > 0) return;

  const defaults = [
    { client_name: 'Camille D.', rating: 5, comment: 'Un accueil chaleureux et un résultat toujours au rendez-vous. Je recommande les yeux fermés !' },
    { client_name: 'Julien M.', rating: 5, comment: "La réservation en ligne est super pratique, plus besoin d'appeler. Coupe impeccable comme toujours." },
    { client_name: 'Sarah B.', rating: 5, comment: 'Mon nail art est toujours magnifique et tient plusieurs semaines. Une vraie artiste !' },
  ];

  await repo.save(repo.create(defaults.map((d) => ({ ...d, status: 'approved' as const }))));
  console.log(`Seeded ${defaults.length} reviews.`);
}

(async () => {
  await AppDataSource.initialize();
  await seedServices();
  await seedGallery();
  await seedReviews();
  await AppDataSource.destroy();
  console.log('Done.');
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
