# Paiement de la scolarité par Mobile Money — guide pour la Direction de l'école

Avec ce service, les parents paient la scolarité depuis leur téléphone
(Orange Money, MTN, Moov, Wave, Djamo ou carte). **L'argent arrive
directement sur le compte de votre école** : EcoMaZ ne touche jamais à
l'argent des parents. Le paiement s'enregistre tout seul dans EcoMaZ,
avec son reçu.

- Inscription gratuite, sans abonnement ni carte bancaire.
- PayDunya prélève une petite commission sur chaque paiement reçu.
- Durée : environ 20 minutes, puis quelques jours de vérification par PayDunya.

## À préparer

- L'adresse e-mail de l'école (ou de la Direction) et un numéro de téléphone.
- La pièce d'identité du responsable de l'école.
- Les documents officiels de l'école (registre de commerce ou autorisation
  d'ouverture), que PayDunya peut demander.

## Étape 1 — Créer le compte de l'école

1. Ouvrir **https://paydunya.com/signup**
2. Choisir le compte **Business** (entreprise).
3. Nom de l'entreprise : **le nom de votre école**. Pays : **Côte d'Ivoire**.
4. Choisir un mot de passe et **le garder secret** (ne le donner à personne,
   même pas à EcoMaZ).
5. Ouvrir l'e-mail envoyé par PayDunya et cliquer sur le lien de confirmation.

## Étape 2 — Compléter le profil

1. Remplir le **profil du gestionnaire de compte** (le responsable de l'école).
2. Remplir les **informations de l'entreprise** :
   - Secteur : **Service** (il n’y a pas de case « Éducation ») ;
   - Pays : **Côte d'Ivoire** ;
   - Volume des ventes : la tranche qui correspond aux frais de scolarité annuels ;
   - Employés : selon votre école.
3. Envoyer les documents demandés et attendre la validation de PayDunya.

## Étape 3 — Créer « l'application » EcoMaZ dans PayDunya

1. Menu de gauche : **Intégrez notre API**.
2. Cliquer sur **Configurer une nouvelle application**.
3. Nom de l'application : **EcoMaZ**. Site web : `https://vehizohjunior.github.io/ecomaz-app/`
4. Choisir **Activer le mode de production** (« Oui, l'application est prête »).
5. PayDunya affiche alors les **clés de production** (Master Key, Private Key,
   Token). Les clés qui commencent par `test_` ne fonctionnent pas avec EcoMaZ.

## Étape 4 — Brancher le compte sur EcoMaZ (avec EcoMaZ, sur place)

Les clés sont saisies **ensemble, sur place ou au téléphone**, directement
dans la console EcoMaZ : elles ne sont **jamais envoyées par SMS, WhatsApp
ou e-mail**. Une fois enregistrées, plus personne ne peut les relire, ni
dans l'école ni chez EcoMaZ : seul le serveur s'en sert.

EcoMaZ fait ensuite un premier paiement réel de faible montant (par exemple
100 F CFA) pour vérifier que tout fonctionne, puis le service est ouvert.

## Ensuite, au quotidien

- Le secrétariat crée un **lien de paiement** depuis la fiche de l'élève et
  l'envoie au parent.
- Le parent paie sur son téléphone.
- Le paiement apparaît **tout seul** dans EcoMaZ, avec le mode « Mobile Money ».
- L'école retire son argent depuis son compte PayDunya (menu **Retirer de
  l'argent**) vers son Mobile Money ou sa banque.
