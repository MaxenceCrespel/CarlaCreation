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

- **Backend** : NestJS 11, TypeScript, PostgreSQL via TypeORM (repositories,
  migrations versionnées — pas de `synchronize`), Multer (upload d'images),
  class-validator (DTOs)
- **Frontend** : React 19, Vite, react-router-dom, JS/JSX (pas de build
  TypeScript côté client)
- **Tests** : unitaires (Jest, services mockés), intégration (Jest +
  Supertest contre une vraie base Postgres), E2E (Cypress contre la stack
  complète) — voir la section « Tests & CI/CD » plus bas
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
    config.ts               config technique validée (PORT, JWT_SECRET, DATABASE_URL, COOKIE_SECURE…)
    site-config.ts           contenu/branding (nom, slogan, téléphone, nav…) — seul fichier à éditer pour un rebrand
    main.ts                  bootstrap : Helmet, CORS, CSRF, arrêt propre
    app.module.ts             assemble tous les modules + sert le build React
    database/
      database.module.ts       TypeOrmModule.forRoot (synchronize: false)
      data-source.ts            DataSource autonome, utilisé par le CLI de migration et les scripts
      entities/                 une classe @Entity() par table
      migrations/                schéma versionné (npm run migration:run)
    common/                   admin-auth.guard.ts (JWT), csrf.ts (CsrfGuard)
    modules/
      auth/                    login/logout/me
      services/                 prestations : liste publique + CRUD admin
      gallery/                  galerie : liste publique + upload/CRUD admin
      reservations/              disponibilité, réservation, gestion admin
      settings/                  horaires jour par jour (aucun horaire récurrent)
      reviews/                   avis clients : soumission publique + modération admin
      contact/                   formulaire de contact
      seo/                       robots.txt, sitemap.xml
      health/                    /healthz
      misc/                      /api/csrf-token, /api/site-config
  scripts/                  seedAdmin.ts, seed.ts (données par défaut), backup.ts, smoketest.ts
  test/                     tests d'intégration (Jest + Supertest, *.e2e-spec.ts)
  uploads/                    photos téléversées par l'admin (persistantes)
  Dockerfile, ecosystem.config.js   deux façons de lancer en production

client/
  src/
    api/client.js              fetch CSRF-aware (jeton + credentials), partagé partout
    context/                    SiteConfigContext (branding), ToastContext
    components/                 Header (logo + nav + CTA unique), Footer, Layout, GalleryGrid
    hooks/useSeo.js              titre/meta/Open Graph par page
    pages/                      Home, Services, Gallery, Booking, Contact, NotFound
    pages/admin/                AdminApp (onglets), LoginForm, ReservationsTab,
                                GalleryTab, HoursTab, ServicesTab, AvisTab
    styles/main.css             palette de couleurs, tous les styles du site + de l'admin
  cypress/e2e/                 tests E2E (parcours complets, navigateur réel)
  public/images/                visuels de secours (placeholders) servis tels quels
  dist/                        généré par `npm run build` — c'est ce que NestJS sert
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
- **Rendez-vous sur place ou à domicile** : Carla étant une auto-entrepreneuse
  sans salon fixe, chaque réservation précise si le client vient sur place ou
  si elle se déplace (adresse alors demandée). Une réservation à domicile
  bloque automatiquement `travelBufferMinutes` (30 min par défaut,
  `api/src/site-config.ts`) avant et après le rendez-vous dans le calcul des
  créneaux disponibles, pour ne jamais enchaîner deux rendez-vous sans compter
  le trajet.
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
- Espace `/admin` protégé par mot de passe, organisé en cinq onglets :
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
  - **Avis** : modération des avis clients (en attente / approuvé / refusé),
    avec suppression — seuls les avis approuvés comptent dans la moyenne et
    les témoignages affichés sur `/`.

## Persistance des données

Toutes les données (réservations, prestations, galerie, horaires jour par
jour, avis, comptes admin) sont stockées dans une base **PostgreSQL**, dont
le schéma est géré par des migrations TypeORM versionnées
(`api/src/database/migrations/`) — pas de `synchronize` automatique, le
schéma en base est toujours exactement ce que les migrations décrivent.
Les photos téléversées sont stockées sur disque dans `api/uploads/` et
référencées en base. Sauvegardez la base (voir `npm run backup` plus bas) et
`api/uploads/` pour ne rien perdre.

## Lancer le site en développement

Il faut un PostgreSQL accessible en local. Le plus simple sans rien
installer :

```bash
docker run -d --name salon-postgres -p 5432:5432 \
  -e POSTGRES_USER=salon -e POSTGRES_PASSWORD=salon -e POSTGRES_DB=salon \
  postgres:15-alpine
```

Terminal 1 — l'API : **juste `npm install` puis `npm run dev`**, rien
d'autre — pas de `.env` à créer. Sans `DATABASE_URL`/`JWT_SECRET` définis,
`api/src/config.ts` utilise automatiquement des valeurs de dev par défaut
(qui correspondent à la commande `docker run` ci-dessus) tant que
`NODE_ENV` n'est pas `production`. `npm run dev` crée aussi le schéma,
insère les données par défaut (prestations/galerie/avis) et le compte admin
(`carla` / `Carla0303!`) avant de démarrer le serveur — ces trois étapes
sont sans effet si elles ont déjà été faites, donc redémarrer ne casse ni
ne duplique rien.

```bash
cd api
npm install
npm run dev             # NestJS sur http://localhost:3000, DB prête automatiquement
```

Besoin de personnaliser (vrai secret JWT, autre base, SMTP…) ?
`cp .env.example .env` puis éditez — sinon les valeurs par défaut
suffisent pour développer.

Terminal 2 — le frontend :

```bash
cd client
npm install
npm run dev                   # Vite sur http://localhost:5173 (proxifie /api vers :3000)
```

Ouvrez `http://localhost:5173` pendant le développement (hot-reload React).
L'espace admin est sur `http://localhost:5173/admin` (identifiants
`carla` / `Carla0303!` par défaut — changez-les avant tout déploiement réel).

Après une modification, `npm test` (dans `api/`, tests unitaires, pas besoin
de base de données) et `npm run test:e2e` (tests d'intégration Supertest,
nécessite Postgres) permettent de repérer rapidement une régression — voir
la section « Tests & CI/CD » plus bas pour le détail. `npm run smoketest`
reste disponible comme vérification manuelle de bout en bout contre une
instance qui tourne (pratique après un déploiement).

## Déploiement

Deux façons de lancer le site sont fournies et testées : **Docker**
(recommandé) ou **PM2 sur un VPS**. Dans les deux cas, mettez le site
derrière un reverse proxy HTTPS (Nginx/Caddy) — les cookies de session sont
marqués `Secure` dès que `NODE_ENV=production`, donc **le site ne
fonctionnera pas correctement sans HTTPS en production**.

### Option A — Docker (recommandé)

**`docker compose up -d --build`, rien d'autre.** Tout est déjà défini dans
`api/Dockerfile` (build multi-étapes : React puis NestJS) et
`docker-compose.yml` à la racine, qui inclut aussi un service **PostgreSQL**
avec un volume nommé (les données survivent à la recréation du conteneur).
Au tout premier démarrage (volume vide), Postgres exécute automatiquement
`api/init.sql` : schéma, prestations/galerie/avis par défaut, et un compte
admin **`carla` / `Carla0303!`**. `docker-compose.yml` fournit aussi des
valeurs par défaut pour `JWT_SECRET`/`COOKIE_SECURE` — le site fonctionne
donc dès la première commande, sans aucun fichier `.env` à créer.

```bash
docker compose up -d --build
```

**Pour un vrai déploiement (pas juste un essai local)**, remplacez les
valeurs par défaut — elles sont volontairement peu sûres pour ne pas
bloquer un premier lancement, pas pour tourner ainsi en production :

1. Dans `docker-compose.yml`, éditez directement les deux lignes
   `JWT_SECRET`/`COOKIE_SECURE` du service `web` (`openssl rand -hex 64`
   pour la première, `"true"` pour la seconde une fois derrière un vrai
   HTTPS). **Ces deux-là ne peuvent pas être surchargées via `api/.env`** —
   `environment:` dans `docker-compose.yml` est toujours prioritaire sur
   `env_file`, donc autant les changer directement à la source.
2. Pour le reste (`PUBLIC_ORIGIN`, SMTP…), `cp api/.env.example api/.env`
   et éditez normalement.
3. Changez le mot de passe du compte `carla` (ou créez le vôtre) :

```bash
docker compose exec web sh -c "ADMIN_USERNAME=votre-identifiant ADMIN_PASSWORD='un-mot-de-passe-fort' npm run seed"
```

> **⚠️ Testez en local sans HTTPS (ex: `http://localhost:3000`) ?** Par
> défaut `COOKIE_SECURE=false`, donc la connexion admin fonctionne
> directement en HTTP local — c'est voulu. **En production derrière un
> reverse proxy HTTPS**, pensez à repasser `COOKIE_SECURE` à `"true"` dans
> `docker-compose.yml` (étape 1 ci-dessus) — sinon le flag `Secure` des
> cookies de session/CSRF ne sera jamais activé.

Mettre à jour après un changement de code :

```bash
git pull
docker compose up -d --build
docker compose exec web npm run migration:run   # si le schéma a changé depuis
```

### Option B — VPS classique avec PM2

Nécessite un PostgreSQL accessible (local sur le VPS, ou managé).

```bash
cd client
npm ci
npm run build                 # génère client/dist, servi par l'API

cd ../api
npm ci
npm run build                 # compile TypeScript vers api/dist
cp .env.example .env
# Éditez .env : JWT_SECRET, DATABASE_URL, PUBLIC_ORIGIN, NODE_ENV=production
npm run migration:run
npm run seed:data
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
code : `git pull`, puis rebuild frontend et backend comme ci-dessus
(`npm run migration:run` si le schéma a changé), puis
`pm2 reload ecosystem.config.js`.

### Vérifier le déploiement

Après chaque déploiement (Docker ou PM2), lancez le test de bout-en-bout
fourni, qui vérifie les pages publiques, l'API, le flux de réservation, la
protection CSRF et les contrôles d'accès admin :

```bash
BASE_URL=https://carla-creation.fr npm --prefix api run smoketest
```

### Sauvegardes

```bash
npm run backup   # depuis api/, nécessite pg_dump installé localement
```

Crée une archive `api/backups/salon-backup-<date>.sql.gz`, un dump complet
et cohérent de la base Postgres (`pg_dump` gzippé) à partir de
`DATABASE_URL`. Les 14 dernières archives sont conservées, les plus
anciennes sont supprimées automatiquement. En production, préférez si
possible les sauvegardes automatiques natives de votre hébergeur Postgres
(point-in-time recovery) — ce script reste utile pour un instantané manuel
ou local. À planifier via cron :

```cron
0 3 * * * cd /chemin/vers/api && npm run backup >> /var/log/carla-backup.log 2>&1
```

En Docker : `docker compose exec web npm run backup`, puis copiez l'archive
hors du conteneur avec `docker compose cp`.

## Déploiement staging (VPS)

Un environnement de **staging** public, déployé automatiquement par la CI
(job `Deploy-Staging` dans `main.yml`, à chaque push sur `main`/`master`
une fois les autres jobs au vert). La **prod** est volontairement différée
à plus tard — voir en bas de section comment la dupliquer le moment venu.

**Architecture** : un seul VPS pas cher (~4€/mois, OVH VPS Value ou
Hetzner CX22 par exemple), un conteneur **Caddy** en reverse proxy
(HTTPS automatique via Let's Encrypt, `deploy/Caddyfile`) qui route
`staging.<domaine>` vers le port `127.0.0.1:3001`, sur lequel écoute la
stack applicative (`docker-compose.yml` + l'override
`docker-compose.staging.yml`). Le service `web` staging n'est jamais
exposé directement — seul Caddy écoute sur 80/443.

### Checklist de mise en place (une fois, manuelle)

1. Acheter un nom de domaine, puis créer un enregistrement DNS **A**
   `staging.<domaine>` → IP du VPS.
2. Commander un VPS (Ubuntu 22.04/24.04).
3. Sur le VPS : installer Docker + le plugin Compose, créer un utilisateur
   dédié au déploiement, générer une paire de clés SSH réservée à GitHub
   Actions (clé publique dans `~deploy/.ssh/authorized_keys`), cloner ce
   repo dans `/opt/carla-creation`.
4. Dans `/opt/carla-creation`, créer le `.env` **racine** (`cp .env.example
   .env`, à ne jamais commiter) avec un `JWT_SECRET` généré
   (`openssl rand -hex 64`) et `DOMAIN=<votre domaine>`.
5. Démarrer Caddy une fois pour toutes :
   ```bash
   cd /opt/carla-creation/deploy
   docker compose -f docker-compose.caddy.yml up -d
   ```
6. Dans les secrets GitHub Actions du repo (Settings → Secrets and
   variables → Actions), ajouter `STAGING_SSH_HOST`, `STAGING_SSH_USER`,
   `STAGING_SSH_KEY` (clé privée générée à l'étape 3).
7. Pousser sur `main`/`master` : la CI construit, teste, puis déclenche
   `Deploy-Staging`, qui se connecte en SSH et lance :
   ```bash
   cd /opt/carla-creation
   git pull
   docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
   docker compose exec -T web npm run migration:run
   ```
8. **Important** : une fois le site accessible publiquement sur
   `https://staging.<domaine>`, connectez-vous en admin
   (`carla` / `Carla0303!`, le compte pré-créé par `init.sql`) et changez
   immédiatement le mot de passe — ce compte par défaut n'est prévu que
   pour un premier lancement local.

### Prod, plus tard

Même mécanisme, dupliqué : un `docker-compose.prod.yml` (port
`127.0.0.1:3000`), un bloc `{$DOMAIN} { reverse_proxy 127.0.0.1:3000 }` à
décommenter dans `deploy/Caddyfile`, un `deploy-production.yml` équivalent
à `deploy-staging.yml` avec des secrets `PRODUCTION_SSH_*`, et un nouveau
job dans `main.yml`. Peut tourner sur le même VPS que le staging (deux
stacks Compose distinctes, un seul Caddy) ou sur un second VPS séparé.

## Emails de confirmation

Le site envoie automatiquement un email au client :

- à la création d'une demande de rendez-vous (« reçue, en attente de
  confirmation ») ;
- quand l'admin change son statut vers **confirmée**, **refusée** ou
  **annulée** (les statuts « en attente » et « terminée » n'envoient pas
  d'email) ;
- un **rappel automatique** ~24h avant chaque rendez-vous **confirmé**
  (job planifié qui vérifie toutes les 10 minutes, voir
  `ReservationsService.dispatchDueReminders` — chaque réservation n'est
  rappelée qu'une seule fois grâce à la colonne `reminder_sent`).

Chaque email de confirmation/rappel contient aussi un lien « Voir ou annuler
mon rendez-vous » (`/mon-rendez-vous/<id>`) permettant au client de gérer sa
réservation sans compte, et le logo du studio en en-tête
(`client/public/logo-email.png` — voir "Personnalisation" ci-dessous).

En plus des emails clients, **chaque nouvelle demande de réservation envoie
aussi une notification à l'adresse SMTP configurée** (`SMTP_USER`) — utile
puisqu'il n'y a pas d'autre système de notification admin.

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
  `client/src/components/Header.jsx` si l'extension change). Pensez aussi à
  régénérer `client/public/logo-email.png` (les emails ne supportent pas
  bien le SVG) : `magick -background none -density 300 votre-logo.svg
  -resize 440x280 client/public/logo-email.png`.
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

## Tests & CI/CD

Trois niveaux de tests, tous automatisés dans le pipeline GitHub Actions
(`.github/workflows/`) :

- **Unitaires** (Jest, `api/src/**/*.spec.ts`) — services testés isolément
  avec des repositories mockés, sans base de données. `npm test` (dans
  `api/`), ou `npm run test:cov` pour la couverture.
- **Intégration** (Jest + Supertest, `api/test/*.e2e-spec.ts`) — l'application
  Nest complète, testée via de vraies requêtes HTTP contre une vraie base
  Postgres. `npm run test:e2e` (nécessite `DATABASE_URL`, migrations déjà
  appliquées).
- **End-to-end** (Cypress, `client/cypress/e2e/*.cy.js`) — parcours complets
  dans un vrai navigateur, contre la stack `docker compose` entière (front +
  API + Postgres). `npm run cypress:run` (dans `client/`, nécessite la stack
  démarrée sur `http://localhost:3000`).

`scripts/smoketest.ts` reste dans le repo comme outil manuel (HTTP pur, pas
besoin d'installer quoi que ce soit d'autre) — pratique pour un check rapide
après un déploiement, mais ce n'est plus lui qui fait foi en CI.

**Pipeline** (`main.yml`, un job par fichier dans `.github/workflows/`) :
`Linter-and-Tests` (typecheck + unitaires + build + intégration) tourne en
parallèle de `Secret-Scanning` (Gitleaks) et `IaC-Security-Checkov`, puis
déclenche `SAST-Semgrep` et `SCA-Dependency-Scan` (`npm audit`). Une fois ces
vérifications passées, `Docker-Build-and-Security` construit l'image et la
scanne (Trivy, bloquant sur CRITICAL/HIGH), avant de lancer en parallèle
`Load-Testing` (Siege), `DAST-OWASP-ZAP` et `E2E-Cypress` contre la stack
`docker compose` complète. `Deploy-Staging` ne se déclenche que sur
`main`/`master`, une fois tout le reste au vert : il se connecte en SSH au
VPS de staging (secrets `STAGING_SSH_HOST`/`STAGING_SSH_USER`/
`STAGING_SSH_KEY`) et relance la stack avec `docker-compose.staging.yml`.
Voir [Déploiement staging (VPS)](#déploiement-staging-vps) ci-dessous. La
prod (VPS séparé ou même VPS, job CI équivalent) est différée à plus tard.

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
- Accès base de données via TypeORM (repositories + requêtes paramétrées),
  jamais de concaténation de SQL brut — protection native contre les
  injections SQL.
- Upload de photos : type MIME vérifié côté serveur (JPEG/PNG/WebP
  uniquement), taille limitée à 5 Mo, nom de fichier régénéré aléatoirement
  côté serveur, réservé aux administrateurs authentifiés.
- Le flag `Secure` des cookies (`COOKIE_SECURE` dans `api/src/config.ts`)
  est découplé de `NODE_ENV` : un avertissement s'affiche au démarrage si la
  configuration risque de casser silencieusement la connexion admin (HTTP
  sans TLS en environnement « production »).
- React échappe systématiquement les données affichées (pas de
  `dangerouslySetInnerHTML`), ce qui prévient les attaques XSS par défaut.
