# Base de test séparée de la vraie

Aujourd'hui, chaque changement de structure s'applique directement sur la base de **SUCCESS KIDS**. Une base de test permet d'essayer d'abord sur une copie **vide**, sans aucune donnée réelle.

## Ce qu'il faut (gratuit)

Un **deuxième projet Supabase** gratuit. Supabase limite le nombre de projets gratuits actifs par compte : si la limite est atteinte, il faut mettre en pause un projet que vous n'utilisez plus (par exemple un ancien essai).

## Étape 1 : créer le projet (vous)

1. Ouvrez https://supabase.com/dashboard puis cliquez sur **New project**.
2. **Name** : `ecomaz-test`. Région : la même que le projet EcoMaZ.
3. **Database password** : choisissez-en un et notez-le sur papier.
4. Cliquez sur **Create new project**, puis attendez environ 2 minutes.
5. Copiez son identifiant : **Project Settings → General → Project ID**.

## Étape 2 : installer la structure (Claude)

Donnez l'identifiant à Claude. Il lance :

```
sh tools/base-test/preparer-base-test.sh <identifiant>
```

Le script **refuse** de toucher au projet de la vraie école.
