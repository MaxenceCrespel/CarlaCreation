# Mise en production — carlacreation.fr

Situation de départ : le staging actuel (`staging.carlacreation.fr`, dossier
`/opt/carla-creation` du VPS) est utilisé par de vraies clientes et contient
les données définitives. Sa base devient la base de la prod. La prod vit sur
`carlacreation.fr`, dans une stack **séparée** (`/opt/carla-prod`, projet
Compose `carla-prod`) ; le staging actuel reste intact tant que la bascule
n'a pas eu lieu.

Code déployé : branche `release/prod-ready` (puis `main` après la bascule).

---

## Phase 0 — Inventaire (sur le VPS, rien ne change)

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'   # port réel du staging (3001 ? 3000 ?)
ls /opt; cat /opt/carla-creation/deploy/Caddyfile
docker volume ls
df -h /
```

- Vérifié le 23/10 : staging sur `127.0.0.1:3001`, Caddy = projet `deploy`
  (conteneur `deploy-caddy-1`), VPS partagé avec `usronchin.fr` (port 8080).

## Phase 1 — DNS

Chez le registrar, enregistrements **A** vers l'IP du VPS : `carlacreation.fr`, `www`
(`staging.` et `www.` existent déjà). Pas d'environnement de pré-release.

## Phase 2 — Préparer la prod (aucun impact sur les clientes)

```bash
sudo git clone git@github.com:MaxenceCrespel/CarlaCreation.git /opt/carla-prod   # ou chown ensuite
cd /opt/carla-prod && git checkout release/prod-ready
cp .env.example .env
```

`.env` racine de `/opt/carla-prod` :
```
DOMAIN=carlacreation.fr
JWT_SECRET=<openssl rand -hex 64>
PROD_JWT_SECRET=<un AUTRE openssl rand -hex 64>
```

`api/.env` : copier celui de `/opt/carla-creation/api/.env`, puis, **pour la
répétition**, désactiver l'envoi d'emails (mettre les lignes `SMTP_*` en
commentaire) : la copie des données contient les vraies adresses des clientes
et ses tâches planifiées (rappels J-1, anniversaires) leur enverraient des
doublons. Garder les clés Stripe de **test**.

Caddy — **ne pas remplacer le Caddyfile du VPS** : il contient aussi
`usronchin.fr` (autre application). On ajoute le bloc à la main, puis on
recharge sans coupure :
```bash
cd /opt/carla-creation/deploy        # c'est de là que Caddy lit son fichier
cp Caddyfile ~/Caddyfile.avant-prod  # sauvegarde
nano Caddyfile                       # ajouter, sans toucher au reste :
#   carlacreation.fr {
#   	reverse_proxy 127.0.0.1:3000
#   }
docker exec deploy-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec deploy-caddy-1 caddy reload   --config /etc/caddy/Caddyfile
```
Vérifier que `staging.carlacreation.fr` et `usronchin.fr` répondent toujours.
(Ce dossier doit rester en place tant que Caddy y est branché ; ne plus y faire
de `git pull`.)

## Phase 3 — Répétition sur une copie des vraies données

```bash
cd /opt/carla-prod
CONFIRM=yes ./deploy/migrate-staging-to-prod.sh      # sans --freeze : le staging continue de tourner
```

Le script sauvegarde la base + les photos (`~/backups`), restaure dans la prod,
applique les migrations (dont `AddAccountLifecycle`) et compare les effectifs.
Il est répétable. Tester sur https://carlacreation.fr :

- connexion admin (mot de passe du staging), réservations existantes visibles,
  photos de la galerie, factures ;
- parcours de réservation, paiement avec carte de **test**, compte client,
  parrainage ;
- comptes existants : connexion directe (déjà marqués « email vérifié »).

Ne rien annoncer aux clientes pendant cette phase.

## Phase 4 — La bascule (créneau calme, ~15 min)

1. `cd /opt/carla-prod && CONFIRM=yes ./deploy/migrate-staging-to-prod.sh --freeze`
   (arrête le staging : plus de réservation possible dessus, copie finale).
2. `api/.env` de la prod : remettre les `SMTP_*`, passer aux clés Stripe **live**
   (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) ; `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d web`.
3. Stripe (mode live) : webhook `https://carlacreation.fr/api/stripe/webhook`.
4. Caddy définitif : dans `/opt/carla-creation/deploy/Caddyfile`, remplacer le
   contenu du bloc `staging.carlacreation.fr` par
   `redir https://carlacreation.fr{uri} permanent`, ajouter le bloc
   `www.carlacreation.fr { redir https://carlacreation.fr{uri} permanent }`,
   puis `validate` + `reload` comme en phase 2. Effet : `staging.carlacreation.fr/<chemin>` → `https://carlacreation.fr/<chemin>`
   (redirection permanente, chemin conservé : les liens « mon rendez-vous » des
   anciens emails continuent de marcher).
5. Tests de fumée : une redirection depuis un ancien lien, connexion admin, une
   réservation « payer sur place » avec réception de l'email, un petit
   paiement réel (à rembourser ensuite).
6. Admin : réactiver les notifications push et réinstaller l'application sur
   l'écran d'accueil (liées à l'ancienne adresse). Les clientes devront se
   reconnecter (sessions propres à chaque adresse).

**Retour arrière** (tant que l'ancien dossier est intact) : `docker start` du
conteneur `web` de `/opt/carla-creation`, puis remettre le bloc `staging.carlacreation.fr`
d'origine (`reverse_proxy 127.0.0.1:3001`) et recharger Caddy (le staging continue alors de servir l'ancienne base ; les réservations prises
sur la prod entre-temps seraient à reporter à la main).

## Phase 5 — Après la bascule

1. Pull request `release/prod-ready` → `main` (la CI tourne ; elle ne déploie
   rien). Pas d'environnement de pré-release : on teste en local et avec la
   répétition de la phase 3 avant chaque grosse évolution.
2. Prod : déploiement manuel uniquement — workflow **Deploy Production**
   (Actions → Run workflow, taper `deploy`, branche `main`).
3. Arrêter l'ancien staging (`docker compose stop` dans `/opt/carla-creation`)
   après 2 à 4 semaines, une fois les sauvegardes de `~/backups` vérifiées, puis
   supprimer ses volumes. **Garder le dossier `/opt/carla-creation`** tant que
   Caddy y est branché.
