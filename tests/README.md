# Tests automatisés EcoMaZ

Vérifie automatiquement les règles de sécurité critiques (authentification, isolation entre écoles, masquage des données sensibles, fonctions serveur) — à relancer après toute modification touchant la base de données ou les fonctions Edge.

## Première utilisation

1. Copie `.env.test.example` vers `.env.test` (même dossier)
2. Remplis `.env.test` avec de vrais identifiants de test (jamais les identifiants d'un vrai compte de production si possible — sinon un compte enseignant/secrétariat/développeur existant suffit, les tests ne modifient aucune donnée)
3. **`.env.test` ne doit JAMAIS être déposé sur GitHub** — vérifie qu'il n'est pas sélectionné lors d'un prochain dépôt de fichiers (le `.gitignore` protège seulement si on utilise un vrai outil Git, pas le dépôt manuel par navigateur)

## Lancer les tests

```bash
node rls.test.mjs
```

Nécessite uniquement Node.js (déjà installé) — aucune autre installation.

## Que fait ce script ?

Il se connecte avec de vrais comptes et vérifie que les permissions sont bien celles attendues : un enseignant ne peut pas lire les données sensibles d'un collègue, ne voit que sa propre école, les fonctions serveur refusent les demandes invalides, etc. Il ne modifie et ne supprime aucune donnée.
