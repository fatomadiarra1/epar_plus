# ÉPARGNE PLUS

Application web bancaire premium de **gestion d'épargne quotidienne** : plusieurs membres effectuent une épargne journalière avec un suivi détaillé de tous les versements.

Interface moderne inspirée des applications bancaires (Revolut, N26, Orange Money) : **glassmorphism**, **dark/light mode**, animations fluides, dashboards et statistiques.

---

## ✨ Fonctionnalités

### Premier lancement
- Au tout premier lancement, l'administrateur crée son propre compte (nom, prénom, identifiant, mot de passe)
- La base de données est vierge : aucun membre ni dépôt pré-enregistré
- Possibilité de charger un jeu de données de démonstration depuis Paramètres

### Page de connexion
- Carte centrée, fond dégradé, animation d'entrée
- Identifiant + mot de passe (afficher/masquer)
- « Se souvenir de moi », « Mot de passe oublié »

### Espace Administrateur
- 🏠 **Tableau de bord** — 6 cartes statistiques animées (compteurs dynamiques) + graphique d'évolution + top épargnants + activité récente
- 👥 **Gestion des Membres** — formulaire CRUD (Ajouter / Modifier / Supprimer / Réinitialiser), tableau avec avatar, recherche instantanée, pagination
- 💰 **Gestion des Dépôts** — sélection du membre, calcul automatique des jours (**1000 FCFA = 1 jour**), date & heure générées automatiquement
- 📋 **Historique complet** — recherche, filtrage (période / membre), tri par colonne, export **PDF** & **Excel**
- 📊 **Rapports** — journalier, hebdomadaire, mensuel, annuel + export PDF/Excel
- 📈 **Statistiques** — 4 graphiques Chart.js (évolution, par utilisateur, répartition des montants, activité mensuelle)
- ⚙️ **Paramètres** — profil admin, changement de mot de passe, règle métier, réinitialisation des données

### Espace Utilisateur (membre)
L'utilisateur ne voit **que ses propres informations**.
- 🏠 **Tableau de bord** — total épargné, jours, dernier dépôt, nombre de versements + graphique + historique personnel
- 💰 **Mon Épargne** — informations, progression visuelle, graphique interactif
- 📋 **Mes Dépôts** — tableau complet (date, heure, montant, jours) — aucun historique supprimé
- 📄 **Mon Relevé** — relevé détaillé avec cumul + export PDF
- 👤 **Mon Profil** — modifier profil, changer mot de passe

---

## 🎨 Charte graphique

| Couleur | Code |
|---|---|
| Bleu Marine | `#0F172A` |
| Bleu Premium | `#2563EB` |
| Blanc | `#FFFFFF` |
| Gris Clair | `#F1F5F9` |
| Or | `#F59E0B` |

Style : design bancaire premium, cartes avec ombre élégante, coins arrondis (20px), boutons modernes, effets de survol.

---

## 🧱 Stack technique

- **Frontend** : HTML5, CSS3 (variables, glassmorphism, responsive), JavaScript ES6 (vanilla, sans framework)
- **Graphiques** : [Chart.js](https://www.chartjs.org/)
- **Exports** : [jsPDF](https://github.com/parallax/jsPDF) + AutoTable (PDF), [SheetJS](https://sheetjs.com/) (Excel)
- **Persistance (démo)** : `localStorage` — `js/data.js` simule le backend (PHP/Node + MySQL/Firebase). Remplacez les fonctions de ce fichier par de vrais appels API pour brancher un backend.

---

## 🚀 Lancer le projet

Aucune compilation nécessaire. Servez le dossier avec n'importe quel serveur statique :

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Puis ouvrez `http://localhost:8080`.

> ⚠️ Ouvrir `index.html` directement via `file://` fonctionne aussi, mais un serveur local est recommandé pour les CDN.

### Premier lancement

Au premier lancement, l'application affiche un formulaire de configuration où vous créez votre compte administrateur. Ensuite vous êtes redirigé vers le tableau de bord admin.

Pour tester rapidement avec des données d'exemple, allez dans **Paramètres → Charger les données de démonstration**. Cela ajoute 7 membres fictifs avec un historique de dépôts.

---

## 📁 Structure

```
epargne-pro-plus/
├── index.html          # Page de connexion
├── admin.html          # Espace administrateur
├── user.html           # Espace utilisateur
├── css/
│   ├── styles.css      # Design system (tokens, composants, thèmes)
│   ├── app.css         # Layout dashboard (sidebar, cartes, charts)
│   └── auth.css        # Page de connexion
└── js/
    ├── data.js         # Couche données (localStorage) + auth + règles métier
    ├── utils.js        # Formatage, thème, toasts, modales, exports
    ├── charts.js       # Graphiques Chart.js (thème-aware)
    ├── auth.js         # Contrôleur de la page de connexion
    ├── admin.js        # Contrôleur espace admin
    └── user.js         # Contrôleur espace utilisateur
```

---

## 🔒 Sécurité

Le projet est un **front-end de démonstration**. Les bonnes pratiques prévues pour l'intégration backend :

- Authentification sécurisée (hash des mots de passe côté serveur, JWT/sessions)
- Gestion des rôles (admin / utilisateur) — déjà cloisonnée côté UI
- Journalisation des actions (déjà implémentée en démo)
- Protection contre les injections SQL (requêtes préparées)
- Protection XSS (échappement HTML appliqué côté front via `escapeHtml`)
- Sessions sécurisées (cookies `HttpOnly`/`Secure` côté serveur)

> En production, ne jamais stocker les mots de passe en clair : remplacer `js/data.js` par une vraie API.
