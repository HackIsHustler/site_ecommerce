# E-commerce Backend — Django REST Framework

API REST pour un site e-commerce (produits, catégories, authentification JWT)
+ un dashboard HTML/JS autonome pour tester l'intégration.

## Stack

- Django + Django REST Framework (API)
- JWT (djangorestframework-simplejwt) pour l'authentification
- django-cors-headers (pour que le dashboard front en local puisse appeler l'API)
- django-filter (recherche / filtres sur les produits)
- SQLite en base par défaut (dev)
- Django Admin activé pour gérer produits/catégories visuellement

## Installation

```bash
# 1. Environnement virtuel (isole les packages du reste de ta machine)
python -m venv venv
source venv/bin/activate        # Windows (cmd) : venv\Scripts\activate
                                # Windows (PowerShell) : venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Fichier .env (configuration locale, jamais commité)
cp .env.example .env            # Windows : copy .env.example .env
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
# -> copie la clé affichée dans .env à la ligne SECRET_KEY=

# 3. Base de données + lancement
python manage.py migrate
python manage.py createsuperuser   # crée ton compte admin
python manage.py runserver
```

Pour quitter le venv : `deactivate`. À chaque nouvelle session de travail,
réactive-le avec `source venv/bin/activate`.

### Variables du fichier `.env`

| Variable               | Rôle                                                        |
|------------------------|--------------------------------------------------------------|
| `SECRET_KEY`           | Clé secrète Django (obligatoire, unique par environnement)   |
| `DEBUG`                | `True` en dev, `False` en production                         |
| `ALLOWED_HOSTS`        | Hôtes autorisés, séparés par des virgules                    |
| `CORS_ALLOWED_ORIGINS` | URLs des frontends autorisés (ex: `http://127.0.0.1:5500`)   |

Si tu sers les pages `frontend/` sur un autre port, ajoute-le dans
`CORS_ALLOWED_ORIGINS`, sinon le navigateur bloquera les appels à l'API.

L'API tourne sur **http://127.0.0.1:8000/**

## Endpoints principaux

| Méthode | URL                          | Auth requise | Description                          |
|---------|------------------------------|--------------|---------------------------------------|
| POST    | `/api/auth/register/`        | non          | Créer un compte                       |
| POST    | `/api/auth/login/`           | non          | Login → renvoie `access` + `refresh`  |
| POST    | `/api/auth/login/refresh/`   | non          | Renouveler le token `access`          |
| GET     | `/api/auth/me/`               | oui          | Profil de l'utilisateur connecté      |
| GET     | `/api/categories/`            | non          | Liste des catégories                  |
| POST    | `/api/categories/`            | oui          | Créer une catégorie                   |
| GET     | `/api/products/`               | non          | Liste des produits (paginée)          |
| POST    | `/api/products/`               | oui          | Créer un produit                      |
| GET/PUT/PATCH/DELETE | `/api/products/{id}/`  | lecture libre / écriture oui | Détail, modif, suppression |
| GET     | `/admin/`                      | superuser    | Interface d'admin Django              |

### Panier (invité, sans compte) et commandes

Le panier est identifié par un **token UUID généré côté frontend** (stocké
en `localStorage`), pas besoin de compte pour l'utiliser.

| Méthode | URL                                          | Description                                    |
|---------|-----------------------------------------------|-------------------------------------------------|
| GET     | `/api/cart/<token>/`                          | Récupère (ou crée) le panier                    |
| POST    | `/api/cart/<token>/items/`                    | Ajoute un produit `{product, quantity}`         |
| PATCH   | `/api/cart/<token>/items/<product_id>/`       | Change la quantité `{quantity}` (0 = supprime)  |
| DELETE  | `/api/cart/<token>/items/<product_id>/`       | Retire le produit du panier                     |
| POST    | `/api/cart/<token>/checkout/`                 | Transforme le panier en commande, vide le panier, décrémente le stock |
| GET     | `/api/orders/<id>/`                           | Détail d'une commande                           |

Filtres disponibles sur `/api/products/` : `?search=texte`, `?category=<id>`,
`?is_active=true`, `?ordering=price` ou `?ordering=-price`.

## Tester rapidement avec curl

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"TON_MOT_DE_PASSE"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")

# 2. Créer une catégorie
curl -X POST http://127.0.0.1:8000/api/categories/ \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Electronique"}'

# 3. Créer un produit
curl -X POST http://127.0.0.1:8000/api/products/ \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Clavier mecanique","price":"49.99","stock":10,"category":1}'

# 4. Lister les produits (public, pas besoin de token)
curl http://127.0.0.1:8000/api/products/
```

Tu peux aussi tester directement dans le navigateur via l'**API navigable de
DRF** : va sur `http://127.0.0.1:8000/api/products/`, tu auras un formulaire
HTML généré automatiquement (login via `/api-auth/login/`).

## Dashboard de test (frontend séparé)

Le fichier `frontend/dashboard.html` est une page HTML/JS autonome (aucune
dépendance, aucun build) qui te permet de :
- te connecter (JWT) ou créer un compte,
- créer des catégories,
- ajouter un produit (avec image),
- lister / rechercher / filtrer / supprimer des produits.

**Important** : ne l'ouvre pas directement en double-cliquant (`file://`),
car certains navigateurs bloquent les requêtes CORS depuis une origine
`file://`. Sers-le plutôt via un petit serveur local :

```bash
cd frontend
python -m http.server 5500
```

Puis ouvre `http://127.0.0.1:5500/dashboard.html`. Assure-toi que le champ
"API base" en haut de la page pointe bien vers
`http://127.0.0.1:8000/api` (valeur par défaut).

Compte de test déjà utilisé pendant le développement : `admin` /
`admin12345` (à changer avec `createsuperuser` si tu repars de zéro).

## Page vitrine (visiteurs) — `frontend/index.html`

Page publique pour les visiteurs : catalogue des produits actifs, recherche,
filtre par catégorie, panier (invité, aucun compte requis) et validation de
commande. Le panier est identifié par un token UUID stocké en
`localStorage` du navigateur du visiteur.

Sers-la avec le même serveur local que le dashboard :

```bash
cd frontend
python -m http.server 5500
```

Puis ouvre `http://127.0.0.1:5500/index.html`.

Flux testé : ajout au panier → modification de quantité → validation de
commande (nom + email) → le stock du produit est décrémenté côté backend et
la commande apparaît dans `/admin/` (modèle **Order**).

## Structure du projet

```
ecommerce_backend/
├── config/            # settings, urls racine
├── products/           # modèles Category & Product, API CRUD
├── orders/             # panier invité, commandes (Cart/CartItem/Order/OrderItem)
├── accounts/           # inscription + JWT (login/refresh/me)
├── frontend/
│   ├── index.html      # page vitrine publique (catalogue + panier + checkout)
│   └── dashboard.html   # dashboard de test back-office (produits/catégories)
├── requirements.txt
└── manage.py
```

## Pour aller plus loin

- Ajouter panier / commandes (une app `orders` avec `Cart`, `CartItem`, `Order`)
- Passer les permissions produits à `IsAdminUser` si seuls les admins doivent
  pouvoir écrire (actuellement : tout utilisateur authentifié peut créer/modifier)
- Remplacer SQLite par PostgreSQL pour la prod
- Ajouter des tests (`pytest-django` ou `TestCase` de Django)
- Générer une doc OpenAPI avec `drf-spectacular`
