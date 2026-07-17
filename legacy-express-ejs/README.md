# Carla Création — Nail Studio — Site vitrine & réservation en ligne

Site complet pour un studio coiffure & ongles : présentation, galerie de
réalisations, prise de rendez-vous en ligne et espace administrateur pour
gérer les réservations, les photos et les horaires. Full JavaScript
(Node.js/Express côté serveur avec des pages rendues côté serveur, JS natif
et modulaire côté client, aucun framework front nécessaire).

## Comment le front et le back fonctionnent ensemble

Il n'y a qu'un seul processus : `node server.js` démarre Express, qui fait
trois choses sur le même port :

1. **Rend les pages publiques** (`/`, `/services`, `/gallery`, `/booking`,
   `/contact`) à partir de templates EJS (`backend/views/`) partageant un
   en-tête et un pied de page communs (`backend/views/partials/`).
2. **Sert les fichiers statiques** (CSS, JS, images, photos téléversées)
   depuis `frontend/` et `backend/uploads/`.
3. **Expose l'API JSON** sous `/api/...`, utilisée par le JS du navigateur
   (`fetch`) pour charger les prestations, la galerie, gérer les
   réservations, etc.

Front et back étant sur la même origine, pas de configuration CORS complexe
ni de synchronisation entre deux serveurs séparés : le navigateur charge une
page EJS, et son JavaScript interroge ensuite l'API sur ce même domaine.

## Stack

- **Backend** : Node.js, Express, EJS (pages multi-vues côté serveur),
  SQLite (`better-sqlite3`), Multer (upload d'images)
- **Frontend** : HTML/CSS/JS natif en modules ES (`import`/`export`),
  aucune dépendance de build
- **Sécurité** : Helmet (CSP/HSTS), rate limiting, protection CSRF
  (double-submit cookie), validation/sanitisation des entrées, mots de passe
  hashés (bcrypt), sessions admin en cookie JWT `httpOnly`, honeypots
  anti-spam sur les formulaires publics, validation stricte des fichiers
  téléversés (type MIME, taille, nom généré côté serveur)

## Arborescence

```
backend/
  config.js               config technique validée (PORT, JWT_SECRET, env…) — lue une seule fois
  siteConfig.js           contenu/branding (nom, slogan, téléphone, nav…) — seul fichier à éditer pour un rebrand
  server.js               assemble tout : middlewares, routes, vues, arrêt propre
  views/                  pages EJS (index, services, gallery, booking, contact, 404)
    partials/             en-tête / pied de page partagés
  routes/                 routes API (services, gallery, reservations, contact,
                          auth, admin/gallery, admin/settings, hours)
  middleware/             auth (JWT), csrf
  utils/                  slots.js (calcul des créneaux), seedAdmin.js
  scripts/                backup.js (sauvegarde), smoketest.js (tests bout-en-bout)
  data/salon.db           base SQLite (persistante, créée au premier lancement)
  uploads/                photos téléversées par l'admin (persistantes)
  Dockerfile, ecosystem.config.js   deux façons de lancer en production (voir plus bas)

frontend/
  css/                    style.css (site public), admin.css (dashboard)
  js/
    modules/               api.js, toast.js, format.js, nav.js, gallery-view.js
    pages/                  un script par page publique (home.js, services.js, …)
    admin/                  app.js (onglets + auth), reservations.js, gallery.js, hours.js
    common.js               initialisation partagée (nav, année) sur toutes les pages
  images/                  favicon + visuels de secours (placeholders)
  admin.html                tableau de bord administrateur (single page, par nature)
```

Chaque route API vit dans son propre fichier sous `routes/`, chaque script
client dans son propre module sous `js/` : pour ajouter ou modifier une
fonctionnalité, on touche un fichier ciblé plutôt qu'un gros fichier
monolithique.

## Fonctionnalités

- Présentation du studio, prestations coiffure **et** ongles (tarifs/durées),
  galerie de réalisations avec visionneuse, témoignages, FAQ, horaires,
  contact — répartis sur de vraies pages distinctes (`/`, `/services`,
  `/gallery`, `/booking`, `/contact`), pas une seule longue page.
- Réservation en ligne : sélection de prestation → date → créneau disponible
  calculé en temps réel côté serveur à partir des horaires configurés en
  base (aucun double-booking possible, même en cas de tentative de triche
  côté client).
- Formulaire de contact avec protection anti-spam.
- Espace `/admin` protégé par mot de passe, organisé en trois onglets :
  - **Réservations** : liste, changement de statut, suppression.
  - **Galerie** : téléversement de vraies photos (stockage persistant sur le
    serveur), édition de légende, réordonnancement, suppression (le fichier
    est aussi supprimé du disque).
  - **Horaires** : édition des horaires hebdomadaires (jour par jour) et
    gestion des fermetures exceptionnelles (congés, jours fériés) — c'est
    ce qui contrôle les créneaux proposés sur `/booking`.

## Persistance des données

Toutes les données sont stockées dans `backend/data/salon.db` (SQLite) et
survivent aux redémarrages du serveur : réservations, prestations, galerie,
horaires, fermetures exceptionnelles, comptes admin. Les photos téléversées
sont stockées sur disque dans `backend/uploads/` et référencées en base.
Sauvegardez ces deux emplacements pour ne rien perdre.

## Personnalisation

- **Photos** : depuis l'onglet Galerie de l'espace admin, téléversez vos
  propres photos (JPEG/PNG/WebP, 5 Mo max) — elles remplacent les visuels
  de secours automatiquement sur `/` et `/gallery`.
- **Prestations et tarifs** : table `services` (colonne `category` =
  `coiffure` ou `ongles`).
- **Horaires d'ouverture et fermetures exceptionnelles** : onglet Horaires
  de l'espace admin (tables `opening_hours` et `blackout_dates`).
- **Couleurs** : variables CSS en tête de `frontend/css/style.css`.
- **Nom, slogan, téléphone, adresse, email, liens de navigation** : un seul
  fichier, `backend/siteConfig.js`. Toutes les pages EJS et l'API le lisent
  automatiquement — aucun autre fichier à toucher pour un rebrand.
- **Réseaux sociaux** : `backend/views/partials/footer.ejs`.

## Sécurité — points clés

- Toutes les requêtes qui modifient des données (réservation, contact,
  connexion admin, changement de statut, suppression, upload, édition des
  horaires) exigent un jeton CSRF valide en plus du cookie de session.
- Le mot de passe admin n'est jamais stocké en clair (bcrypt, coût 12) et la
  comparaison est effectuée en temps constant pour limiter les attaques par
  timing.
- Limitation de débit (rate limiting) globale sur `/api`, renforcée sur les
  endpoints de création (réservation, contact) et de connexion, pour limiter
  le spam et le brute-force.
- En-têtes de sécurité (CSP stricte, HSTS, `X-Frame-Options`, etc.) via
  Helmet ; aucune ressource externe n'est chargée (pas de CDN), ce qui
  simplifie la CSP et réduit la surface d'attaque.
- Upload de photos : type MIME vérifié côté serveur (JPEG/PNG/WebP
  uniquement), taille limitée à 5 Mo, nom de fichier régénéré aléatoirement
  côté serveur (le nom d'origine n'est jamais utilisé tel quel), réservé aux
  administrateurs authentifiés.
- Les réponses HTML échappent systématiquement les données utilisateur avant
  insertion dans le DOM (aucune utilisation d'`innerHTML` avec du contenu non
  échappé) pour prévenir les attaques XSS.

## Lancer le site (développement)

```bash
cd backend
npm install
cp .env.example .env
openssl rand -hex 64        # coller le résultat dans JWT_SECRET du .env
npm run seed                 # créer le compte admin (mode interactif ; ou en une
                              # ligne : ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run seed)
npm run dev                  # redémarrage automatique à chaque changement
```

Le site est servi sur `http://localhost:3000` et l'espace admin sur
`http://localhost:3000/admin`. Après une modification, `npm run smoketest`
(serveur démarré, dans un autre terminal) rejoue automatiquement les
principaux scénarios (pages publiques, réservation, CSRF, contrôle d'accès
admin) pour repérer rapidement une régression.

## Déploiement en production

Deux façons de lancer le site en production sont fournies et testées :
**Docker** (recommandé, tout est reproductible) ou **PM2 sur un VPS**
(si vous préférez gérer Node vous-même). Dans les deux cas, mettez le site
derrière un reverse proxy HTTPS (Nginx/Caddy) — les cookies de session sont
marqués `Secure` dès que `NODE_ENV=production`, donc **le site ne fonctionnera
pas correctement sans HTTPS en production**.

### Option A — Docker (recommandé)

Tout est déjà défini dans `backend/Dockerfile` et `docker-compose.yml` à la
racine du projet. Les données (base SQLite + photos) sont stockées dans des
volumes Docker nommés, donc elles survivent à la recréation du conteneur.

```bash
cp backend/.env.example backend/.env
# Éditez backend/.env :
#   - JWT_SECRET : openssl rand -hex 64
#   - PUBLIC_ORIGIN : l'URL publique réelle du site (ex: https://carla-creation.fr)

docker compose up -d --build
```

> **⚠️ Testez en local sans HTTPS (ex: `http://localhost:3000`) ?** Le
> `docker-compose.yml` fournit passe `NODE_ENV=production`, ce qui active le
> flag `Secure` sur les cookies de session/CSRF — un navigateur refuse de les
> stocker en dehors de HTTPS, donc **la connexion admin ne fonctionnera pas**
> tant que le site n'est pas servi en HTTPS. Pour tester en local, ajoutez
> `COOKIE_SECURE=false` dans `backend/.env` avant `docker compose up`. En
> production réelle (derrière un reverse proxy HTTPS), ne mettez rien : le
> flag `Secure` s'active automatiquement.

Le site tourne sur le port 3000 du conteneur, publié sur `3000` de l'hôte
(modifiable dans `docker-compose.yml`, section `ports`). Créez le compte
admin une fois le conteneur démarré :

```bash
docker compose exec web sh -c "ADMIN_USERNAME=admin ADMIN_PASSWORD='un-mot-de-passe-fort' npm run seed"
```

Mettre à jour après un changement de code :

```bash
git pull   # ou toute autre méthode de récupération du nouveau code
docker compose up -d --build
```

Le conteneur expose un endpoint `/healthz` utilisé par `HEALTHCHECK` (Docker
le redémarre automatiquement s'il devient malsain) et gère l'arrêt propre
(`SIGTERM`) : les requêtes en cours se terminent avant que le processus ne
s'arrête.

### Option B — VPS classique avec PM2

```bash
cd backend
npm ci --omit=dev
cp .env.example .env
# Éditez .env : JWT_SECRET, PUBLIC_ORIGIN, NODE_ENV=production
npm run seed

npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # affiche la commande à exécuter pour démarrer PM2 au boot
```

Puis un reverse proxy Nginx type :

```nginx
server {
    listen 443 ssl http2;
    server_name carla-creation.fr;

    ssl_certificate     /etc/letsencrypt/live/carla-creation.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/carla-creation.fr/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(Certificat via `certbot --nginx`.) Mettre à jour après un changement de
code : `git pull && npm ci --omit=dev && pm2 reload ecosystem.config.js`.

### Vérifier le déploiement

Après chaque déploiement (Docker ou PM2), lancez le test de bout-en-bout
fourni, qui vérifie les pages publiques, l'API, le flux de réservation, la
protection CSRF et les contrôles d'accès admin :

```bash
BASE_URL=https://carla-creation.fr node scripts/smoketest.js
```

### Sauvegardes

```bash
npm run backup
```

Crée une archive `backend/backups/salon-backup-<date>.tar.gz` contenant un
instantané cohérent de la base SQLite (via l'API de sauvegarde de
better-sqlite3, sûre même serveur démarré) et le dossier `uploads/`. Les 14
dernières archives sont conservées, les plus anciennes sont supprimées
automatiquement. À planifier via cron :

```cron
0 3 * * * cd /chemin/vers/backend && /usr/bin/node scripts/backup.js >> /var/log/carla-backup.log 2>&1
```

En Docker, lancez-le dans le conteneur : `docker compose exec web npm run backup`,
puis copiez l'archive hors du conteneur avec `docker compose cp`.
