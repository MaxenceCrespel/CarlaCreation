import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/database/data-source';
import { Admin } from '../src/database/entities/admin.entity';

// Defaults to the same account api/init.sql bootstraps for a fresh Docker
// database, so this script stays a safe no-op (password already matches)
// in the common case, and a deliberate override when ADMIN_USERNAME/
// ADMIN_PASSWORD are set — e.g. in CI, or for a real deployment where you
// want a different admin account from day one.
const DEFAULT_USERNAME = 'carla';
const DEFAULT_PASSWORD = 'Carla0303!';

(async () => {
  const username = process.env.ADMIN_USERNAME || DEFAULT_USERNAME;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

  if (!username || password.length < 10) {
    console.error("Nom d'utilisateur invalide ou mot de passe trop court (10 caractères min).");
    process.exit(1);
  }

  await AppDataSource.initialize();
  const adminRepo = AppDataSource.getRepository(Admin);

  const hash = bcrypt.hashSync(password, 12);
  const existing = await adminRepo.findOne({ where: { username } });

  if (existing) {
    existing.password_hash = hash;
    await adminRepo.save(existing);
    console.log(`Mot de passe mis à jour pour "${username}".`);
  } else {
    const admin = adminRepo.create({ username, password_hash: hash });
    await adminRepo.save(admin);
    console.log(`Compte admin "${username}" créé.`);
  }

  await AppDataSource.destroy();
  process.exit(0);
})();
