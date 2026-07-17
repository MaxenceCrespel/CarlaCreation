import 'dotenv/config';
import * as readline from 'readline';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/database/data-source';
import { Admin } from '../src/database/entities/admin.entity';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  console.log('=== Création / mise à jour du compte administrateur ===');

  let username = process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!username) username = await ask("Nom d'utilisateur admin : ");
  if (!password) password = await ask('Mot de passe (min. 10 caractères) : ');

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
