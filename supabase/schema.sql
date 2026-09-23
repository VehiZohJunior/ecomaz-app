-- =====================================================================
-- ECOLEMANAGER — SCHÉMA MULTI-ÉCOLES (SUPABASE / POSTGRESQL)
-- =====================================================================
-- À exécuter une seule fois dans : Supabase → SQL Editor → New query
-- Ce script crée toutes les tables, active la sécurité au niveau des
-- lignes (RLS) et isole totalement les données de chaque école cliente.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. ÉCOLES (tenants) & PROFILS UTILISATEURS
-- ---------------------------------------------------------------------
create table ecoles (
  id uuid primary key default gen_random_uuid(),
  nom_ecole text not null default 'Nouvelle École',
  adresse text default '',
  telephone text default '',
  annee_scolaire text default '2025-2026',
  directeur_nom text default '',
  fondateur_nom text default '',
  logo_url text default '',
  loyer_mensuel numeric default 0,
  created_at timestamptz default now()
);

create type role_utilisateur as enum ('enseignant','secretariat','direction','fondation');

-- Un profil = un compte Supabase Auth rattaché à UNE école avec UN rôle.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ecole_id uuid not null references ecoles(id) on delete cascade,
  role role_utilisateur not null,
  nom_complet text default '',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. FONCTIONS UTILITAIRES (pour les règles de sécurité ci-dessous)
-- ---------------------------------------------------------------------
-- IMPORTANT : "security definer" est indispensable ici. Ces fonctions lisent
-- la table "profiles", qui est elle-même protégée par RLS (voir plus bas).
-- Sans "security definer", chaque lecture de profiles redéclencherait sa
-- propre policy RLS (laquelle rappelle ces fonctions) → récursion infinie.
-- "security definer" fait tourner la fonction avec les droits de son
-- propriétaire (qui contourne RLS), donc pas de boucle. "set search_path"
-- est une bonne pratique de sécurité standard pour ce type de fonction.
create or replace function mon_ecole_id() returns uuid
language sql stable security definer set search_path = public as
$$ select ecole_id from profiles where id = auth.uid() $$;

create or replace function mon_role() returns role_utilisateur
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

-- Personnel "administratif" = peut gérer élèves/enseignants/comptabilité
create or replace function est_perso_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select mon_role() in ('secretariat','direction','fondation') $$;

-- Direction/Fondation uniquement = accès complet + paramètres
create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select mon_role() in ('direction','fondation') $$;

-- ---------------------------------------------------------------------
-- 3. STRUCTURE PÉDAGOGIQUE
-- ---------------------------------------------------------------------
create table classes (
  id text primary key,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  nom text not null,
  cycle text not null,
  titulaire_id uuid,
  frais_scolarite numeric default 0
);

create table enseignants (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  matricule text, nom text not null, prenom text not null, sexe text,
  telephone text, email text,
  classes_assignees text[] default '{}', matieres text[] default '{}',
  date_embauche date, statut text default 'Actif', salaire_mensuel numeric default 0
);
alter table classes add constraint fk_titulaire foreign key (titulaire_id) references enseignants(id) on delete set null;

create table eleves (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  matricule text, nom text not null, prenom text not null, sexe text,
  date_naissance date, classe_id text references classes(id),
  parent_nom text, parent_tel text, parent_adresse text,
  date_inscription date, statut text default 'Actif'
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid references eleves(id) on delete cascade,
  matiere text not null, note numeric, note_sur numeric default 20,
  trimestre text, type text, date date
);

create table presences_eleves (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  date date not null, classe_id text references classes(id),
  eleve_id uuid references eleves(id) on delete cascade,
  statut text not null, motif text
);

create table presences_enseignants (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  date date not null, enseignant_id uuid references enseignants(id) on delete cascade,
  statut text not null, motif text
);

create table emploi_temps (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  classe_id text references classes(id),
  jour text not null, slot_index int not null,
  matiere text, enseignant_id uuid references enseignants(id)
);

create table programmes (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  enseignant_id uuid references enseignants(id), classe_id text references classes(id),
  matiere text, trimestre text, contenu text, progression int default 0, date_maj date
);

create table bulletins_commentaires (
  eleve_id uuid references eleves(id) on delete cascade,
  trimestre text,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  commentaire text,
  primary key (eleve_id, trimestre)
);

-- ---------------------------------------------------------------------
-- 4. COMPTABILITÉ
-- ---------------------------------------------------------------------
create table paiements_scolarite (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid references eleves(id) on delete cascade,
  montant numeric not null, tranche text, date date, mode_paiement text
);

create table activites (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  nom text not null, montant_cotisation numeric, periode text
);

create table inscriptions_activites (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid references eleves(id) on delete cascade,
  activite_id uuid references activites(id) on delete cascade,
  date_inscription date
);

create table paiements_cotisations (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid references eleves(id) on delete cascade,
  activite_id uuid references activites(id) on delete cascade,
  montant numeric, date date, mode_paiement text
);

create table gadgets (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  nom text not null, prix_unitaire numeric, stock int default 0
);

create table ventes_gadgets (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  gadget_id uuid references gadgets(id), eleve_id uuid references eleves(id),
  quantite int, montant_total numeric, date date, mode_paiement text
);

create table personnel_autre (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  nom text not null, prenom text not null, sexe text,
  poste text, telephone text, salaire_mensuel numeric,
  date_embauche date, statut text default 'Actif'
);

create table paiements_salaires (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  personnel_id uuid not null, personnel_type text not null,
  mois text not null, montant numeric, date_paiement date, mode_paiement text
);

create table depenses (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  categorie text not null, libelle text, montant numeric, date date, mode_paiement text
);

-- ---------------------------------------------------------------------
-- 5. MESSAGERIE (notifications d'absence/retard)
-- ---------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  date date, heure text,
  destinataire_nom text, destinataire_role text, destinataire_tel text,
  canal text default 'SMS', type text, contenu text,
  eleve_id uuid references eleves(id), enseignant_id uuid references enseignants(id),
  statut text default 'Envoyé'
);

-- ---------------------------------------------------------------------
-- 6. ACTIVATION DE LA SÉCURITÉ AU NIVEAU DES LIGNES (RLS)
--    → Sans policy, une table RLS activée est INACCESSIBLE par défaut.
-- ---------------------------------------------------------------------
alter table ecoles enable row level security;
alter table profiles enable row level security;
alter table classes enable row level security;
alter table enseignants enable row level security;
alter table eleves enable row level security;
alter table notes enable row level security;
alter table presences_eleves enable row level security;
alter table presences_enseignants enable row level security;
alter table emploi_temps enable row level security;
alter table programmes enable row level security;
alter table bulletins_commentaires enable row level security;
alter table paiements_scolarite enable row level security;
alter table activites enable row level security;
alter table inscriptions_activites enable row level security;
alter table paiements_cotisations enable row level security;
alter table gadgets enable row level security;
alter table ventes_gadgets enable row level security;
alter table personnel_autre enable row level security;
alter table paiements_salaires enable row level security;
alter table depenses enable row level security;
alter table messages enable row level security;

-- ---------------------------------------------------------------------
-- 7. RÈGLES D'ACCÈS (policies) — reflètent les 4 interfaces de l'appli
-- ---------------------------------------------------------------------

-- École & profils
create policy "lecture ecole" on ecoles for select using (id = mon_ecole_id());
create policy "modif ecole par admin" on ecoles for update using (id = mon_ecole_id() and est_admin());
create policy "lecture profils" on profiles for select using (ecole_id = mon_ecole_id());
create policy "gestion profils par admin" on profiles for all using (ecole_id = mon_ecole_id() and est_admin());

-- Pédagogie : lecture ET écriture pour TOUT le personnel de l'école (y compris enseignant)
create policy "acces notes" on notes for all using (ecole_id = mon_ecole_id());
create policy "acces presences_eleves" on presences_eleves for all using (ecole_id = mon_ecole_id());
create policy "acces programmes" on programmes for all using (ecole_id = mon_ecole_id());
create policy "acces bulletins" on bulletins_commentaires for all using (ecole_id = mon_ecole_id());

-- Emploi du temps : lecture pour tous, écriture réservée au personnel admin
create policy "lecture emploi_temps" on emploi_temps for select using (ecole_id = mon_ecole_id());
create policy "ecriture emploi_temps" on emploi_temps for insert with check (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "maj emploi_temps" on emploi_temps for update using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "suppr emploi_temps" on emploi_temps for delete using (ecole_id = mon_ecole_id() and est_perso_admin());

-- Élèves : lecture pour tous (nécessaire pour saisir les notes), écriture réservée au personnel admin
create policy "lecture eleves" on eleves for select using (ecole_id = mon_ecole_id());
create policy "ecriture eleves" on eleves for insert with check (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "maj eleves" on eleves for update using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "suppr eleves" on eleves for delete using (ecole_id = mon_ecole_id() and est_perso_admin());

-- Classes, enseignants, présences enseignants : réservés au personnel admin
create policy "acces classes" on classes for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "lecture classes tous" on classes for select using (ecole_id = mon_ecole_id());
create policy "acces enseignants" on enseignants for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "lecture enseignants tous" on enseignants for select using (ecole_id = mon_ecole_id());
create policy "acces presences_enseignants" on presences_enseignants for all using (ecole_id = mon_ecole_id() and est_perso_admin());

-- Comptabilité : réservée au personnel admin
-- (le masquage des totaux pour le Secrétariat reste géré côté interface, comme aujourd'hui)
create policy "acces paiements_scolarite" on paiements_scolarite for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces activites" on activites for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces inscriptions_activites" on inscriptions_activites for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces paiements_cotisations" on paiements_cotisations for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces gadgets" on gadgets for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces ventes_gadgets" on ventes_gadgets for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces personnel_autre" on personnel_autre for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces paiements_salaires" on paiements_salaires for all using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "acces depenses" on depenses for all using (ecole_id = mon_ecole_id() and est_perso_admin());

-- Messagerie : consultation réservée au personnel admin,
-- mais un enseignant doit pouvoir DÉCLENCHER un message d'absence
create policy "lecture messages" on messages for select using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "creation messages" on messages for insert with check (ecole_id = mon_ecole_id());

-- =====================================================================
-- FIN DU SCRIPT — la base est prête, isolée par école, et sécurisée.
-- =====================================================================

-- =====================================================================
-- 8. ONBOARDING D'UNE NOUVELLE ÉCOLE CLIENTE (à faire pour chaque client)
-- =====================================================================
-- Ce logiciel est vendu par abonnement école par école, pas en libre-
-- service : il n'y a volontairement PAS de page d'inscription publique
-- (ça éviterait des créations de comptes non désirées). L'onboarding
-- d'une nouvelle école se fait donc en 3 étapes, à la main, à chaque
-- nouvelle vente :
--
-- 1) Créer l'école :
--    insert into ecoles (nom_ecole) values ('Success Kids') returning id;
--    → note le uuid retourné, il servira ci-dessous.
--
-- 2) Créer un compte pour chaque membre du personnel :
--    Dashboard Supabase → Authentication → Add user (email + mot de passe).
--    → note le uuid de chaque utilisateur créé.
--
-- 3) Rattacher chaque compte à l'école avec son rôle :
--    insert into profiles (id, ecole_id, role, nom_complet) values
--    ('<uuid-utilisateur>', '<uuid-ecole>', 'direction', 'Kouassi Jean-Baptiste');
--
-- (Cette étape utilise la clé service_role dans le SQL Editor, qui
-- contourne volontairement RLS pour cette opération d'administration —
-- jamais cette clé ne doit être utilisée ailleurs que dans le SQL Editor
-- ou un script serveur de confiance.)
-- =====================================================================

-- =====================================================================
-- 9. CORRECTIF — messages ne doit pas bloquer la suppression d'un élève
--    ou d'un enseignant (détecté lors des tests, 19/08/2026)
-- =====================================================================
-- À exécuter UNE FOIS dans le SQL Editor si ce n'est pas déjà fait.
-- Sans ce correctif, supprimer un élève (ou un enseignant) qui a reçu
-- au moins une notification d'absence échoue avec une erreur de
-- contrainte de clé étrangère. On choisit de CONSERVER l'historique des
-- messages (utile en cas de litige/audit) plutôt que de les supprimer :
-- la référence est juste mise à NULL si l'élève/enseignant est supprimé.

alter table messages drop constraint if exists messages_eleve_id_fkey;
alter table messages add constraint messages_eleve_id_fkey
  foreign key (eleve_id) references eleves(id) on delete set null;

alter table messages drop constraint if exists messages_enseignant_id_fkey;
alter table messages add constraint messages_enseignant_id_fkey
  foreign key (enseignant_id) references enseignants(id) on delete set null;

-- =====================================================================
-- 10. CORRECTIF — aucune policy de suppression n'existait sur "messages"
--     (détecté lors des tests, 19/08/2026). Sans elle, personne — pas
--     même Direction/Fondation — ne peut supprimer un message, même
--     pour corriger une erreur.
-- =====================================================================
create policy "suppression messages" on messages for delete
  using (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 11. NIVEAUX SCOLAIRES CONFIGURABLES (Préscolaire → Lycée)
-- =====================================================================
-- Permet à chaque école cliente de choisir les niveaux qu'elle couvre.
alter table ecoles add column if not exists niveaux text[] default '{prescolaire,primaire}';

-- =====================================================================
-- 12. MODULE POINTAGE — badges QR enseignants + horodatage arrivée/départ
-- =====================================================================
-- Chaque enseignant reçoit un jeton QR unique et permanent (imprimé sur
-- papier). Le scan au bureau du secrétariat horodate son arrivée/départ
-- et calcule automatiquement le retard par rapport à l'heure attendue.

alter table enseignants add column if not exists qr_token uuid default gen_random_uuid();
update enseignants set qr_token = gen_random_uuid() where qr_token is null;
create unique index if not exists enseignants_qr_token_idx on enseignants(qr_token);

alter table presences_enseignants add column if not exists heure_arrivee time;
alter table presences_enseignants add column if not exists heure_depart time;
alter table presences_enseignants add column if not exists methode text default 'Manuel';
alter table presences_enseignants add column if not exists minutes_retard int default 0;

alter table ecoles add column if not exists heure_arrivee_attendue time default '07:30';

-- Journal des tentatives de pointage rejetées (ex : capture d'écran
-- présentée au lieu du QR imprimé) — utile à Direction/Fondation pour
-- repérer les tentatives de fraude répétées.
create table if not exists alertes_pointage (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  enseignant_id uuid references enseignants(id) on delete set null,
  date date not null default current_date,
  heure time not null default current_time,
  raison text not null,
  score numeric,
  created_at timestamptz default now()
);
alter table alertes_pointage enable row level security;
create policy "lecture alertes_pointage" on alertes_pointage for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "creation alertes_pointage" on alertes_pointage for insert
  with check (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "suppression alertes_pointage" on alertes_pointage for delete
  using (ecole_id = mon_ecole_id() and est_admin());

-- =====================================================================
-- 13. ACCÈS PERSONNELS ENSEIGNANTS + ÉCHÉANCES DE SCOLARITÉ CONFIGURABLES
-- =====================================================================

-- --- 13a. Accès personnels : un compte enseignant PEUT être relié à une
-- fiche enseignant précise, auquel cas il ne voit/modifie plus que SES
-- classes assignées (notes, présences élèves, programmes, emploi du
-- temps). Un compte non relié (enseignant_id = null) garde l'accès à
-- toute l'école comme avant — aucune rupture pour les comptes existants.
alter table profiles add column if not exists enseignant_id uuid references enseignants(id) on delete set null;

create or replace function mon_enseignant_id() returns uuid
language sql stable security definer set search_path = public as
$$ select enseignant_id from profiles where id = auth.uid() $$;

create or replace function mes_classes() returns text[]
language sql stable security definer set search_path = public as
$$ select classes_assignees from enseignants where id = mon_enseignant_id() $$;

drop policy if exists "acces notes" on notes;
create policy "acces notes" on notes for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or
    exists (select 1 from eleves e where e.id = notes.eleve_id and e.classe_id = any(mes_classes()))
  )
);

drop policy if exists "acces presences_eleves" on presences_eleves;
create policy "acces presences_eleves" on presences_eleves for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or
    presences_eleves.classe_id = any(mes_classes())
  )
);

drop policy if exists "acces programmes" on programmes;
create policy "acces programmes" on programmes for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or
    programmes.classe_id = any(mes_classes())
  )
);

drop policy if exists "lecture emploi_temps" on emploi_temps;
create policy "lecture emploi_temps" on emploi_temps for select using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or
    emploi_temps.classe_id = any(mes_classes())
  )
);

-- --- 13b. Échéances de scolarité configurables par école (remplace la
-- liste fixe de tranches codée en dur) : chaque école définit ses
-- propres versements (ex : "1er versement — Novembre — 50 000 F").
create table if not exists echeances_scolarite (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  label text not null,
  montant numeric not null default 0,
  date_echeance date,
  ordre int default 0
);
alter table echeances_scolarite enable row level security;
create policy "lecture echeances_scolarite" on echeances_scolarite for select using (ecole_id = mon_ecole_id());
create policy "acces echeances_scolarite" on echeances_scolarite for all using (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 14. CONSOLE DÉVELOPPEUR — création des écoles clientes réservée à un
-- rôle "développeur" global (non rattaché à une école), pour empêcher
-- toute création non maîtrisée d'établissement et fiabiliser l'onboarding.
-- =====================================================================
-- Un compte "développeur" n'a PAS d'ecole_id (il gère toutes les écoles,
-- pas une en particulier) — on doit donc autoriser cette colonne à être
-- vide sur "profiles".
alter table profiles alter column ecole_id drop not null;

-- Permet de suspendre une école (impayé, litige...) sans supprimer ses
-- données : son personnel ne peut alors plus se connecter (vérifié côté
-- application au chargement des données).
alter table ecoles add column if not exists actif boolean not null default true;

alter type role_utilisateur add value if not exists 'developpeur';

create or replace function est_developpeur() returns boolean
language sql stable security definer set search_path = public as
$$ select role = 'developpeur' from profiles where id = auth.uid() $$;

-- Le développeur voit la liste de toutes les écoles (pas leurs données
-- opérationnelles — élèves, notes, comptabilité restent isolées comme
-- avant, aucune policy ne lui donne accès à ces tables-là).
drop policy if exists "lecture ecole" on ecoles;
create policy "lecture ecole" on ecoles for select using (id = mon_ecole_id() or est_developpeur());

-- Autorise uniquement à activer/suspendre une école existante. La CRÉATION
-- d'une école ne passe jamais par cette policy : elle se fait uniquement
-- via la fonction Edge "creer-ecole-cliente" (clé service_role côté
-- serveur), qui crée l'école ET le premier compte Direction ensemble —
-- volontairement, pour qu'aucune école ne puisse exister sans un compte
-- pour s'y connecter, et qu'aucune voie détournée ne permette d'en créer.
create policy "activation ecole par developpeur" on ecoles for update using (est_developpeur());

-- =====================================================================
-- 15. CRÉER VOTRE PROPRE COMPTE DÉVELOPPEUR (à faire une seule fois)
-- =====================================================================
-- 1) Supabase Dashboard → Authentication → Users → Add user (email +
--    mot de passe de VOTRE choix, cochez "Auto Confirm User"). Notez l'UID.
-- 2) Dans SQL Editor, exécutez (en remplaçant <UID>) :
--
--    insert into profiles (id, ecole_id, role, nom_complet)
--    values ('<UID>', null, 'developpeur', 'Votre nom');
--
-- Ensuite, connectez-vous sur le site avec cet email/mot de passe (n'importe
-- quel espace du menu de connexion, le rôle réel décide de la redirection)
-- pour accéder à la Console Développeur.

-- =====================================================================
-- 16. CORRECTIF — un compte développeur ne pouvait pas lire son PROPRE
-- profil : la policy comparait "ecole_id du profil" à "ecole_id du
-- profil" (via mon_ecole_id()), et en SQL, null = null n'est jamais vrai.
-- Un compte développeur (ecole_id toujours null) échouait donc à se
-- connecter avec le message trompeur "Ce compte n'est associé à aucune
-- école." On ajoute simplement : on peut toujours lire SA PROPRE ligne.
-- =====================================================================
drop policy if exists "lecture profils" on profiles;
create policy "lecture profils" on profiles for select using (ecole_id = mon_ecole_id() or id = auth.uid());

-- =====================================================================
-- 17. ACCÈS TECHNIQUE DU DÉVELOPPEUR, OCTROYÉ PAR LE CLIENT (lecture seule)
-- Par défaut, un compte développeur n'a accès à AUCUNE donnée opération-
-- nelle d'une école (élèves, notes, comptabilité...), seulement à la liste
-- des écoles elles-mêmes. Chaque école cliente peut, depuis Paramètres,
-- activer un interrupteur "Autoriser l'accès technique du développeur"
-- pour permettre un dépannage ponctuel — en LECTURE SEULE uniquement
-- (aucune policy "for all"/"for update"/"for insert" n'est créée ici),
-- et seulement pour SA propre école. Décocher l'interrupteur retire
-- l'accès immédiatement.
-- =====================================================================
alter table ecoles add column if not exists acces_support_developpeur boolean not null default false;

create or replace function developpeur_a_acces(p_ecole_id uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select est_developpeur() and exists(
     select 1 from ecoles where id = p_ecole_id and acces_support_developpeur
   ) $$;

create policy "acces support developpeur" on classes for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on eleves for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on enseignants for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on notes for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on presences_eleves for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on presences_enseignants for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on emploi_temps for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on programmes for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on bulletins_commentaires for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on paiements_scolarite for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on activites for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on inscriptions_activites for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on paiements_cotisations for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on gadgets for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on ventes_gadgets for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on personnel_autre for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on paiements_salaires for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on depenses for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on messages for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on alertes_pointage for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on echeances_scolarite for select using (developpeur_a_acces(ecole_id));
create policy "acces support developpeur" on profiles for select using (developpeur_a_acces(ecole_id));

-- =====================================================================
-- 18. SUPPRESSION D'UNE ÉCOLE CLIENTE — voir supabase/functions/
-- supprimer-ecole-cliente/index.ts. Comme pour la création, la suppression
-- passe uniquement par cette fonction Edge (clé service_role), jamais par
-- une policy RLS directe : elle doit aussi supprimer les comptes Auth liés
-- (sinon leurs emails restent bloqués indéfiniment), ce qu'une simple
-- policy "delete" ne peut pas faire. La suppression de la ligne "ecoles"
-- déclenche par cascade la suppression de toutes les tables opération-
-- nelles de cette école (toutes leurs contraintes ecole_id sont "on delete
-- cascade") et des lignes "profiles" — mais PAS des comptes auth.users
-- eux-mêmes, d'où l'étape supplémentaire dans la fonction Edge.

-- =====================================================================
-- 19. CORRECTIF AUDIT SÉCURITÉ — "lecture eleves" n'était pas limitée
-- par classe, contrairement aux tables notes/presences_eleves/programmes/
-- emploi_temps mises à jour en section 13. Un compte enseignant relié à
-- une seule classe pouvait donc lire la fiche de TOUS les élèves de
-- l'école (toutes classes confondues) via un appel direct à l'API,
-- même si l'interface ne le lui montrait jamais. Corrigé en appliquant
-- la même logique que les autres tables scoped par classe.
-- =====================================================================
drop policy if exists "lecture eleves" on eleves;
create policy "lecture eleves" on eleves for select using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or classe_id = any(mes_classes())
  )
);

-- "acces bulletins" avait été oubliée lors de la mise à jour de la section
-- 13 : contrairement à notes/presences_eleves/programmes, elle n'était PAS
-- limitée par classe — n'importe quel enseignant pouvait lire ET modifier
-- les commentaires de bulletin de n'importe quel élève de l'école, pas
-- seulement les siens.
drop policy if exists "acces bulletins" on bulletins_commentaires;
create policy "acces bulletins" on bulletins_commentaires for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or mon_enseignant_id() is null or
    exists (select 1 from eleves e where e.id = bulletins_commentaires.eleve_id and e.classe_id = any(mes_classes()))
  )
);

-- =====================================================================
-- 20. AUDIT SÉCURITÉ — le calcul du pointage (heure d'arrivée, retard)
-- se faisait entièrement côté navigateur (horloge de l'appareil, calcul
-- en JavaScript), puis était envoyé tel quel à la base. Un compte du
-- personnel techniquement averti pouvait donc, en contournant l'inter-
-- face, enregistrer une heure d'arrivée fabriquée. Voir la nouvelle
-- Edge Function supabase/functions/enregistrer-pointage/index.ts, qui
-- calcule désormais l'heure et le retard côté SERVEUR — le client ne
-- transmet plus que "quel enseignant" et "arrivée ou départ".
--
-- Garde-fou supplémentaire (sans lien avec la sécurité, juste la
-- cohérence des données) : une note ne peut plus être négative ni
-- dépasser le barème de l'évaluation.
-- =====================================================================
alter table notes drop constraint if exists notes_valeur_coherente;
alter table notes add constraint notes_valeur_coherente
  check (note is null or (note >= 0 and note <= note_sur));

-- =====================================================================
-- 21. CORRECTIF AUDIT SÉCURITÉ — fuite de colonnes sensibles sur
-- "enseignants" : la policy "lecture enseignants tous" laissait N'IMPORTE
-- QUEL compte de l'école (y compris un simple enseignant) lire le
-- téléphone, l'email, le SALAIRE et le jeton QR de pointage de TOUS ses
-- collègues via un appel direct à l'API — alors que l'interface ne montre
-- jamais ces champs à un enseignant. Le jeton QR est particulièrement
-- sensible : c'est l'équivalent d'un "mot de passe" de pointage, le lire
-- permettrait de recréer le badge d'un collègue et de pointer à sa place.
--
-- Correctif en deux temps :
-- 1) La table de base "enseignants" n'est plus lisible directement que
--    par le personnel administratif (secretariat/direction/fondation).
-- 2) Une VUE "enseignants_lecture" est créée pour l'usage courant de
--    l'application (afficher un nom de titulaire, une liste d'ensei-
--    gnants dans l'emploi du temps, etc.) : elle masque automatiquement
--    (renvoie null) téléphone/email/salaire/jeton QR pour tout le monde
--    SAUF le personnel administratif — la même requête renvoie donc les
--    vraies valeurs pour Direction/Fondation/Secrétariat, et des valeurs
--    masquées pour un compte enseignant, sans qu'aucun changement ne
--    soit nécessaire dans le reste de l'application.
-- =====================================================================
drop policy if exists "lecture enseignants tous" on enseignants;
create policy "lecture enseignants tous" on enseignants for select using (ecole_id = mon_ecole_id() and est_perso_admin());

create or replace view enseignants_lecture as
select
  id, ecole_id, matricule, nom, prenom, sexe,
  case when est_perso_admin() then telephone else null end as telephone,
  case when est_perso_admin() then email else null end as email,
  classes_assignees, matieres, date_embauche, statut,
  case when est_perso_admin() then salaire_mensuel else null end as salaire_mensuel,
  case when est_perso_admin() then qr_token else null end as qr_token
from enseignants
where ecole_id = mon_ecole_id() or developpeur_a_acces(ecole_id);

grant select on enseignants_lecture to authenticated;

-- =====================================================================
-- 22. CORRECTIF AUDIT SÉCURITÉ — le numéro de téléphone du parent
-- (eleves.parent_tel) devait auparavant transiter par le navigateur pour
-- que l'appel d'un élève absent déclenche le SMS : n'importe quel compte
-- pouvant marquer une présence gardait donc ce numéro en mémoire côté
-- client (accessible via la console du navigateur), même s'il n'était
-- jamais affiché à l'écran pour un enseignant.
--
-- Corrigé en déplaçant TOUTE la logique de notification d'absence côté
-- serveur : voir supabase/functions/notifier-absence-eleve/index.ts.
-- Le client n'envoie plus que { eleveId, date, motif } ; la fonction lit
-- le numéro du parent avec la clé service_role, compose le message,
-- journalise les destinataires et envoie le SMS réel — sans jamais
-- renvoyer le numéro au navigateur. Elle vérifie aussi qu'un compte
-- enseignant relié à une fiche précise ne peut notifier que pour SES
-- classes assignées (même garde-fou que pour la lecture des notes).
--
-- Aucune modification de policy RLS nécessaire ici : la fonction utilise
-- la clé service_role (qui contourne volontairement RLS, comme pour la
-- création/suppression d'école), après avoir vérifié elle-même les
-- droits de l'appelant.
-- =====================================================================

-- =====================================================================
-- 23. SURVEILLANCE TECHNIQUE (PHASE 1 — DIAGNOSTIC 2026-09-22)
-- Jusqu'ici, une erreur technique chez un client n'était connue que si
-- le client la signalait lui-même. Cette table enregistre automatique-
-- ment chaque erreur JavaScript rencontrée dans l'appli, consultable par
-- le développeur (SQL Editor, ou une future page dans la Console).
-- =====================================================================
create table if not exists erreurs_client (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid references ecoles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text,
  message text not null,
  pile text,
  page text,
  user_agent text,
  created_at timestamptz default now()
);
alter table erreurs_client enable row level security;

-- N'importe quel compte connecté peut journaliser UNE erreur (nécessaire
-- puisque l'erreur peut survenir avant que l'école soit chargée), mais
-- seulement pour sa propre école si elle est renseignée — impossible de
-- polluer le journal d'une autre école.
create policy "creation erreurs_client" on erreurs_client for insert
  with check (auth.uid() is not null and (ecole_id is null or ecole_id = mon_ecole_id()));

-- Seul le développeur consulte ce journal (diagnostic technique global,
-- pas une donnée métier d'une école).
create policy "lecture erreurs_client" on erreurs_client for select using (est_developpeur());

-- =====================================================================
-- 24. PISTE D'AUDIT COMPTABLE (ROADMAP COMPTABILITÉ — ÉTAPE 1)
-- Jusqu'ici, supprimer un paiement/une dépense ne laissait aucune trace :
-- impossible de savoir qui a supprimé quoi, quand, ni ce qu'il y avait
-- avant. Cette table enregistre chaque création/modification/suppression
-- des mouvements financiers (scolarité, activités, boutique, salaires,
-- dépenses). Elle est volontairement IMMUABLE : aucune policy update/
-- delete n'existe ci-dessous, donc même la Direction ne peut jamais
-- altérer ou effacer une ligne du journal une fois écrite.
-- =====================================================================
create table if not exists journal_compta (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  table_cible text not null,
  enregistrement_id uuid not null,
  action text not null check (action in ('creation','modification','suppression')),
  donnees_avant jsonb,
  donnees_apres jsonb,
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  auteur_nom text default '',
  auteur_role text default '',
  created_at timestamptz default now()
);
alter table journal_compta enable row level security;

-- Le personnel administratif (secrétariat/direction/fondation) peut écrire
-- une entrée dans le journal, uniquement pour sa propre école — jamais
-- au nom d'une autre école.
create policy "creation journal_compta" on journal_compta for insert
  with check (est_perso_admin() and ecole_id = mon_ecole_id());

-- Seuls Direction/Fondation consultent le journal (comme les totaux
-- financiers globaux, déjà masqués au Secrétariat ailleurs dans l'appli).
create policy "lecture journal_compta" on journal_compta for select
  using (est_admin() and ecole_id = mon_ecole_id());

create policy "acces support developpeur" on journal_compta for select using (developpeur_a_acces(ecole_id));

-- =====================================================================
-- 25. BUDGET PRÉVISIONNEL (ROADMAP COMPTABILITÉ — ÉTAPE 6)
-- Permet à Direction/Fondation de fixer, mois par mois et catégorie par
-- catégorie, un montant prévu — comparé ensuite au réalisé (déjà calculé
-- à partir des tables existantes, aucune donnée dupliquée ici). Réservé
-- à Direction/Fondation, comme les autres totaux globaux du module.
-- =====================================================================
create table if not exists budgets_comptables (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  type text not null check (type in ('recette','depense')),
  categorie text not null,
  mois text not null,
  montant numeric not null default 0,
  created_at timestamptz default now(),
  unique (ecole_id, type, categorie, mois)
);
alter table budgets_comptables enable row level security;

create policy "gestion budgets_comptables" on budgets_comptables for all
  using (est_admin() and ecole_id = mon_ecole_id())
  with check (est_admin() and ecole_id = mon_ecole_id());

create policy "acces support developpeur" on budgets_comptables for select using (developpeur_a_acces(ecole_id));

-- =====================================================================
-- 26. PLAN COMPTABLE SYSCOHADA (ROADMAP COMPTABILITÉ — ÉTAPE 7)
-- Associe un code SYSCOHADA à chaque catégorie déjà existante (recette,
-- dépense, mode de paiement/trésorerie). L'app propose des codes
-- standards par défaut (voir CODES_SYSCOHADA_DEFAUT dans app.js), mais
-- RIEN n'est présenté comme validé par un comptable — chaque école peut
-- ajuster ici. Réservé à Direction/Fondation.
-- =====================================================================
create table if not exists comptes_syscohada (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  type text not null check (type in ('recette','depense','tresorerie')),
  categorie text not null,
  code text not null,
  libelle text not null default '',
  created_at timestamptz default now(),
  unique (ecole_id, type, categorie)
);
alter table comptes_syscohada enable row level security;

create policy "gestion comptes_syscohada" on comptes_syscohada for all
  using (est_admin() and ecole_id = mon_ecole_id())
  with check (est_admin() and ecole_id = mon_ecole_id());

create policy "acces support developpeur" on comptes_syscohada for select using (developpeur_a_acces(ecole_id));

-- =====================================================================
-- 27. RÉGIME DE FACTURATION — REÇUS SIMPLES ou FNE (Facture Normalisée
-- Électronique, obligatoire DGI Côte d'Ivoire pour les reçus de
-- scolarité — voir échange avec l'école du 2026-09-24). Chaque école
-- choisit son régime ; la clé API du prestataire de certification n'est
-- JAMAIS exposée au navigateur, même pour Direction/Fondation — seule la
-- vue fne_config_lecture (sans la clé) est utilisée par l'application.
-- La certification réelle (appel au prestataire) n'est PAS encore
-- câblée : tant qu'aucun prestataire n'a d'intégration codée côté
-- Edge Function, le reçu affiche honnêtement "non certifié", jamais une
-- fausse certification.
-- =====================================================================
create table if not exists fne_config (
  ecole_id uuid primary key references ecoles(id) on delete cascade default mon_ecole_id(),
  regime text not null default 'recus' check (regime in ('recus','fne')),
  prestataire text not null default '',
  api_key text not null default '',
  updated_at timestamptz default now()
);
alter table fne_config enable row level security;

-- Direction/Fondation uniquement : choix du régime, prestataire, clé API.
create policy "gestion fne_config" on fne_config for all
  using (est_admin() and ecole_id = mon_ecole_id())
  with check (est_admin() and ecole_id = mon_ecole_id());

create policy "acces support developpeur" on fne_config for select using (developpeur_a_acces(ecole_id));

-- Vue SANS api_key — lue par tout le personnel (y compris Secrétariat,
-- qui imprime des reçus) pour savoir quel régime afficher.
create or replace view fne_config_lecture as
select ecole_id, regime, prestataire, (api_key <> '') as cle_configuree, updated_at
from fne_config
where ecole_id = mon_ecole_id() or developpeur_a_acces(ecole_id);

grant select on fne_config_lecture to authenticated;
