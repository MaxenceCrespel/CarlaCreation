require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../db');

function ask(question) {
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

  // Non-interactive mode: ADMIN_USERNAME / ADMIN_PASSWORD env vars (useful for
  // scripted setup or CI). Falls back to interactive prompts otherwise.
  let username = process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!username) username = await ask("Nom d'utilisateur admin : ");
  if (!password) password = await ask('Mot de passe (min. 10 caractères) : ');

  if (!username || password.length < 10) {
    console.error('Nom d\'utilisateur invalide ou mot de passe trop court (10 caractères min).');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 12);
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    console.log(`Mot de passe mis à jour pour "${username}".`);
  } else {
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`Compte admin "${username}" créé.`);
  }
  process.exit(0);
})();
