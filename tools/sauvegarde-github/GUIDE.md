# Sauvegarde automatique d'EcoMaZ sans votre ordinateur

Aujourd'hui, la sauvegarde se fait chaque soir **sur votre PC**. S'il est éteint, en panne ou volé, il n'y a plus de sauvegarde.
Ce guide met en place une **deuxième sauvegarde, gratuite**, faite chaque soir à 19 h par GitHub, **chiffrée** avec une phrase que vous seul connaissez.

La sauvegarde de votre PC continue en parallèle. Les deux se complètent.

---

## Étape 1 : créer un dépôt PRIVÉ sur GitHub (5 minutes)

1. Ouvrez https://github.com/new
2. **Repository name** : `ecomaz-sauvegardes`
3. Cochez **Private**. C'est très important : surtout pas « Public ».
4. Cochez **Add a README file**.
5. Cliquez sur **Create repository**.

## Étape 2 : copier l'adresse de la base de données

1. Ouvrez https://supabase.com/dashboard, puis le projet EcoMaZ.
2. En haut, cliquez sur **Connect**.
3. Choisissez **Session pooler**. Ne prenez pas « Direct connection » : GitHub ne peut pas l'utiliser.
4. Copiez l'adresse qui commence par `postgresql://postgres.hvqtsvpkxffseclsfoun:`
5. Dans cette adresse, remplacez `[YOUR-PASSWORD]` par le mot de passe de la base de données.
   - Si vous l'avez oublié : **Project Settings → Database → Reset database password**.
   - Notez le nouveau mot de passe sur papier.

## Étape 3 : choisir la phrase secrète de chiffrement

Choisissez une phrase longue, par exemple 5 ou 6 mots sans lien entre eux, avec un chiffre.
**Écrivez-la sur papier et rangez-la en lieu sûr.**

> ⚠️ Sans cette phrase, les sauvegardes sont **illisibles pour tout le monde, vous compris**. Si vous la perdez, personne ne pourra la retrouver.

## Étape 4 : enregistrer les 2 secrets dans le dépôt

Dans le dépôt `ecomaz-sauvegardes` : **Settings → Secrets and variables → Actions → New repository secret**.

| Name | Secret |
|---|---|
| `ECOMAZ_DB_URL` | l'adresse complète de l'étape 2 (avec le mot de passe) |
| `ECOMAZ_PHRASE_SAUVEGARDE` | la phrase de l'étape 3 |

GitHub garde ces secrets chiffrés : personne ne peut les relire, même vous. On peut seulement les remplacer.

## Étape 5 : ajouter le programme de sauvegarde

1. Dans le dépôt, cliquez sur **Add file → Create new file**.
2. Nom du fichier, à recopier exactement : `.github/workflows/sauvegarde.yml`
3. Collez tout le contenu du fichier `tools/sauvegarde-github/sauvegarde.yml` (dans le dossier EcoMaZgit).
4. Cliquez sur **Commit changes**.

(Ou dites-le à Claude une fois le dépôt créé et les secrets enregistrés : il le mettra en place pour vous.)

## Étape 6 : premier essai

1. Onglet **Actions → Sauvegarde EcoMaZ → Run workflow**.
2. Attendez environ 2 minutes. Une **coche verte** veut dire que la sauvegarde est faite.
3. Cliquez sur l'exécution : en bas, la sauvegarde apparaît dans **Artifacts**.

Ensuite, cela se fait **tout seul chaque soir à 19 h**. Chaque sauvegarde est gardée 30 jours.

---

## En cas de besoin : relire une sauvegarde

1. Téléchargez la sauvegarde voulue (onglet Actions → l'exécution du jour → Artifacts).
2. Dans le dossier téléchargé, ouvrez un terminal et tapez la commande ci-dessous. La phrase secrète vous sera demandée.

```
gpg --decrypt ecomaz-AAAA-MM-JJ.tar.gpg > ecomaz.tar
```

3. Le fichier `ecomaz.tar` contient `public.dump` (les données des écoles) et `auth.dump` (les comptes de connexion). Pour les remettre dans une base, demandez à Claude : la restauration se fait avec `pg_restore`.

**Ce qui n'est pas dans cette sauvegarde** : les photos et vidéos de « Vie de l'école » et les photos de pointage. Elles sont rangées à part, dans le stockage de Supabase.
