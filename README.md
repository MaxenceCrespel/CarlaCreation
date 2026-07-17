# Carla Création — Nail Studio — Site vitrine & réservation en ligne

Site complet pour un studio coiffure & ongles : présentation, galerie de
réalisations, prise de rendez-vous en ligne avec sélection de catégorie
(Coiffure / Ongles), et espace administrateur pour gérer les réservations,
les photos, les horaires et **les prestations**.

**Stack : React (frontend) + NestJS (backend API).** Deux projets séparés
qui se déploient comme une seule application : en production, NestJS sert à
la fois l'API JSON et les fichiers du build React, sur un seul port — pas de
serveur front séparé à faire tourner.

## Comment le front et le back fonctionnent ensemble

- **`api/`** est une API NestJS (TypeScript). Elle expose tout sous
  `/api/...`, plus `/healthz` pour les sondes de santé.
- **`client/`** est une application React (Vite), avec `react-router-dom`
  pour la navigation entre pages (`/`, `/services`, `/gallery`, `/booking`,
  `/contact`, `/admin`).
- **En développement**, les deux tournent séparément : NestJS sur
  `:3000`, Vite sur `:5173`. Le serveur de dev Vite (`client/vite.config.js`)
  proxifie `/api`, `/uploads` et `/healthz` vers `:3000`, donc le code React
  appelle toujours des chemins relatifs (`fetch('/api/services')`) sans se
  soucier du port.
- **En production**, on build le frontend (`npm run build` → `client/dist`)
  et NestJS sert ce dossier directement via `ServeStaticModule`, avec un
  fallback vers `index.html` pour les routes React Router (`/booking`,
  `/admin`, etc.) qui ne correspondent à aucun fichier ni route API. Un seul
  processus, un seul port, pas de CORS à gérer.

## Stack détaillée

- **Backend** : NestJS 11, TypeScript, SQLite (`better-sqlite3`, accès
  direct — pas d'ORM), Multer (upload d'images), class-validator (DTOs)
- **Frontend** : React 19, Vite, react-router-dom, JS/JSX (pas de build
  TypeScript côté client)
- **Sécurité** : Helmet (CSP/HSTS), `@nestjs/throttler` (rate limiting),
  protection CSRF (double-submit cookie, `CsrfGuard`), validation stricte des
  entrées (DTOs + `ValidationPipe` avec whitelist), mots de passe hashés
  (bcrypt), sessions admin en cookie JWT `httpOnly`, honeypots anti-spam sur
  les formulaires publics, validation stricte des fichiers téléversés (type
  MIME, taille, nom généré côté serveur)

## Arborescence

```
api/
  src/
    config.ts               config technique validée (PORT, JWT_SECRET, COOKIE_SECURE…)
    site-config.ts           contenu/branding (nom, slogan, téléphone, nav…) — seul fichier à éditer pour un rebrand
    main.ts                  bootstrap : Helmet, CORS, CSRF, arrêt propre
    app.module.ts             assemble tous les modules + sert le build React
    database/                 schema.ts (SQLite), database.module.ts, entities/ (types)
    common/                   admin-auth.guard.ts (JWT), csrf.ts (CsrfGuard)
    modules/
      auth/                    login/logout/me
      services/                 prestations : liste publique + CRUD admin
      gallery/                  galerie : liste publique + upload/CRUD admin
      reservations/              disponibilité, réservation, gestion admin
      settings/                  horaires jour par jour (aucun horaire récurrent)
      contact/                   formulaire de contact
      health/                    /healthz
      misc/                      /api/csrf-token, /api/site-config
  scripts/                  seedAdmin.ts, backup.ts, smoketest.ts
  data/salon.db              base SQLite (persistante, créée au premier lancement)
  uploads/                    photos téléversées par l'admin (persistantes)
  Dockerfile, ecosystem.config.js   deux façons de lancer en production

client/
  src/
    api/client.js              fetch CSRF-aware (jeton + credentials), partagé partout
    context/                    SiteConfigContext (branding), ToastContext
    components/                 Header (logo + nav + CTA unique), Footer, Layout, GalleryGrid
    pages/                      Home, Services, Gallery, Booking, Contact, NotFound
    pages/admin/                AdminApp (onglets), LoginForm, ReservationsTab,
                                GalleryTab, HoursTab, ServicesTab
    styles/main.css             palette de couleurs, tous les styles du site + de l'admin
  public/images/                visuels de secours (placeholders) servis tels quels
  dist/                        généré par `npm run build` — c'est ce que NestJS sert

legacy-express-ejs/         ancienne implémentation (Express + EJS + JS natif),
                            conservée pour référence, non utilisée en production
```

## Fonctionnalités

- Présentation du studio, prestations coiffure **et** ongles (tarifs/durées),
  galerie de réalisations avec visionneuse, témoignages, FAQ, horaires,
  contact — réparties sur de vraies pages distinctes.
- **Réservation en ligne avec sélection de catégorie** : la page `/booking`
  propose d'abord deux onglets **Coiffure** / **Ongles**, puis une grille de
  prestations cliquables filtrées par catégorie (au lieu d'un long menu
  déroulant mélangeant tout), avant de choisir une date et un créneau
  disponible calculé en temps réel côté serveur (aucun double-booking
  possible, même en cas de tentative de triche côté client).
- Un seul bouton d'appel à l'action pour réserver dans l'en-tête
  (« Prendre rendez-vous ») — auparavant dupliqué avec un lien de nav
  « Réserver » qui pointait vers la même page.
- Logo du studio dans l'en-tête (`client/src/assets/logo.svg` — un
  monogramme généré à partir de votre carte de visite ; remplacez ce fichier
  par votre logo définitif quand vous l'avez en fichier séparé).
- Formulaire de contact avec protection anti-spam.
- **Emails de confirmation** : un email est envoyé automatiquement au
  client à la création d'une demande de rendez-vous, puis à nouveau lorsque
  l'admin la confirme, la refuse ou l'annule. Fonctionne sans configuration
  (les emails sont simplement affichés dans les logs du serveur tant qu'aucun
  SMTP n'est configuré) — voir la section « Emails de confirmation » plus bas.
- **Suggestion automatique de créneau** : dès qu'une prestation est
  choisie sur `/booking`, le prochain créneau réellement disponible est
  proposé en un clic, et le premier créneau du jour choisi est présélectionné
  automatiquement.
- **Le client n'a pas à retaper ses coordonnées** : nom, email et téléphone
  sont mémorisés dans le navigateur après un envoi réussi et pré-remplis à la
  visite suivante (sur `/booking` et `/contact`).
- **Avis clients dynamiques** : n'importe quel·le visiteur·se peut laisser un
  avis noté (1 à 5 étoiles) depuis la page d'accueil. Chaque avis reste « en
  attente » et invisible du public tant qu'il n'a pas été approuvé dans
  l'onglet **Avis** de l'administration (approuver / refuser / supprimer). La
  note moyenne affichée en haut de la page d'accueil et les témoignages
  affichés en bas sont calculés uniquement à partir des avis approuvés — plus
  aucune note ou témoignage n'est codé en dur.
- **Sélecteur de date visuel côté client** : sur `/booking`, une bande de
  jours défilante montre en un coup d'œil quels jours sont ouverts
  (« Disponible ») ou fermés — plus besoin d'ouvrir un calendrier à l'aveugle
  pour découvrir qu'un jour n'est pas réservable.
- Espace `/admin` protégé par mot de passe, organisé en quatre onglets :
  - **Réservations** : liste, changement de statut (dont **Refuser**, un
    bouton dédié en plus du menu déroulant), suppression, et **ajout manuel**
    d'une réservation prise par téléphone ou en personne (protégé par la même
    vérification anti-chevauchement, mais sans exiger que le jour soit
    ouvert — utile pour un ajout rétroactif).
  - **Galerie** : téléversement de vraies photos, édition de légende,
    réordonnancement, suppression (le fichier est aussi supprimé du disque).
  - **Prestations** : ajout, modification (nom, description, catégorie,
    durée, prix, actif/inactif) et suppression des prestations — plus besoin
    de toucher la base de données pour changer le catalogue.
  - **Horaires** : **aucun horaire récurrent** — chaque jour est fermé par
    défaut tant qu'il n'a pas été ouvert individuellement. Le calendrier des
    60 prochains jours défile horizontalement, comme le sélecteur de date
    côté client — cliquez une date pour l'ouvrir dans le panneau d'édition
    en dessous. **Un jour peut avoir plusieurs créneaux** (par exemple
    10h–13h puis 16h–19h pour une pause déjeuner) : une réservation ne peut
    jamais chevaucher la coupure entre deux créneaux. C'est aussi ce qui
    remplace l'ancienne fonctionnalité séparée de « fermetures
    exceptionnelles » : fermer un jour ponctuellement, c'est simplement ne
    pas l'ouvrir (ou cocher « Fermé » pour l'enregistrer
    explicitement).

## Persistance des données

Toutes les données sont stockées dans `api/data/salon.db` (SQLite) et
survivent aux redémarrages du serveur : réservations, prestations, galerie,
horaires jour par jour, comptes admin. Les photos téléversées sont stockées
sur disque dans `api/uploads/` et référencées en base.
Sauvegardez ces deux emplacements pour ne rien perdre (voir `npm run backup`
plus bas).

## Lancer le site en développement

Terminal 1 — l'API :

```bash
cd backend
npm install
cp .env.example .env
openssl rand -hex 64        # coller le résultat dans JWT_SECRET du .env
npm run seed                 # créer le compte admin (mode interactif)
npm run dev                   # NestJS sur http://localhost:3000
```

Terminal 2 — le frontend :

```bash
cd frontend
npm install
npm run dev                   # Vite sur http://localhost:5173 (proxifie /api vers :3000)
```

Ouvrez `http://localhost:5173` pendant le développement (hot-reload React).
L'espace admin est sur `http://localhost:5173/admin`.

Après une modification, avec l'API démarrée, `npm run smoketest` (dans
`api/`) rejoue automatiquement les principaux scénarios (pages
publiques, réservation, CSRF, contrôle d'accès admin) pour repérer
rapidement une régression.

## Déploiement en production

Deux façons de lancer le site sont fournies et testées : **Docker**
(recommandé) ou **PM2 sur un VPS**. Dans les deux cas, mettez le site
derrière un reverse proxy HTTPS (Nginx/Caddy) — les cookies de session sont
marqués `Secure` dès que `NODE_ENV=production`, donc **le site ne
fonctionnera pas correctement sans HTTPS en production**.

### Option A — Docker (recommandé)

Tout est déjà défini dans `api/Dockerfile` (build multi-étapes : React
puis NestJS) et `docker-compose.yml` à la racine. Les données (base SQLite +
photos) sont stockées dans des volumes Docker nommés, donc elles survivent à
la recréation du conteneur.

```bash
cp api/.env.example api/.env
# Éditez api/.env :
#   - JWT_SECRET : openssl rand -hex 64
#   - PUBLIC_ORIGIN : l'URL publique réelle du site (ex: https://carla-creation.fr)

docker compose up -d --build
```

> **⚠️ Testez en local sans HTTPS (ex: `http://localhost:3000`) ?** Le
> `docker-compose.yml` fourni passe `NODE_ENV=production`, ce qui active le
> flag `Secure` sur les cookies de session/CSRF — un navigateur refuse de les
> stocker en dehors de HTTPS, donc **la connexion admin ne fonctionnera pas**
> tant que le site n'est pas servi en HTTPS. Pour tester en local, ajoutez
> une ligne `COOKIE_SECURE=false` (pas juste décommenter l'exemple — la
> ligne doit être active, sans `#`) dans `api/.env` avant `docker
> compose up`. En production réelle (derrière un reverse proxy HTTPS), ne
> mettez rien : le flag `Secure` s'active automatiquement.

Créez le compte admin une fois le conteneur démarré :

```bash
docker compose exec web sh -c "ADMIN_USERNAME=admin ADMIN_PASSWORD='un-mot-de-passe-fort' npm run seed"
```

Mettre à jour après un changement de code :

```bash
git pull
docker compose up -d --build
```

### Option B — VPS classique avec PM2

```bash
cd frontend
npm ci
npm run build                 # génère client/dist, servi par le backend

cd ../backend
npm ci
npm run build                 # compile TypeScript vers api/dist
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
code : `git pull`, puis rebuild frontend et backend comme ci-dessus, puis
`pm2 reload ecosystem.config.js`.

### Vérifier le déploiement

Après chaque déploiement (Docker ou PM2), lancez le test de bout-en-bout
fourni, qui vérifie les pages publiques, l'API, le flux de réservation, la
protection CSRF et les contrôles d'accès admin :

```bash
BASE_URL=https://carla-creation.fr npm --prefix backend run smoketest
```

### Sauvegardes

```bash
npm run backup   # depuis api/
```

Crée une archive `api/backups/salon-backup-<date>.tar.gz` contenant un
instantané cohérent de la base SQLite (via l'API de sauvegarde de
better-sqlite3, sûre même serveur démarré) et le dossier `uploads/`. Les 14
dernières archives sont conservées, les plus anciennes sont supprimées
automatiquement. À planifier via cron :

```cron
0 3 * * * cd /chemin/vers/backend && npm run backup >> /var/log/carla-backup.log 2>&1
```

En Docker : `docker compose exec web npm run backup`, puis copiez l'archive
hors du conteneur avec `docker compose cp`.

## Emails de confirmation

Le site envoie automatiquement un email au client :

- à la création d'une demande de rendez-vous (« reçue, en attente de
  confirmation ») ;
- quand l'admin change son statut vers **confirmée**, **refusée** ou
  **annulée** (les statuts « en attente » et « terminée » n'envoient pas
  d'email).

**Aucune configuration n'est requise pour que le site fonctionne** : tant que
`SMTP_HOST` n'est pas défini dans `api/.env`, les emails sont simplement
écrits dans les logs du serveur (`[MAIL DISABLED] Would send to ...`) au lieu
d'être envoyés — pratique en développement, et ça évite qu'un email qui échoue
bloque une réservation (la réservation est de toute façon déjà enregistrée en
base avant l'envoi).

Pour activer l'envoi réel, ajoutez dans `api/.env` :

```bash
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_SECURE=false          # true si le port est 465
SMTP_USER=votre-identifiant
SMTP_PASS=votre-mot-de-passe
SMTP_FROM="Carla Création" <no-reply@carlacreation.example>
```

Quelques options courantes :

- **Gmail** : `smtp.gmail.com`, port `587`, et un [mot de passe
  d'application](https://myaccount.google.com/apppasswords) (pas votre mot
  de passe habituel — nécessite la validation en deux étapes activée).
- **Mailtrap** (pour tester sans envoyer de vrais emails) :
  identifiants fournis dans votre inbox Mailtrap, port `2525`.
- **SendGrid / Brevo / OVH** etc. : identifiants SMTP fournis par le service,
  généralement port `587`.

Redémarrez le serveur après avoir modifié `.env`. En Docker, ajoutez ces
mêmes variables à `api/.env` avant `docker compose up -d --build` (le
fichier est déjà chargé via `env_file` dans `docker-compose.yml`).

## Personnalisation

- **Photos** : depuis l'onglet Galerie de l'espace admin, téléversez vos
  propres photos (JPEG/PNG/WebP, 5 Mo max) — elles remplacent les visuels
  de secours automatiquement sur `/` et `/gallery`.
- **Prestations et tarifs** : depuis l'onglet Prestations de l'espace admin
  (plus besoin d'accéder à la base de données).
- **Horaires** : onglet Horaires de l'espace admin — ouvrez chaque date
  individuellement (aucun horaire récurrent par défaut).
- **Logo** : remplacez `client/src/assets/logo.svg` par votre fichier
  définitif (SVG, PNG ou JPEG — ajustez l'import dans
  `client/src/components/Header.jsx` si l'extension change).
- **Couleurs** : variables CSS en tête de `client/src/styles/main.css`.
- **Nom, slogan, téléphone, adresse, email, liens de navigation** : un seul
  fichier, `api/src/site-config.ts`. La page React `/api/site-config`
  l'expose au frontend automatiquement — aucun autre fichier à toucher pour
  un rebrand.

## SEO

- **Titre, description, Open Graph, canonical par page** : gérés par
  `client/src/hooks/useSeo.js`, appelé par chaque page (`Home`, `Services`,
  `Gallery`, `Booking`, `Contact`) avec un titre/une description ciblés (zone
  Lille / Hauts-de-France par défaut — à ajuster si le studio est ailleurs).
- **Données structurées `LocalBusiness`** (schema.org, type `HairSalon`) :
  injectées automatiquement sur chaque page par `client/src/components/Layout.jsx`,
  construites à partir de `site-config.ts` (nom, adresse, téléphone, email).
  L'adresse texte (`siteAddress`) est découpée automatiquement en
  rue/code postal/ville — gardez le format `"N rue X, CP Ville"`.
- **`robots.txt` / `sitemap.xml`** : générés dynamiquement par le backend
  (`api/src/modules/seo/seo.controller.ts`) à partir de `PUBLIC_ORIGIN`
  (voir `.env`) — pas de fichier statique à maintenir. `/admin` est exclu de
  l'indexation. Vérifiez `PUBLIC_ORIGIN` en production, sinon le sitemap
  pointera vers `localhost`.
- **Prochaine étape recommandée** : soumettre le sitemap et vérifier le
  domaine dans Google Search Console une fois le site déployé, et créer/relier
  une fiche Google Business Profile pour la recherche locale ("coiffeur
  Lille").

## Sécurité — points clés

- Toutes les requêtes qui modifient des données (réservation, contact,
  connexion admin, changement de statut, suppression, upload, édition des
  horaires/prestations) exigent un jeton CSRF valide (`CsrfGuard`) en plus du
  cookie de session.
- Le mot de passe admin n'est jamais stocké en clair (bcrypt, coût 12) et la
  comparaison est effectuée en temps constant (via un hash factice quand
  l'utilisateur n'existe pas) pour limiter les attaques par timing.
- Limitation de débit (`@nestjs/throttler`) globale sur `/api`, renforcée sur
  les endpoints de création (réservation, contact) et de connexion.
- En-têtes de sécurité (CSP stricte, HSTS, `X-Frame-Options`, etc.) via
  Helmet ; aucune ressource externe n'est chargée (pas de CDN).
- Toutes les entrées API sont validées et assainies via des DTOs
  `class-validator`, avec `whitelist: true` (les champs non déclarés sont
  rejetés).
- Upload de photos : type MIME vérifié côté serveur (JPEG/PNG/WebP
  uniquement), taille limitée à 5 Mo, nom de fichier régénéré aléatoirement
  côté serveur, réservé aux administrateurs authentifiés.
- Le flag `Secure` des cookies (`COOKIE_SECURE` dans `api/src/config.ts`)
  est découplé de `NODE_ENV` : un avertissement s'affiche au démarrage si la
  configuration risque de casser silencieusement la connexion admin (HTTP
  sans TLS en environnement « production »).
- React échappe systématiquement les données affichées (pas de
  `dangerouslySetInnerHTML`), ce qui prévient les attaques XSS par défaut.
