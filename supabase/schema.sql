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

-- =====================================================================
-- 28. TVA (ROADMAP COMPTABILITÉ — ÉTAPE 9, DERNIÈRE)
-- IMPORTANT (voir échange du 2026-09-24) : l'activité d'enseignement est
-- exonérée de TVA dans le CGI ivoirien, mais l'assujettissement dépend
-- du régime fiscal de l'école (forfaitaire/RSI/réel selon le chiffre
-- d'affaires) et certaines recettes (boutique scolaire notamment) ne
-- sont probablement PAS exonérées même quand la scolarité l'est. Rien
-- ici n'est un calcul certifié — seulement une aide de calcul que
-- l'école doit valider avec son comptable. Par défaut : assujetti_tva =
-- false, donc AUCUN comportement existant ne change tant que l'école ne
-- l'active pas explicitement.
-- =====================================================================
alter table ecoles add column if not exists assujetti_tva boolean not null default false;
alter table ecoles add column if not exists taux_tva numeric not null default 18;

-- Réutilise comptes_syscohada (section 26) : chaque catégorie de recette
-- porte déjà un code SYSCOHADA, on lui ajoute juste si la TVA s'y
-- applique. Par défaut (colonne absente sur les lignes déjà créées) :
-- false, donc rien ne change tant que Direction/Fondation ne l'active
-- pas ligne par ligne dans Paramètres.
alter table comptes_syscohada add column if not exists tva_applicable boolean not null default false;

-- comptes_syscohada est réservé à Direction/Fondation en lecture directe
-- (section 26) — mais TOUT LE PERSONNEL doit savoir si la TVA s'applique
-- à une catégorie pour imprimer un reçu juste (Secrétariat compris). Vue
-- minimale, comme fne_config_lecture/enseignants_lecture.
create or replace view tva_categories_lecture as
select categorie, tva_applicable
from comptes_syscohada
where type = 'recette' and (ecole_id = mon_ecole_id() or developpeur_a_acces(ecole_id));

grant select on tva_categories_lecture to authenticated;

-- =====================================================================
-- 29. PAIEMENT EN LIGNE MOBILE MONEY (préparation technique 2026-09-24)
-- Objectif : un parent paie directement via un lien Mobile Money
-- (CinetPay/PayDunya), sans passer par le personnel de l'école. Ceci ne
-- câble PAS encore un vrai appel à un prestataire — voir app.js, la
-- fonction genererLienPaiement affiche honnêtement "en attente de
-- vérification finale de l'API" tant qu'aucune clé réelle n'a permis de
-- tester contre le vrai prestataire. Les identifiants (clé API,
-- site_id...) varient selon le prestataire choisi, donc stockés en JSON
-- libre plutôt qu'en colonnes fixes.
-- =====================================================================
create table if not exists paiement_en_ligne_config (
  ecole_id uuid primary key references ecoles(id) on delete cascade default mon_ecole_id(),
  actif boolean not null default false,
  prestataire text not null default '' check (prestataire in ('', 'cinetpay', 'paydunya')),
  identifiants jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table paiement_en_ligne_config enable row level security;

create policy "gestion paiement_en_ligne_config" on paiement_en_ligne_config for all
  using (est_admin() and ecole_id = mon_ecole_id())
  with check (est_admin() and ecole_id = mon_ecole_id());

create policy "acces support developpeur" on paiement_en_ligne_config for select using (developpeur_a_acces(ecole_id));

-- Vue SANS les identifiants (comme fne_config_lecture) — tout le
-- personnel doit savoir si le paiement en ligne est actif pour proposer
-- le lien au parent, sans jamais voir la clé API.
create or replace view paiement_en_ligne_config_lecture as
select ecole_id, actif, prestataire, updated_at
from paiement_en_ligne_config
where ecole_id = mon_ecole_id() or developpeur_a_acces(ecole_id);

grant select on paiement_en_ligne_config_lecture to authenticated;

-- Historique des tentatives de paiement en ligne — statut mis à jour par
-- le webhook du prestataire (futur Edge Function, pas encore déployé).
-- Une fois "reussi", une ligne paiements_scolarite normale est créée
-- automatiquement (même piste d'audit que les paiements saisis à la main).
create table if not exists paiements_en_ligne (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  tranche text not null,
  montant numeric not null,
  statut text not null default 'en_attente' check (statut in ('en_attente','reussi','echoue','expire')),
  reference_prestataire text default '',
  paiement_scolarite_id uuid references paiements_scolarite(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table paiements_en_ligne enable row level security;

create policy "creation paiements_en_ligne" on paiements_en_ligne for insert
  with check (est_perso_admin() and ecole_id = mon_ecole_id());
create policy "lecture paiements_en_ligne" on paiements_en_ligne for select
  using (est_perso_admin() and ecole_id = mon_ecole_id());
create policy "acces support developpeur" on paiements_en_ligne for select using (developpeur_a_acces(ecole_id));

-- =====================================================================
-- 30. JOURNAL D'AUDIT — CONSOLE DÉVELOPPEUR (élévation du niveau
-- technique de la console, 2026-09-24)
-- Trace chaque action du développeur qui affecte une école cliente :
-- création, suspension, réactivation, suppression, configuration du
-- paiement en ligne. Immuable (aucune policy update/delete, même le
-- développeur ne peut pas l'altérer après coup) — même principe que
-- journal_compta côté appli cliente. "ecole_id" passe à NULL si l'école
-- est supprimée (on delete set null, PAS cascade) : la suppression
-- elle-même doit rester dans le journal même après coup, donc
-- "ecole_nom" capture le nom au moment de l'action, indépendamment.
-- =====================================================================
create table if not exists journal_console_dev (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  ecole_id uuid references ecoles(id) on delete set null,
  ecole_nom text not null default '',
  details jsonb default '{}'::jsonb,
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  auteur_nom text default '',
  created_at timestamptz default now()
);
alter table journal_console_dev enable row level security;

create policy "creation journal_console_dev" on journal_console_dev for insert
  with check (est_developpeur());

create policy "lecture journal_console_dev" on journal_console_dev for select
  using (est_developpeur());

-- =====================================================================
-- 31. COMPTE PARENT — ÉTAPE 1 : FONDATIONS (2026-09-30)
-- Nouveau rôle "parent", volontairement TRÈS limité : contrairement au
-- personnel, un compte parent n'a accès à absolument rien via le
-- chargeur générique chargerDB()/loadAllFromSupabase() (aucune policy
-- "parent" n'est ajoutée sur les tables existantes ici) — il passe par
-- un chemin de chargement dédié, minimal, construit à part (voir
-- app.js). Un parent peut avoir plusieurs enfants ; un élève peut avoir
-- plusieurs comptes parents (père/mère) — d'où une table de liaison.
-- =====================================================================
alter type role_utilisateur add value if not exists 'parent';

create or replace function est_parent() returns boolean
language sql stable security definer set search_path = public as
$$ select mon_role() = 'parent' $$;

create table if not exists parents_eleves (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  parent_profile_id uuid not null references profiles(id) on delete cascade,
  eleve_id uuid not null references eleves(id) on delete cascade,
  created_at timestamptz default now(),
  unique (parent_profile_id, eleve_id)
);
alter table parents_eleves enable row level security;

-- Le parent voit ses propres liens (pour savoir quels enfants il a).
create policy "lecture parents_eleves parent" on parents_eleves for select
  using (parent_profile_id = auth.uid());
-- Le personnel administratif gère les liens (création/suppression depuis
-- la fiche élève) — jamais le parent lui-même (pas d'auto-inscription).
create policy "gestion parents_eleves staff" on parents_eleves for all
  using (est_perso_admin() and ecole_id = mon_ecole_id())
  with check (est_perso_admin() and ecole_id = mon_ecole_id());

-- Un parent peut lire UNIQUEMENT la fiche du/des enfant(s) auquel il est
-- lié — jamais les autres élèves de l'école.
create policy "lecture eleves par parent" on eleves for select
  using (est_parent() and exists (
    select 1 from parents_eleves pe where pe.eleve_id = eleves.id and pe.parent_profile_id = auth.uid()
  ));

-- =====================================================================
-- 32. CORRECTIF SÉCURITÉ — faille découverte en testant le compte parent
-- (2026-09-30) : les policies "lecture eleves"/"acces notes"/"acces
-- presences_eleves"/"acces programmes"/"lecture emploi_temps"/"acces
-- bulletins" (sections 13/19) utilisaient toutes le même raccourci
-- "mon_enseignant_id() is null => accès total à l'école", pensé pour un
-- compte enseignant mal configuré (profil sans fiche enseignant liée).
-- Un compte parent a LUI AUSSI enseignant_id = null (il n'en a jamais eu
-- un), donc ce raccourci lui donnait accès à TOUS les élèves/notes/
-- présences/programmes/emploi du temps de l'école, pas seulement ceux de
-- son enfant — confirmé par un test bout-en-bout avant mise en service.
-- Corrigé en réservant ce raccourci au SEUL rôle "enseignant" : tout
-- futur rôle avec enseignant_id = null n'en bénéficiera plus jamais par
-- accident.
-- =====================================================================
drop policy if exists "lecture eleves" on eleves;
create policy "lecture eleves" on eleves for select using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or classe_id = any(mes_classes())
  )
);

drop policy if exists "acces notes" on notes;
create policy "acces notes" on notes for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or
    exists (select 1 from eleves e where e.id = notes.eleve_id and e.classe_id = any(mes_classes()))
  )
);

drop policy if exists "acces presences_eleves" on presences_eleves;
create policy "acces presences_eleves" on presences_eleves for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or
    presences_eleves.classe_id = any(mes_classes())
  )
);

drop policy if exists "acces programmes" on programmes;
create policy "acces programmes" on programmes for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or
    programmes.classe_id = any(mes_classes())
  )
);

drop policy if exists "lecture emploi_temps" on emploi_temps;
create policy "lecture emploi_temps" on emploi_temps for select using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or
    emploi_temps.classe_id = any(mes_classes())
  )
);

drop policy if exists "acces bulletins" on bulletins_commentaires;
create policy "acces bulletins" on bulletins_commentaires for all using (
  ecole_id = mon_ecole_id() and (
    est_perso_admin() or (mon_role() = 'enseignant' and mon_enseignant_id() is null) or
    exists (select 1 from eleves e where e.id = bulletins_commentaires.eleve_id and e.classe_id = any(mes_classes()))
  )
);

-- =====================================================================
-- 33. COMPTE PARENT — ÉTAPE 2 : NOTIFICATIONS (lecture seule, 2026-09-30)
-- Le parent peut désormais lire (jamais écrire/modifier) les messages qui
-- concernent SON enfant (ex : notification d'absence, et plus tard les
-- annonces horaires et notifications du portier — voir "messages" section
-- 5/8, alimentée par notifier-absence-eleve). Filtré à la fois sur le
-- lien parent↔élève ET sur destinataire_role='Parent', pour ne jamais lui
-- montrer les messages internes adressés à la Direction/Fondation pour ce
-- même élève.
-- =====================================================================
create policy "lecture messages par parent" on messages for select using (
  est_parent() and destinataire_role = 'Parent' and eleve_id is not null and exists (
    select 1 from parents_eleves pe where pe.eleve_id = messages.eleve_id and pe.parent_profile_id = auth.uid()
  )
);

-- =====================================================================
-- 34. TABLEAU D'AFFICHAGE PUBLIC — ÉTAPE 3 (2026-09-30)
-- Tableaux d'honneur (Élève/Enseignant du mois, du trimestre, de l'année)
-- et bannière d'actualités, pensés pour être projetés sur un écran dans
-- le hall de l'école (TV/tablette), SANS connexion — d'où des vues
-- publiques dédiées, jamais les tables de base ni eleves/enseignants
-- directement. Gestion réservée à Direction/Fondation (est_admin()).
--
-- Les noms des lauréats sont VOLONTAIREMENT dupliqués en clair dans
-- "nom_affiche" (jamais une clé étrangère exposée publiquement vers
-- eleves/enseignants) : l'écran public n'a ainsi jamais besoin d'accès,
-- même en lecture, aux fiches élèves/enseignants complètes.
-- =====================================================================
create table if not exists tableau_honneur (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  categorie text not null check (categorie in ('eleve','enseignant')),
  periode text not null check (periode in ('mois','trimestre','annee')),
  nom_affiche text not null default '',
  classe_ou_matiere text default '',
  libelle_periode text default '',
  commentaire text default '',
  updated_at timestamptz default now(),
  unique (ecole_id, categorie, periode)
);
alter table tableau_honneur enable row level security;
create policy "gestion tableau_honneur" on tableau_honneur for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

create table if not exists actualites_affichage (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  texte text not null,
  created_at timestamptz default now()
);
alter table actualites_affichage enable row level security;
create policy "gestion actualites_affichage" on actualites_affichage for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

-- Vues PUBLIQUES (accès accordé à "anon", pas seulement "authenticated") —
-- c'est la SEULE porte d'entrée pour un visiteur non connecté (l'écran du
-- hall). Aucune donnée sensible : noms déjà destinés à un affichage public,
-- et uniquement pour une école active.
create or replace view ecoles_vitrine as
select id, nom_ecole, logo_url from ecoles where actif = true;
grant select on ecoles_vitrine to anon, authenticated;

create or replace view tableau_honneur_public as
select ecole_id, categorie, periode, nom_affiche, classe_ou_matiere, libelle_periode, commentaire, updated_at
from tableau_honneur;
grant select on tableau_honneur_public to anon, authenticated;

create or replace view actualites_affichage_public as
select ecole_id, id, texte, created_at from actualites_affichage;
grant select on actualites_affichage_public to anon, authenticated;

-- =====================================================================
-- 35. ANNONCES HORAIRES AUTOMATIQUES — ÉTAPE 4 (2026-09-30)
-- 4 annonces quotidiennes (début de matinée, pause de midi, début et fin
-- d'après-midi), avec un horaire propre à chaque école ET à chaque cycle
-- (maternelle/primaire) — configurable depuis Paramètres (Direction/
-- Fondation). Un job pg_cron appelle, CHAQUE MINUTE, la fonction Edge
-- "annoncer-horaires" (clé service_role, jamais exposée au client) qui
-- compare l'heure actuelle aux horaires configurés de chaque école et
-- insère UNE annonce par (école, fonction, cycle, jour) — la contrainte
-- unique empêche tout doublon même si le job tournait deux fois de suite.
--
-- Choix voulu : ces annonces routinières passent par l'application
-- (lues dans l'espace Parent / l'espace Enseignant), PAS par SMS — le SMS
-- reste réservé aux alertes réellement urgentes (absence, portier), pour
-- ne jamais spammer ni facturer 4 SMS/jour/famille.
-- =====================================================================
create table if not exists horaires_annonces (
  ecole_id uuid primary key references ecoles(id) on delete cascade default mon_ecole_id(),
  matin_debut_primaire time default '07:15',
  matin_debut_maternelle time default '07:45',
  midi_pause_primaire time default '11:45',
  midi_pause_maternelle time default '10:45',
  apresmidi_debut_primaire time default '13:45',
  apresmidi_debut_maternelle time default '13:45',
  apresmidi_fin_primaire time default '16:45',
  apresmidi_fin_maternelle time default '15:45',
  actif boolean not null default true
);
alter table horaires_annonces enable row level security;
create policy "lecture horaires_annonces" on horaires_annonces for select
  using (ecole_id = mon_ecole_id());
create policy "gestion horaires_annonces" on horaires_annonces for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

create table if not exists annonces_horaires_envoyees (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  fonction text not null check (fonction in ('matin_debut','midi_pause','apresmidi_debut','apresmidi_fin')),
  cycle text not null check (cycle in ('primaire','maternelle')),
  date date not null,
  contenu text not null,
  created_at timestamptz default now(),
  unique (ecole_id, fonction, cycle, date)
);
alter table annonces_horaires_envoyees enable row level security;
-- Le parent voit une annonce si au moins un de ses enfants est dans le
-- cycle concerné (Garderie/Maternelle → "maternelle", Primaire → "primaire").
create policy "lecture annonces_horaires parent" on annonces_horaires_envoyees for select using (
  est_parent() and exists (
    select 1 from parents_eleves pe
    join eleves e on e.id = pe.eleve_id
    join classes c on c.id = e.classe_id
    where pe.parent_profile_id = auth.uid()
      and pe.ecole_id = annonces_horaires_envoyees.ecole_id
      and (
        (annonces_horaires_envoyees.cycle = 'maternelle' and c.cycle in ('Garderie','Maternelle')) or
        (annonces_horaires_envoyees.cycle = 'primaire' and c.cycle = 'Primaire')
      )
  )
);
-- Tout le personnel de l'école voit toutes les annonces (contenu non
-- sensible, purement informatif sur les horaires de la journée).
create policy "lecture annonces_horaires personnel" on annonces_horaires_envoyees for select using (
  ecole_id = mon_ecole_id() and mon_role() in ('enseignant','secretariat','direction','fondation')
);
-- Aucune policy insert/update/delete : uniquement la fonction Edge
-- "annoncer-horaires" (clé service_role) peut y écrire.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Le job pg_cron lui-même (cron.schedule(...)) N'EST PAS dans ce fichier :
-- il doit inclure un secret partagé (pour authentifier l'appel à la
-- fonction Edge) qui ne doit jamais se retrouver sur GitHub (dépôt
-- public). Il est appliqué une seule fois directement en base — voir la
-- note dans supabase/functions/annoncer-horaires/index.ts.

-- =====================================================================
-- 36. "PORTIER" — ÉTAPE 5 (2026-09-30)
-- Un compte "portier" a UNE seule capacité : chercher un élève par nom et
-- signaler que son parent est arrivé — rien d'autre (pas de notes, pas de
-- présences, pas de comptabilité). Le compte est créé manuellement comme
-- les autres comptes du personnel (Supabase Dashboard → profiles, voir
-- section 15), avec role='portier'.
--
-- Sécurité pensée pour donner au portier le MINIMUM de droits possible :
-- il ne lit jamais "eleves" ni "classes.titulaire_id" ni "enseignants" —
-- seulement une vue "eleves_portier_lecture" (nom/prénom/classe, rien de
-- plus : pas de téléphone parent, pas de date de naissance...). Résoudre
-- "quel enseignant prévenir" se fait uniquement CÔTÉ SERVEUR, via un
-- trigger "security definer" — jamais le client portier n'a besoin de
-- savoir qui est le titulaire d'une classe.
-- =====================================================================
alter type role_utilisateur add value if not exists 'portier';

create or replace function est_portier() returns boolean
language sql stable security definer set search_path = public as
$$ select mon_role() = 'portier' $$;

create or replace view eleves_portier_lecture as
select id, prenom, nom, classe_id, matricule, statut
from eleves
where ecole_id = mon_ecole_id() and statut = 'Actif';
grant select on eleves_portier_lecture to authenticated;

create table if not exists notifications_portier (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  eleve_id uuid references eleves(id) on delete set null,
  eleve_nom text not null default '',
  classe_id text references classes(id) on delete set null,
  vue boolean not null default false,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
alter table notifications_portier enable row level security;

-- Rempli ecole_id/eleve_nom/classe_id CÔTÉ SERVEUR à partir du seul
-- eleve_id fourni par le portier — celui-ci n'a donc jamais accès en
-- lecture à la fiche élève complète ni à la table classes/enseignants
-- pour accomplir sa tâche.
--
-- Le "bon" enseignant à prévenir n'est PAS résolu à l'écriture (pas de
-- colonne enseignant_id) : "classes.titulaire_id" n'étant pas toujours
-- renseigné en pratique, la notification est plutôt visible par TOUT
-- enseignant dont classes_assignees contient la classe de l'élève — même
-- mécanisme déjà utilisé partout ailleurs (notes, présences, mes_classes()).
create or replace function remplir_notification_portier() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_eleve record;
begin
  select id, nom, prenom, classe_id, ecole_id into v_eleve from eleves where id = new.eleve_id;
  if v_eleve is null or v_eleve.ecole_id <> mon_ecole_id() then
    raise exception 'Élève introuvable dans votre école';
  end if;
  new.ecole_id := v_eleve.ecole_id;
  new.eleve_nom := v_eleve.prenom || ' ' || v_eleve.nom;
  new.classe_id := v_eleve.classe_id;
  new.vue := false;
  return new;
end;
$$;
drop trigger if exists avant_insertion_notification_portier on notifications_portier;
create trigger avant_insertion_notification_portier
  before insert on notifications_portier
  for each row execute function remplir_notification_portier();

create policy "creation notifications_portier" on notifications_portier for insert
  with check (est_portier());
create policy "lecture notifications_portier enseignant" on notifications_portier for select
  using (mon_role() = 'enseignant' and (mon_enseignant_id() is null or classe_id = any(mes_classes())));
create policy "maj notifications_portier enseignant" on notifications_portier for update
  using (mon_role() = 'enseignant' and (mon_enseignant_id() is null or classe_id = any(mes_classes())))
  with check (mon_role() = 'enseignant' and (mon_enseignant_id() is null or classe_id = any(mes_classes())));
create policy "lecture notifications_portier personnel" on notifications_portier for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 37. REMPLISSAGE INTELLIGENT DES FORMULAIRES — photo/vocal → pré-
-- remplissage IA (2026-09-30). Voir supabase/functions/smart-fill/
-- index.ts pour la logique (jamais de stockage de l'image/audio, jamais
-- de policy insert cliente sur la table de journalisation — uniquement
-- la fonction Edge, clé service_role).
-- =====================================================================
alter table ecoles add column if not exists limite_remplissage_mensuelle integer not null default 100;

create table if not exists usage_remplissage_intelligent (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  utilisateur_id uuid references auth.users(id) on delete set null default auth.uid(),
  formulaire text not null,
  type_source text not null check (type_source in ('photo','audio')),
  created_at timestamptz default now()
);
alter table usage_remplissage_intelligent enable row level security;
create policy "lecture usage_remplissage" on usage_remplissage_intelligent for select
  using (ecole_id = mon_ecole_id() and est_admin());

-- =====================================================================
-- 38. BULLES — Notifications / Messages / Suggestions (2026-09-30)
-- 3 icônes dans la barre du haut (personnel ET parent) :
--   - Notifications : tout ce qui est généré AUTOMATIQUEMENT (déjà
--     existant : messages/annonces_horaires_envoyees/notifications_portier,
--     simplement regroupés dans un seul menu au lieu de panneaux séparés).
--   - Messages : écrits par une PERSONNE (le personnel administratif
--     écrit à un parent ou à un enseignant) — nouvelle table.
--   - Suggestions : n'importe qui (parent, enseignant, personnel) peut
--     en envoyer une ; seuls Direction/Fondation les consultent.
-- =====================================================================
create table if not exists messages_internes (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  auteur_nom text default '',
  destinataire_type text not null check (destinataire_type in ('parent','enseignant')),
  eleve_id uuid references eleves(id) on delete cascade,
  enseignant_id uuid references enseignants(id) on delete cascade,
  contenu text not null,
  lu boolean not null default false,
  created_at timestamptz default now()
);
alter table messages_internes enable row level security;
create policy "creation messages_internes" on messages_internes for insert
  with check (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "lecture messages_internes personnel" on messages_internes for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());
create policy "lecture messages_internes parent" on messages_internes for select
  using (
    destinataire_type = 'parent' and est_parent() and exists (
      select 1 from parents_eleves pe where pe.eleve_id = messages_internes.eleve_id and pe.parent_profile_id = auth.uid()
    )
  );
create policy "maj messages_internes parent" on messages_internes for update
  using (
    destinataire_type = 'parent' and est_parent() and exists (
      select 1 from parents_eleves pe where pe.eleve_id = messages_internes.eleve_id and pe.parent_profile_id = auth.uid()
    )
  )
  with check (
    destinataire_type = 'parent' and est_parent() and exists (
      select 1 from parents_eleves pe where pe.eleve_id = messages_internes.eleve_id and pe.parent_profile_id = auth.uid()
    )
  );
create policy "lecture messages_internes enseignant" on messages_internes for select
  using (
    destinataire_type = 'enseignant' and mon_role() = 'enseignant'
    and (mon_enseignant_id() is null or enseignant_id = mon_enseignant_id())
  );
create policy "maj messages_internes enseignant" on messages_internes for update
  using (
    destinataire_type = 'enseignant' and mon_role() = 'enseignant'
    and (mon_enseignant_id() is null or enseignant_id = mon_enseignant_id())
  )
  with check (
    destinataire_type = 'enseignant' and mon_role() = 'enseignant'
    and (mon_enseignant_id() is null or enseignant_id = mon_enseignant_id())
  );

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  auteur_nom text default '',
  auteur_role text default '',
  contenu text not null,
  lu boolean not null default false,
  created_at timestamptz default now()
);
alter table suggestions enable row level security;
create policy "creation suggestions" on suggestions for insert
  with check (ecole_id = mon_ecole_id());
create policy "lecture suggestions" on suggestions for select
  using (ecole_id = mon_ecole_id() and est_admin());
create policy "maj suggestions" on suggestions for update
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

-- =====================================================================
-- 39. POINTAGE ENSEIGNANT PAR LIEN GPS (2026-09-30)
-- Complément au pointage par badge QR existant (enregistrer-pointage) :
-- l'enseignant clique un lien personnel reçu par SMS (pas de connexion à
-- l'appli), autorise sa position, et son arrivée/départ est validé selon
-- la distance à l'école. Voir supabase/functions/generer-lien-pointage/
-- et supabase/functions/valider-pointage-gps/.
-- =====================================================================
alter table ecoles add column if not exists geofence_latitude double precision;
alter table ecoles add column if not exists geofence_longitude double precision;
alter table ecoles add column if not exists geofence_rayon_metres integer not null default 100;

create table if not exists liens_pointage_gps (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  enseignant_id uuid not null references enseignants(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  action text not null check (action in ('arrivee','depart')),
  expire_at timestamptz not null,
  utilise_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
alter table liens_pointage_gps enable row level security;
create policy "gestion liens_pointage_gps" on liens_pointage_gps for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());
-- Aucune policy publique : la validation se fait uniquement via la
-- fonction Edge "valider-pointage-gps" (service_role) — l'enseignant qui
-- clique le lien n'est jamais connecté à l'application.

create table if not exists pointages_gps (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  enseignant_id uuid not null references enseignants(id) on delete cascade,
  lien_id uuid references liens_pointage_gps(id) on delete set null,
  action text not null check (action in ('arrivee','depart')),
  date date not null, heure time not null,
  latitude double precision not null, longitude double precision not null,
  precision_metres numeric, distance_metres numeric,
  adresse_approx text,
  statut text not null check (statut in ('dans_etablissement','hors_etablissement','a_verifier')),
  created_at timestamptz default now()
);
alter table pointages_gps enable row level security;
create policy "lecture pointages_gps" on pointages_gps for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 40. AUDIT SÉCURITÉ — correctifs RLS (2026-10-01)
-- Revue générale des policies RLS de toute l'appli. Deux trouvailles
-- corrigées ici (les autres points de l'audit, plus spécifiques —
-- restriction de rôle sur la fonction Edge notifier-absence-eleve,
-- suppression de la fonction envoyer-sms non utilisée — sont décrits
-- dans leurs fichiers respectifs).
-- =====================================================================

-- "lecture profils" laissait n'importe quel compte (enseignant, parent,
-- portier) lire la liste complète des noms/rôles de TOUTE l'école — y
-- compris les parents et enseignants d'autres classes que les siennes,
-- contournant le cloisonnement par classe (mes_classes()) appliqué
-- partout ailleurs dans ce schéma. Seul le personnel administratif
-- (qui gère les liens compte-parent/compte-enseignant) et le
-- propriétaire de son propre profil en ont réellement besoin.
drop policy if exists "lecture profils" on profiles;
create policy "lecture profils" on profiles for select
  using (id = auth.uid() or (ecole_id = mon_ecole_id() and est_perso_admin()));

-- "creation messages" ne vérifiait que l'école, pas le rôle — n'importe
-- quel compte authentifié (y compris un parent) pouvait insérer une
-- fausse ligne dans le journal de messages de sa propre école. En
-- pratique seule une fonction Edge (clé service_role, qui contourne déjà
-- RLS) écrit dans cette table ; on restreint quand même côté RLS, par
-- cohérence avec "messages_internes" et pour empêcher un usage direct de
-- l'API par un compte non-admin.
drop policy if exists "creation messages" on messages;
create policy "creation messages" on messages for insert
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 41. AUTO-INSCRIPTION PARENT / PORTIER VIA RÉSEAU SOCIAL (2026-10-09)
-- =====================================================================
-- Un parent ou un portier se connecte avec Google (applications dédiées
-- parent.html / portier.html) : Supabase crée un compte SANS profil, donc
-- sans aucun accès. Il dépose ici une demande ; seul le personnel de son
-- école peut l'approuver (création du profil + lien avec l'enfant pour un
-- parent). Jamais d'accès aux données avant cette validation.
create table if not exists demandes_acces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  role_demande text not null check (role_demande in ('parent','portier')),
  nom text not null default '',
  email text default (auth.jwt() ->> 'email'),
  message text default '',
  statut text not null default 'en_attente' check (statut in ('en_attente','approuvee','refusee')),
  created_at timestamptz default now(),
  traite_par uuid references auth.users(id) on delete set null,
  unique (user_id, ecole_id, role_demande)
);
alter table demandes_acces enable row level security;

create policy "creation demande acces" on demandes_acces for insert
  with check (
    user_id = auth.uid() and statut = 'en_attente'
    and not exists (select 1 from profiles p where p.id = auth.uid())
  );
create policy "lecture demandes acces" on demandes_acces for select
  using (user_id = auth.uid() or (ecole_id = mon_ecole_id() and est_perso_admin()));
-- Pas de policy update/delete : tout passe par traiter_demande_acces().

create or replace function traiter_demande_acces(p_id uuid, p_approuver boolean, p_eleve_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare d demandes_acces%rowtype; e uuid;
begin
  select * into d from demandes_acces where id = p_id for update;
  if not found or d.ecole_id is distinct from mon_ecole_id() or not est_perso_admin() then
    raise exception 'Demande introuvable ou accès refusé';
  end if;
  if d.statut <> 'en_attente' then raise exception 'Demande déjà traitée'; end if;
  if not p_approuver then
    update demandes_acces set statut='refusee', traite_par=auth.uid() where id=p_id;
    return;
  end if;
  if d.role_demande = 'portier' and not est_admin() then
    raise exception 'Seule la direction peut approuver un portier';
  end if;
  if d.role_demande = 'parent' and coalesce(array_length(p_eleve_ids,1),0) = 0 then
    raise exception 'Choisissez au moins un enfant pour ce parent';
  end if;
  if exists (select 1 from profiles where id = d.user_id) then
    raise exception 'Ce compte a déjà un profil';
  end if;
  insert into profiles (id, ecole_id, role, nom_complet)
    values (d.user_id, d.ecole_id, d.role_demande::role_utilisateur, d.nom);
  if d.role_demande = 'parent' then
    foreach e in array p_eleve_ids loop
      if not exists (select 1 from eleves where id = e and ecole_id = d.ecole_id) then
        raise exception 'Élève invalide';
      end if;
      insert into parents_eleves (ecole_id, parent_profile_id, eleve_id) values (d.ecole_id, d.user_id, e);
    end loop;
  end if;
  update demandes_acces set statut='approuvee', traite_par=auth.uid() where id=p_id;
end $$;
revoke all on function traiter_demande_acces(uuid,boolean,uuid[]) from public, anon;
grant execute on function traiter_demande_acces(uuid,boolean,uuid[]) to authenticated;

-- =====================================================================
-- 42. COMPTABILITÉ — le secrétariat ne gère plus que la scolarité (2026-10-10)
-- =====================================================================
-- Décision de la direction : le secrétariat garde les paiements de scolarité,
-- les reçus, les activités et la boutique. Salaires, dépenses, budget et
-- journal d'audit sont réservés à Direction/Fondation — dans la base, pas
-- seulement à l'écran (cohérent avec la politique de confidentialité :
-- « données de paie : direction uniquement »).
drop policy if exists "acces paiements_salaires" on paiements_salaires;
create policy "acces paiements_salaires" on paiements_salaires for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

drop policy if exists "acces depenses" on depenses;
create policy "acces depenses" on depenses for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

drop policy if exists "acces personnel_autre" on personnel_autre;
create policy "acces personnel_autre" on personnel_autre for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

-- Salaire des enseignants : masqué pour tout compte non admin dans la vue
-- de lecture, et impossible à modifier par le secrétariat (le trigger
-- conserve l'ancienne valeur, ou 0 à la création).
create or replace view enseignants_lecture as
select
  id, ecole_id, matricule, nom, prenom, sexe,
  case when est_perso_admin() then telephone else null end as telephone,
  case when est_perso_admin() then email else null end as email,
  classes_assignees, matieres, date_embauche, statut,
  case when est_admin() then salaire_mensuel else null end as salaire_mensuel,
  case when est_perso_admin() then qr_token else null end as qr_token
from enseignants
where ecole_id = mon_ecole_id() or developpeur_a_acces(ecole_id);

create or replace function proteger_salaire_enseignant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or est_admin() or mon_role() = 'developpeur' then return new; end if;
  if tg_op = 'INSERT' then new.salaire_mensuel := 0;
  else new.salaire_mensuel := old.salaire_mensuel; end if;
  return new;
end $$;
drop trigger if exists trg_proteger_salaire_enseignant on enseignants;
create trigger trg_proteger_salaire_enseignant before insert or update on enseignants
  for each row execute function proteger_salaire_enseignant();

-- =====================================================================
-- 43. PRÉSENCES VISIBLES PAR LE PARENT — ses enfants uniquement (2026-10-11)
-- =====================================================================
-- Accord de Vehi Zoh Junior (refonte motion design, Lot 4) : la fiche
-- enfant de la console parent affiche « la présence de la semaine ».
-- Lecture SEULE, limitée aux enfants reliés à ce parent (parents_eleves) ;
-- aucune écriture, aucune autre classe, aucun autre élève.
drop policy if exists "lecture presences_eleves parent" on presences_eleves;
create policy "lecture presences_eleves parent" on presences_eleves for select
  using (
    est_parent() and exists (
      select 1 from parents_eleves pe
      where pe.eleve_id = presences_eleves.eleve_id
        and pe.parent_profile_id = auth.uid()
    )
  );

-- =====================================================================
-- 44. APPLAUDISSEMENTS DU TABLEAU D'HONNEUR (2026-10-11)
-- =====================================================================
-- Demande de Vehi Zoh Junior : bouton « Applaudir » de la console parent.
-- Un seul applaudissement par parent et par lauréat (catégorie + nom affiché).
-- Aucun accès direct à la table : tout passe par deux fonctions qui ne
-- révèlent jamais QUI a applaudi (seulement le total et « moi oui/non »).
create table if not exists applaudissements_honneur (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  categorie text not null check (categorie in ('eleve','enseignant')),
  nom_cle text not null,
  parent_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (ecole_id, categorie, nom_cle, parent_id)
);
alter table applaudissements_honneur enable row level security;
-- (aucune policy : lecture et écriture uniquement via les fonctions ci-dessous)

create or replace function applaudir_honneur(p_categorie text, p_nom text)
returns integer language plpgsql security definer set search_path = public as $$
declare cle text := lower(btrim(p_nom)); total integer;
begin
  if not est_parent() then raise exception 'Réservé aux parents'; end if;
  if not exists (select 1 from tableau_honneur t where t.ecole_id = mon_ecole_id()
                 and t.categorie = p_categorie and lower(btrim(t.nom_affiche)) = cle and cle <> '') then
    raise exception 'Lauréat introuvable';
  end if;
  insert into applaudissements_honneur (ecole_id, categorie, nom_cle, parent_id)
    values (mon_ecole_id(), p_categorie, cle, auth.uid())
    on conflict (ecole_id, categorie, nom_cle, parent_id) do nothing;
  select count(*) into total from applaudissements_honneur
    where ecole_id = mon_ecole_id() and categorie = p_categorie and nom_cle = cle;
  return total;
end $$;

create or replace function compter_applaudissements()
returns table (categorie text, nom_cle text, total integer, moi boolean)
language sql stable security definer set search_path = public as $$
  select a.categorie, a.nom_cle, count(*)::integer, bool_or(a.parent_id = auth.uid())
  from applaudissements_honneur a
  where a.ecole_id = mon_ecole_id()
  group by a.categorie, a.nom_cle
$$;

revoke all on function applaudir_honneur(text, text) from public, anon;
revoke all on function compter_applaudissements() from public, anon;
grant execute on function applaudir_honneur(text, text) to authenticated;
grant execute on function compter_applaudissements() to authenticated;

-- =====================================================================
-- 45. RÈGLE ANTI-DOUBLON DES MATRICULES (2026-10-11)
-- =====================================================================
-- Demande de Vehi Zoh Junior, après la correction du calcul des matricules
-- et la renumérotation du doublon EL-0005. Dans une même école, deux élèves
-- (ou deux enseignants) ne peuvent plus avoir le même matricule. Le nom
-- de chaque contrainte est reconnu par l'application pour réessayer avec
-- le numéro suivant (voir prochainMatricule dans app.js).
alter table eleves drop constraint if exists eleves_matricule_unique_par_ecole;
alter table eleves add constraint eleves_matricule_unique_par_ecole unique (ecole_id, matricule);
alter table enseignants drop constraint if exists enseignants_matricule_unique_par_ecole;
alter table enseignants add constraint enseignants_matricule_unique_par_ecole unique (ecole_id, matricule);

-- =====================================================================
-- 46. SALAIRES DES ENSEIGNANTS DANS UNE TABLE À PART (2026-10-11)
-- =====================================================================
-- Accord de Vehi Zoh Junior (« oui, déplace les salaires »). Jusqu'ici le
-- salaire restait dans la table "enseignants", que le secrétariat peut
-- lire directement (l'écran le masquait, pas la base). Il est désormais
-- rangé dans "salaires_enseignants", réservée à Direction/Fondation.
-- La colonne enseignants.salaire_mensuel reste (pour ne rien casser) mais
-- vaut toujours 0 : le déclencheur déplace la valeur saisie par
-- Direction/Fondation vers la nouvelle table.
create table if not exists salaires_enseignants (
  enseignant_id uuid primary key references enseignants(id) on delete cascade deferrable initially deferred,
  ecole_id uuid not null references ecoles(id) on delete cascade,
  salaire_mensuel numeric not null default 0,
  updated_at timestamptz default now()
);
-- Lien vérifié en fin d'enregistrement : à la création d'un enseignant, le
-- salaire est rangé (par le déclencheur) juste avant la fiche elle-même.
alter table salaires_enseignants drop constraint if exists salaires_enseignants_enseignant_id_fkey;
alter table salaires_enseignants add constraint salaires_enseignants_enseignant_id_fkey
  foreign key (enseignant_id) references enseignants(id) on delete cascade deferrable initially deferred;
alter table salaires_enseignants enable row level security;
drop policy if exists "acces salaires_enseignants" on salaires_enseignants;
create policy "acces salaires_enseignants" on salaires_enseignants for all
  using (ecole_id = mon_ecole_id() and est_admin())
  with check (ecole_id = mon_ecole_id() and est_admin());

-- Reprise des salaires existants
insert into salaires_enseignants (enseignant_id, ecole_id, salaire_mensuel)
select id, ecole_id, salaire_mensuel from enseignants where coalesce(salaire_mensuel, 0) <> 0
on conflict (enseignant_id) do update set salaire_mensuel = excluded.salaire_mensuel, updated_at = now();

create or replace function proteger_salaire_enseignant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Seule Direction/Fondation (ou la maintenance) peut fixer un salaire ;
  -- la valeur part dans la table à part. 0 = « non fourni » (un salaire à
  -- 0 est effacé par l'application directement dans salaires_enseignants).
  if (auth.uid() is null or est_admin()) and coalesce(new.salaire_mensuel, 0) <> 0 then
    insert into salaires_enseignants (enseignant_id, ecole_id, salaire_mensuel)
    values (new.id, new.ecole_id, new.salaire_mensuel)
    on conflict (enseignant_id) do update set salaire_mensuel = excluded.salaire_mensuel, updated_at = now();
  end if;
  new.salaire_mensuel := 0;
  return new;
end $$;
-- (le déclencheur trg_proteger_salaire_enseignant existe depuis la section 42)

update enseignants set salaire_mensuel = 0 where coalesce(salaire_mensuel, 0) <> 0;

create or replace view enseignants_lecture as
select
  e.id, e.ecole_id, e.matricule, e.nom, e.prenom, e.sexe,
  case when est_perso_admin() then e.telephone else null end as telephone,
  case when est_perso_admin() then e.email else null end as email,
  e.classes_assignees, e.matieres, e.date_embauche, e.statut,
  case when est_admin() then coalesce((select s.salaire_mensuel from salaires_enseignants s where s.enseignant_id = e.id), 0) else null end as salaire_mensuel,
  case when est_perso_admin() then e.qr_token else null end as qr_token
from enseignants e
where e.ecole_id = mon_ecole_id() or developpeur_a_acces(e.ecole_id);

-- =====================================================================
-- 47. PAIEMENT EN LIGNE — DURCISSEMENT AVANT ACTIVATION (2026-10-11)
-- =====================================================================
-- Accord de Vehi Zoh Junior. Avant que la première école active le
-- paiement Mobile Money :
-- 1) Les clés PayDunya ne sont plus lisibles par AUCUN compte, même
--    Direction/Fondation/Développeur : seules les fonctions serveur les
--    utilisent. La configuration se fait par la fonction
--    configurer-paiement-en-ligne (Console Développeur) ; l'application
--    lit seulement la vue paiement_en_ligne_config_lecture (sans les clés).
drop policy if exists "gestion paiement_en_ligne_config" on paiement_en_ligne_config;
drop policy if exists "acces support developpeur" on paiement_en_ligne_config;
-- 2) Les tentatives de paiement ne sont créées que par la fonction
--    initier-paiement-en-ligne (jamais directement depuis un navigateur).
drop policy if exists "creation paiements_en_ligne" on paiements_en_ligne;
-- 3) Une facture PayDunya ne peut correspondre qu'à une seule tentative.
create unique index if not exists paiements_en_ligne_reference_unique
  on paiements_en_ligne(reference_prestataire) where reference_prestataire <> '';

-- =====================================================================
-- 48. CONTRÔLE DE SÉCURITÉ COMPLET (2026-10-11)
-- =====================================================================
-- Accord de Vehi Zoh Junior. Bilan de l'analyse Supabase (« advisors ») :
-- - Vues « security definer » (8) : voulues. Elles masquent des colonnes
--   (téléphone, salaire, clés) et filtrent par école. Vérifié avec la clé
--   publique, sans connexion : seules ecoles_vitrine, tableau_honneur_public
--   et actualites_affichage_public renvoient des données (écran d'affichage
--   et page de connexion), comme prévu.
-- - Fonctions d'aide (mon_ecole_id, est_admin…) : ont toutes un search_path
--   fixe ; sans connexion elles renvoient null/false. Gardées exécutables car
--   les règles RLS les appellent.
-- - Fonctions de déclenchement : jamais utiles en appel direct → retirées
--   aux comptes (un déclencheur fonctionne sans ce droit).
revoke execute on function proteger_salaire_enseignant() from public, anon, authenticated;
revoke execute on function remplir_notification_portier() from public, anon, authenticated;

-- =====================================================================
-- 49. OBJETS PERDUS — signalés par les parents (2026-10-12)
-- =====================================================================
-- Demande de Vehi Zoh Junior : dans la console parent, un espace « Objets
-- perdus » où le parent signale une affaire de son enfant perdue à l'école
-- (constatée à la maison). Le secrétariat / la direction répond : retrouvé,
-- non retrouvé, rendu.
create table if not exists objets_perdus (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  parent_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  parent_nom text not null default '',
  eleve_id uuid not null references eleves(id) on delete cascade,
  objet text not null check (char_length(objet) between 2 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  date_constat date not null default current_date,
  statut text not null default 'signale' check (statut in ('signale','retrouve','non_retrouve','rendu')),
  reponse_ecole text not null default '' check (char_length(reponse_ecole) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists objets_perdus_ecole_idx on objets_perdus(ecole_id, created_at desc);
alter table objets_perdus enable row level security;

-- Le parent déclare, uniquement pour un de SES enfants, et sans pouvoir
-- fixer lui-même le statut ni la réponse de l'école.
drop policy if exists "creation objets_perdus parent" on objets_perdus;
create policy "creation objets_perdus parent" on objets_perdus for insert
  with check (
    ecole_id = mon_ecole_id() and est_parent() and parent_id = auth.uid()
    and statut = 'signale' and reponse_ecole = ''
    and exists (select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = objets_perdus.eleve_id)
  );
drop policy if exists "lecture objets_perdus parent" on objets_perdus;
create policy "lecture objets_perdus parent" on objets_perdus for select
  using (parent_id = auth.uid());
-- Secrétariat / Direction / Fondation : voient et répondent.
drop policy if exists "gestion objets_perdus personnel" on objets_perdus;
create policy "gestion objets_perdus personnel" on objets_perdus for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());
drop policy if exists "maj objets_perdus personnel" on objets_perdus;
create policy "maj objets_perdus personnel" on objets_perdus for update
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 50. ANNONCES HORAIRES « INTELLIGENTES » (2026-10-12)
-- =====================================================================
-- Demande de Vehi Zoh Junior. Les colonnes de horaires_annonces contiennent
-- désormais l'HEURE RÉELLE de chaque moment (début, pause…) ; la fonction
-- annoncer-horaires prévient les parents « avance_minutes » AVANT (15 min).
-- Nouveautés : pause de 10h, cours de renforcement (élèves cochés), jours
-- de classe, suspension pendant les vacances.
alter table horaires_annonces add column if not exists pause_matin_primaire time default '10:00';
alter table horaires_annonces add column if not exists pause_matin_maternelle time default '10:00';
alter table horaires_annonces add column if not exists renforcement_fin time default '17:00';
alter table horaires_annonces add column if not exists avance_minutes integer not null default 15;
alter table horaires_annonces add column if not exists jours_cours integer[] not null default '{1,2,3,4,5}';
alter table horaires_annonces add column if not exists suspendu_jusquau date;
alter table horaires_annonces drop constraint if exists horaires_annonces_avance_check;
alter table horaires_annonces add constraint horaires_annonces_avance_check check (avance_minutes between 0 and 60);

alter table horaires_annonces alter column matin_debut_primaire set default '07:30';
alter table horaires_annonces alter column matin_debut_maternelle set default '08:00';
alter table horaires_annonces alter column midi_pause_primaire set default '12:00';
alter table horaires_annonces alter column midi_pause_maternelle set default '11:00';
alter table horaires_annonces alter column apresmidi_debut_primaire set default '14:00';
alter table horaires_annonces alter column apresmidi_debut_maternelle set default '14:00';
alter table horaires_annonces alter column apresmidi_fin_primaire set default '16:00';
alter table horaires_annonces alter column apresmidi_fin_maternelle set default '16:00';

-- Horaires réels de SUCCESS KIDS (consignes de Vehi Zoh Junior)
update horaires_annonces set
  matin_debut_primaire = '07:30', matin_debut_maternelle = '08:00',
  pause_matin_primaire = '10:00', pause_matin_maternelle = '10:00',
  midi_pause_primaire = '12:00', midi_pause_maternelle = '11:00',
  apresmidi_debut_primaire = '14:00', apresmidi_debut_maternelle = '14:00',
  apresmidi_fin_primaire = '16:00', apresmidi_fin_maternelle = '16:00',
  renforcement_fin = '17:00', avance_minutes = 15, jours_cours = '{1,2,3,4,5}'
where ecole_id = (select id from ecoles where nom_ecole ilike '%SUCCESS KIDS%');

-- Élèves inscrits au cours de renforcement (cochés sur leur fiche)
alter table eleves add column if not exists renforcement boolean not null default false;

-- Annonces : nouvelles fonctions + ciblage d'élèves précis (renforcement)
alter table annonces_horaires_envoyees drop constraint if exists annonces_horaires_envoyees_fonction_check;
alter table annonces_horaires_envoyees add constraint annonces_horaires_envoyees_fonction_check
  check (fonction in ('matin_debut','pause_matin','midi_pause','apresmidi_debut','apresmidi_fin','renforcement_debut','renforcement_fin'));
-- eleve_ids : seulement les parents de ces élèves ; eleve_ids_exclus : tous sauf eux
alter table annonces_horaires_envoyees add column if not exists eleve_ids uuid[];
alter table annonces_horaires_envoyees add column if not exists eleve_ids_exclus uuid[];

drop policy if exists "lecture annonces_horaires parent" on annonces_horaires_envoyees;
create policy "lecture annonces_horaires parent" on annonces_horaires_envoyees for select using (
  est_parent() and exists (
    select 1 from parents_eleves pe
    join eleves e on e.id = pe.eleve_id
    join classes c on c.id = e.classe_id
    where pe.parent_profile_id = auth.uid()
      and pe.ecole_id = annonces_horaires_envoyees.ecole_id
      and (
        (annonces_horaires_envoyees.cycle = 'maternelle' and c.cycle in ('Garderie','Maternelle')) or
        (annonces_horaires_envoyees.cycle = 'primaire' and c.cycle = 'Primaire')
      )
      and (annonces_horaires_envoyees.eleve_ids is null or e.id = any(annonces_horaires_envoyees.eleve_ids))
      and (annonces_horaires_envoyees.eleve_ids_exclus is null or not (e.id = any(annonces_horaires_envoyees.eleve_ids_exclus)))
  )
);

-- =====================================================================
-- 51. MODULE « COURS DE RENFORCEMENT » (2026-10-12)
-- =====================================================================
-- Demande de Vehi Zoh Junior. Jours où le renforcement a lieu (lundi = 1
-- … dimanche = 7) : les jours sans renforcement, les parents des élèves
-- inscrits reçoivent l'annonce normale de fin des cours.
alter table horaires_annonces add column if not exists jours_renforcement integer[] not null default '{1,2,3,4,5}';

-- =====================================================================
-- 52. NOTIFICATIONS PUSH (2026-10-12)
-- =====================================================================
-- Demande de Vehi Zoh Junior : les parents reçoivent les annonces et
-- messages même application fermée. Chaque téléphone qui accepte les
-- notifications enregistre ici son « abonnement » (adresse du service de
-- notification du téléphone + clés de chiffrement propres à ce téléphone).
-- Les clés VAPID de l'école (secrets VAPID_*) ne sont jamais dans la base.
create table if not exists push_abonnements (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  appareil text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_abonnements_user_idx on push_abonnements(user_id);
alter table push_abonnements enable row level security;
-- Chacun gère uniquement les abonnements de ses propres téléphones
drop policy if exists "push abonnements propres" on push_abonnements;
create policy "push abonnements propres" on push_abonnements for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and ecole_id = mon_ecole_id());

-- Un téléphone = un seul compte destinataire : si le téléphone change de
-- compte, l'ancien abonnement (d'un autre compte) est remplacé.
create or replace function enregistrer_abonnement_push(p_endpoint text, p_p256dh text, p_auth text, p_appareil text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or mon_ecole_id() is null then raise exception 'Non authentifié'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Abonnement invalide'; end if;
  delete from push_abonnements where endpoint = p_endpoint;
  insert into push_abonnements (ecole_id, user_id, endpoint, p256dh, auth, appareil)
  values (mon_ecole_id(), auth.uid(), p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(coalesce(p_appareil, ''), 160));
end $$;
revoke all on function enregistrer_abonnement_push(text, text, text, text) from public, anon;
grant execute on function enregistrer_abonnement_push(text, text, text, text) to authenticated;

-- =====================================================================
-- 53. ABSENCES SIGNALÉES À L'AVANCE PAR LE PARENT (2026-10-12)
-- =====================================================================
-- Le parent prévient depuis son application (maladie, rendez-vous…) ; à
-- l'appel, l'enseignant / le secrétariat voit l'absence prévue, la saisie
-- est pré-remplie et le parent ne reçoit pas d'alerte inutile.
create table if not exists absences_signalees (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  parent_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  parent_nom text not null default '',
  eleve_id uuid not null references eleves(id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  motif text not null check (char_length(motif) between 2 and 60),
  commentaire text not null default '' check (char_length(commentaire) <= 500),
  created_at timestamptz not null default now(),
  check (date_fin >= date_debut and date_fin <= date_debut + 60)
);
create index if not exists absences_signalees_idx on absences_signalees(ecole_id, date_debut, date_fin);
alter table absences_signalees enable row level security;

drop policy if exists "creation absences_signalees parent" on absences_signalees;
create policy "creation absences_signalees parent" on absences_signalees for insert
  with check (
    ecole_id = mon_ecole_id() and est_parent() and parent_id = auth.uid()
    and date_debut >= current_date - 1
    and exists (select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = absences_signalees.eleve_id)
  );
drop policy if exists "lecture absences_signalees parent" on absences_signalees;
create policy "lecture absences_signalees parent" on absences_signalees for select
  using (parent_id = auth.uid());
-- Le parent peut annuler son signalement (enfant finalement présent)
drop policy if exists "suppression absences_signalees parent" on absences_signalees;
create policy "suppression absences_signalees parent" on absences_signalees for delete
  using (parent_id = auth.uid());
drop policy if exists "lecture absences_signalees personnel" on absences_signalees;
create policy "lecture absences_signalees personnel" on absences_signalees for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());
-- L'enseignant voit celles des élèves de ses classes (comme pour l'appel)
drop policy if exists "lecture absences_signalees enseignant" on absences_signalees;
create policy "lecture absences_signalees enseignant" on absences_signalees for select
  using (ecole_id = mon_ecole_id() and mon_role() = 'enseignant' and (
    mon_enseignant_id() is null or exists (
      select 1 from eleves e where e.id = absences_signalees.eleve_id and e.classe_id = any(mes_classes()))));

-- =====================================================================
-- 54. VIE DE L'ÉCOLE — photos et vidéos des événements (2026-10-13)
-- =====================================================================
-- Demande de Vehi Zoh Junior : un fil « comme un réseau social » dans la
-- console parent (publications, photos, vidéos, J'aime / Bravo,
-- commentaires). Les photos d'enfants restent PRIVÉES : stockage non
-- public, lisible seulement par les comptes de l'école.
create table if not exists publications (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  auteur_nom text not null default '',
  titre text not null check (char_length(titre) between 2 and 150),
  texte text not null default '' check (char_length(texte) <= 3000),
  date_evenement date,
  classe_ids text[],                       -- null = toute l'école
  created_at timestamptz not null default now()
);
create index if not exists publications_ecole_idx on publications(ecole_id, created_at desc);

create table if not exists publication_medias (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  type text not null check (type in ('photo','video','youtube')),
  chemin text not null check (char_length(chemin) <= 500),   -- chemin dans le stockage, ou identifiant YouTube
  ordre integer not null default 0
);
create index if not exists publication_medias_pub_idx on publication_medias(publication_id, ordre);

create table if not exists publication_reactions (
  publication_id uuid not null references publications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null default 'coeur' check (type in ('coeur','bravo')),
  created_at timestamptz not null default now(),
  primary key (publication_id, user_id, type)
);

create table if not exists publication_commentaires (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  auteur_nom text not null default '',
  texte text not null check (char_length(texte) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists publication_commentaires_pub_idx on publication_commentaires(publication_id, created_at);

alter table publications enable row level security;
alter table publication_medias enable row level security;
alter table publication_reactions enable row level security;
alter table publication_commentaires enable row level security;

-- Qui voit une publication : le personnel de l'école ; un parent si elle
-- concerne toute l'école ou la classe d'un de ses enfants.
create or replace function peut_voir_publication(p_ecole uuid, p_classes text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select p_ecole = mon_ecole_id() and (
    mon_role() in ('enseignant','secretariat','direction','fondation')
    or (est_parent() and (p_classes is null or exists (
      select 1 from parents_eleves pe join eleves e on e.id = pe.eleve_id
      where pe.parent_profile_id = auth.uid() and e.classe_id = any(p_classes))))
  )
$$;
revoke all on function peut_voir_publication(uuid, text[]) from public, anon;
grant execute on function peut_voir_publication(uuid, text[]) to authenticated;

drop policy if exists "lecture publications" on publications;
create policy "lecture publications" on publications for select using (peut_voir_publication(ecole_id, classe_ids));
drop policy if exists "gestion publications" on publications;
create policy "gestion publications" on publications for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

drop policy if exists "lecture publication_medias" on publication_medias;
create policy "lecture publication_medias" on publication_medias for select
  using (exists (select 1 from publications p where p.id = publication_medias.publication_id));
drop policy if exists "gestion publication_medias" on publication_medias;
create policy "gestion publication_medias" on publication_medias for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

drop policy if exists "lecture publication_reactions" on publication_reactions;
create policy "lecture publication_reactions" on publication_reactions for select
  using (exists (select 1 from publications p where p.id = publication_reactions.publication_id));
drop policy if exists "ajout publication_reactions" on publication_reactions;
create policy "ajout publication_reactions" on publication_reactions for insert
  with check (user_id = auth.uid() and exists (select 1 from publications p where p.id = publication_reactions.publication_id));
drop policy if exists "retrait publication_reactions" on publication_reactions;
create policy "retrait publication_reactions" on publication_reactions for delete using (user_id = auth.uid());

drop policy if exists "lecture publication_commentaires" on publication_commentaires;
create policy "lecture publication_commentaires" on publication_commentaires for select
  using (exists (select 1 from publications p where p.id = publication_commentaires.publication_id));
drop policy if exists "ajout publication_commentaires" on publication_commentaires;
create policy "ajout publication_commentaires" on publication_commentaires for insert
  with check (user_id = auth.uid() and ecole_id = mon_ecole_id()
    and exists (select 1 from publications p where p.id = publication_commentaires.publication_id));
-- Chacun retire son commentaire ; le personnel administratif modère tout
drop policy if exists "retrait publication_commentaires" on publication_commentaires;
create policy "retrait publication_commentaires" on publication_commentaires for delete
  using (user_id = auth.uid() or (ecole_id = mon_ecole_id() and est_perso_admin()));

-- Stockage privé des photos / vidéos : dossier = identifiant de l'école
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publications', 'publications', false, 26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publications lecture ecole" on storage.objects;
create policy "publications lecture ecole" on storage.objects for select to authenticated
  using (bucket_id = 'publications' and (storage.foldername(name))[1] = mon_ecole_id()::text);
drop policy if exists "publications ajout personnel" on storage.objects;
create policy "publications ajout personnel" on storage.objects for insert to authenticated
  with check (bucket_id = 'publications' and (storage.foldername(name))[1] = mon_ecole_id()::text and est_perso_admin());
drop policy if exists "publications suppression personnel" on storage.objects;
create policy "publications suppression personnel" on storage.objects for delete to authenticated
  using (bucket_id = 'publications' and (storage.foldername(name))[1] = mon_ecole_id()::text and est_perso_admin());

-- =====================================================================
-- 55. SCOLARITÉ PARAMÉTRABLE PAR CLASSE (2026-10-13)
-- =====================================================================
-- Demande de Vehi Zoh Junior : chaque école cliente paramètre elle-même
-- sa scolarité et ses tranches de paiement, qui varient selon la classe.
-- Une tranche avec classe_id appartient à cette classe ; sans classe_id,
-- elle fait partie de la « grille commune », utilisée par les classes qui
-- n'ont pas leur propre grille.
alter table echeances_scolarite add column if not exists classe_id text references classes(id) on delete cascade;
create index if not exists echeances_scolarite_classe_idx on echeances_scolarite(ecole_id, classe_id, ordre);

-- L'école décide quand montrer la scolarité aux parents (désactivé par défaut)
alter table ecoles add column if not exists scolarite_visible_parents boolean not null default false;

-- Un parent lit les paiements de SES enfants (reçus, reste à payer)
drop policy if exists "lecture paiements_scolarite parent" on paiements_scolarite;
create policy "lecture paiements_scolarite parent" on paiements_scolarite for select
  using (est_parent() and exists (
    select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = paiements_scolarite.eleve_id));

-- =====================================================================
-- 56. SANTÉ DES ÉCOLES — Console Développeur (2026-10-13)
-- =====================================================================
-- Vehi Zoh Junior suit l'usage réel de chaque école cliente. Uniquement
-- des COMPTES (aucun nom, aucune donnée d'élève), et seulement pour le
-- compte développeur.
create or replace function sante_ecoles()
returns table (ecole_id uuid, eleves_actifs int, eleves_relies int, enseignants int, jours_appel_7j int,
               paiements_30j int, publications int, telephones_abonnes int, derniere_activite date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_developpeur() then raise exception 'Réservé au compte développeur'; end if;
  return query
  select e.id,
    (select count(*)::int from eleves el where el.ecole_id = e.id and el.statut = 'Actif'),
    (select count(distinct pe.eleve_id)::int from parents_eleves pe join eleves el on el.id = pe.eleve_id where pe.ecole_id = e.id and el.statut = 'Actif'),
    (select count(*)::int from enseignants t where t.ecole_id = e.id and t.statut = 'Actif'),
    (select count(distinct p.date)::int from presences_eleves p where p.ecole_id = e.id and p.date >= current_date - 7),
    (select count(*)::int from paiements_scolarite ps where ps.ecole_id = e.id and ps.date >= current_date - 30),
    (select count(*)::int from publications pu where pu.ecole_id = e.id),
    (select count(*)::int from push_abonnements pa where pa.ecole_id = e.id),
    greatest(
      (select max(p.date) from presences_eleves p where p.ecole_id = e.id),
      (select max(ps.date) from paiements_scolarite ps where ps.ecole_id = e.id),
      (select max(pu.created_at)::date from publications pu where pu.ecole_id = e.id),
      (select max(m.created_at)::date from messages_internes m where m.ecole_id = e.id),
      (select max(el.date_inscription) from eleves el where el.ecole_id = e.id and el.date_inscription <= current_date)
    )
  from ecoles e;
end $$;
revoke all on function sante_ecoles() from public, anon;
grant execute on function sante_ecoles() to authenticated;

-- =====================================================================
-- 57. RAPPEL « APPEL NON FAIT » (2026-10-13)
-- =====================================================================
-- Si l'appel d'une classe n'est pas enregistré à l'heure du rappel (9h00
-- par défaut), la Direction, le secrétariat et l'enseignant de la classe
-- reçoivent une notification. null = rappel désactivé.
alter table horaires_annonces add column if not exists rappel_appel time default '09:00';
update horaires_annonces set rappel_appel = '09:00' where rappel_appel is null;

-- Trace des rappels envoyés (un seul par école, type et jour) — serveur seulement
create table if not exists rappels_envoyes (
  ecole_id uuid not null references ecoles(id) on delete cascade,
  type text not null,
  date date not null,
  details jsonb,
  created_at timestamptz not null default now(),
  primary key (ecole_id, type, date)
);
alter table rappels_envoyes enable row level security;
drop policy if exists "lecture rappels_envoyes personnel" on rappels_envoyes;
create policy "lecture rappels_envoyes personnel" on rappels_envoyes for select
  using (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 58. RELANCES AUTOMATIQUES DE SCOLARITÉ (2026-10-13)
-- =====================================================================
-- Si l'école l'active (et a rendu la scolarité visible aux parents), les
-- parents d'un élève qui n'a pas réglé une tranche reçoivent un rappel
-- poli 3 jours avant la date limite, le jour même, puis 7 jours après.
-- Une seule fois par élève, tranche et étape (table rappels_envoyes).
alter table ecoles add column if not exists relances_scolarite boolean not null default false;
alter table ecoles add column if not exists heure_relances time not null default '10:00';

-- =====================================================================
-- 59. ENRÔLEMENT DES PARENTS ET DES ENSEIGNANTS (2026-10-13)
-- =====================================================================
-- Demande de Vehi Zoh Junior :
-- - le parent s'enrôle en cochant le nom de son ou ses enfants ;
-- - l'enseignant s'enrôle en écrivant son nom et en cochant sa ou ses
--   classes, puis ne voit QUE ses classes.
-- La direction (ou le secrétariat) valide toujours : sinon n'importe qui
-- pourrait cocher l'enfant d'un autre.
alter table demandes_acces drop constraint if exists demandes_acces_role_demande_check;
alter table demandes_acces add constraint demandes_acces_role_demande_check check (role_demande in ('parent','portier','enseignant'));
alter table demandes_acces add column if not exists eleve_ids uuid[];
alter table demandes_acces add column if not exists classe_ids text[];
alter table demandes_acces add column if not exists telephone text not null default '';

-- Recherche d'un élève pendant l'enrôlement (compte Google connecté, pas
-- encore validé) : au moins 3 lettres, élèves actifs de l'école, 8 réponses
-- au plus, uniquement prénom, nom et classe.
create or replace function rechercher_eleves_demande(p_ecole uuid, p_texte text)
returns table (id uuid, prenom text, nom text, classe text)
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(trim(coalesce(p_texte, '')));
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if char_length(t) < 3 then return; end if;
  return query
    select e.id, e.prenom, e.nom, c.nom
    from eleves e join ecoles ec on ec.id = e.ecole_id and ec.actif
    left join classes c on c.id = e.classe_id
    where e.ecole_id = p_ecole and e.statut = 'Actif'
      and (lower(e.nom || ' ' || e.prenom) like '%' || t || '%' or lower(e.prenom || ' ' || e.nom) like '%' || t || '%')
    order by e.nom, e.prenom limit 8;
end $$;
revoke all on function rechercher_eleves_demande(uuid, text) from public, anon;
grant execute on function rechercher_eleves_demande(uuid, text) to authenticated;

-- Liste des classes pour l'enrôlement d'un enseignant (noms seulement)
create or replace function classes_demande(p_ecole uuid)
returns table (id text, nom text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  return query select c.id, c.nom from classes c join ecoles ec on ec.id = c.ecole_id and ec.actif where c.ecole_id = p_ecole order by c.nom;
end $$;
revoke all on function classes_demande(uuid) from public, anon;
grant execute on function classes_demande(uuid) to authenticated;

-- Validation : parent (enfants), portier, ENSEIGNANT (classes ; fiche
-- enseignant créée, ou fiche existante reliée)
drop function if exists traiter_demande_acces(uuid, boolean, uuid[]);
create or replace function traiter_demande_acces(p_id uuid, p_approuver boolean, p_eleve_ids uuid[] default '{}',
                                                 p_classe_ids text[] default '{}', p_enseignant_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare d demandes_acces%rowtype; e uuid; v_ens uuid; v_mat text; v_prenom text; v_nom text;
begin
  select * into d from demandes_acces where id = p_id for update;
  if not found or d.ecole_id is distinct from mon_ecole_id() or not est_perso_admin() then
    raise exception 'Demande introuvable ou accès refusé';
  end if;
  if d.statut <> 'en_attente' then raise exception 'Demande déjà traitée'; end if;
  if not p_approuver then
    update demandes_acces set statut='refusee', traite_par=auth.uid() where id=p_id;
    return;
  end if;
  if d.role_demande = 'portier' and not est_admin() then
    raise exception 'Seule la direction peut approuver un portier';
  end if;
  if d.role_demande = 'parent' and coalesce(array_length(p_eleve_ids,1),0) = 0 then
    raise exception 'Choisissez au moins un enfant pour ce parent';
  end if;
  if d.role_demande = 'enseignant' and coalesce(array_length(p_classe_ids,1),0) = 0 then
    raise exception 'Choisissez au moins une classe pour cet enseignant';
  end if;
  if exists (select 1 from profiles where id = d.user_id) then
    raise exception 'Ce compte a déjà un profil';
  end if;

  if d.role_demande = 'enseignant' then
    if exists (select 1 from unnest(p_classe_ids) c where not exists (select 1 from classes where id = c and ecole_id = d.ecole_id)) then
      raise exception 'Classe invalide';
    end if;
    if p_enseignant_id is not null then
      -- fiche déjà créée par l'école : on la relie (si elle n'a pas déjà un compte)
      if not exists (select 1 from enseignants where id = p_enseignant_id and ecole_id = d.ecole_id)
         or exists (select 1 from profiles where enseignant_id = p_enseignant_id) then
        raise exception 'Fiche enseignant invalide ou déjà reliée à un compte';
      end if;
      update enseignants set classes_assignees = p_classe_ids, statut = 'Actif',
        telephone = coalesce(nullif(d.telephone, ''), telephone) where id = p_enseignant_id;
      v_ens := p_enseignant_id;
    else
      v_nom := upper(split_part(trim(d.nom), ' ', array_length(string_to_array(trim(d.nom), ' '), 1)));
      v_prenom := trim(regexp_replace(trim(d.nom), '\s+\S+$', ''));
      if v_prenom = '' then v_prenom := v_nom; end if;
      select 'ENS-' || lpad((coalesce(max(nullif(regexp_replace(matricule, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
        into v_mat from enseignants where ecole_id = d.ecole_id and matricule like 'ENS-%';
      insert into enseignants (ecole_id, matricule, nom, prenom, telephone, classes_assignees, statut, date_embauche)
        values (d.ecole_id, v_mat, v_nom, v_prenom, d.telephone, p_classe_ids, 'Actif', current_date)
        returning id into v_ens;
    end if;
    insert into profiles (id, ecole_id, role, nom_complet, enseignant_id)
      values (d.user_id, d.ecole_id, 'enseignant', d.nom, v_ens);
  else
    insert into profiles (id, ecole_id, role, nom_complet)
      values (d.user_id, d.ecole_id, d.role_demande::role_utilisateur, d.nom);
  end if;

  if d.role_demande = 'parent' then
    foreach e in array p_eleve_ids loop
      if not exists (select 1 from eleves where id = e and ecole_id = d.ecole_id) then
        raise exception 'Élève invalide';
      end if;
      insert into parents_eleves (ecole_id, parent_profile_id, eleve_id) values (d.ecole_id, d.user_id, e);
    end loop;
  end if;
  update demandes_acces set statut='approuvee', traite_par=auth.uid() where id=p_id;
end $$;
revoke all on function traiter_demande_acces(uuid,boolean,uuid[],text[],uuid) from public, anon;
grant execute on function traiter_demande_acces(uuid,boolean,uuid[],text[],uuid) to authenticated;

-- Fin de l'« accès total » des comptes enseignants non reliés à une fiche :
-- un enseignant ne voit QUE ses classes.
drop policy if exists "lecture absences_signalees enseignant" on absences_signalees;
create policy "lecture absences_signalees enseignant" on absences_signalees for select
  using (ecole_id = mon_ecole_id() and mon_role() = 'enseignant' and exists (
    select 1 from eleves e where e.id = absences_signalees.eleve_id and e.classe_id = any(mes_classes())));
drop policy if exists "acces bulletins" on bulletins_commentaires;
create policy "acces bulletins" on bulletins_commentaires for all using (ecole_id = mon_ecole_id() and (est_perso_admin()
  or exists (select 1 from eleves e where e.id = bulletins_commentaires.eleve_id and e.classe_id = any(mes_classes()))));
drop policy if exists "lecture eleves" on eleves;
create policy "lecture eleves" on eleves for select using (ecole_id = mon_ecole_id() and (est_perso_admin() or classe_id = any(mes_classes())));
drop policy if exists "lecture emploi_temps" on emploi_temps;
create policy "lecture emploi_temps" on emploi_temps for select using (ecole_id = mon_ecole_id() and (est_perso_admin() or classe_id = any(mes_classes())));
drop policy if exists "lecture messages_internes enseignant" on messages_internes;
create policy "lecture messages_internes enseignant" on messages_internes for select
  using (destinataire_type = 'enseignant' and mon_role() = 'enseignant' and enseignant_id = mon_enseignant_id());
drop policy if exists "maj messages_internes enseignant" on messages_internes;
create policy "maj messages_internes enseignant" on messages_internes for update
  using (destinataire_type = 'enseignant' and mon_role() = 'enseignant' and enseignant_id = mon_enseignant_id())
  with check (destinataire_type = 'enseignant' and mon_role() = 'enseignant' and enseignant_id = mon_enseignant_id());
drop policy if exists "acces notes" on notes;
create policy "acces notes" on notes for all using (ecole_id = mon_ecole_id() and (est_perso_admin()
  or exists (select 1 from eleves e where e.id = notes.eleve_id and e.classe_id = any(mes_classes()))));
drop policy if exists "lecture notifications_portier enseignant" on notifications_portier;
create policy "lecture notifications_portier enseignant" on notifications_portier for select
  using (mon_role() = 'enseignant' and classe_id = any(mes_classes()));
drop policy if exists "maj notifications_portier enseignant" on notifications_portier;
create policy "maj notifications_portier enseignant" on notifications_portier for update
  using (mon_role() = 'enseignant' and classe_id = any(mes_classes()))
  with check (mon_role() = 'enseignant' and classe_id = any(mes_classes()));
drop policy if exists "acces presences_eleves" on presences_eleves;
create policy "acces presences_eleves" on presences_eleves for all using (ecole_id = mon_ecole_id() and (est_perso_admin() or presences_eleves.classe_id = any(mes_classes())));
drop policy if exists "acces programmes" on programmes;
create policy "acces programmes" on programmes for all using (ecole_id = mon_ecole_id() and (est_perso_admin() or classe_id = any(mes_classes())));


-- =====================================================================
-- 60. BULLETINS VISIBLES PAR LES PARENTS (2026-10-13)
-- =====================================================================
-- L'école publie un trimestre quand les notes sont complètes ; le parent
-- voit alors les notes et l'appréciation de SES enfants pour ce trimestre.
alter table ecoles add column if not exists bulletins_publies text[] not null default '{}';

drop policy if exists "lecture notes parent" on notes;
create policy "lecture notes parent" on notes for select using (
  est_parent()
  and exists (select 1 from ecoles ec where ec.id = notes.ecole_id and notes.trimestre = any(ec.bulletins_publies))
  and exists (select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = notes.eleve_id)
);
drop policy if exists "lecture bulletins parent" on bulletins_commentaires;
create policy "lecture bulletins parent" on bulletins_commentaires for select using (
  est_parent()
  and exists (select 1 from ecoles ec where ec.id = bulletins_commentaires.ecole_id and bulletins_commentaires.trimestre = any(ec.bulletins_publies))
  and exists (select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = bulletins_commentaires.eleve_id)
);

-- =====================================================================
-- 61. AGENDA DE L'ÉCOLE (2026-10-13)
-- =====================================================================
-- Vacances, compositions, réunions, fêtes, sorties : visibles par le
-- personnel et par les parents concernés (toute l'école ou certaines
-- classes). Une période de vacances arrête les annonces automatiques.
create table if not exists evenements_agenda (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  titre text not null check (char_length(titre) between 2 and 150),
  description text not null default '' check (char_length(description) <= 1000),
  type text not null default 'autre' check (type in ('vacances','examen','reunion','fete','sortie','autre')),
  date_debut date not null,
  date_fin date not null,
  classe_ids text[],                         -- null = toute l'école
  created_at timestamptz not null default now(),
  check (date_fin >= date_debut)
);
create index if not exists evenements_agenda_idx on evenements_agenda(ecole_id, date_debut);
alter table evenements_agenda enable row level security;
drop policy if exists "lecture evenements_agenda" on evenements_agenda;
create policy "lecture evenements_agenda" on evenements_agenda for select using (peut_voir_publication(ecole_id, classe_ids));
drop policy if exists "gestion evenements_agenda" on evenements_agenda;
create policy "gestion evenements_agenda" on evenements_agenda for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 62. MESSAGERIE DANS LES DEUX SENS : le parent écrit à l'école (2026-10-13)
-- =====================================================================
-- destinataire_type 'ecole' = message d'un parent à l'école, au sujet d'un
-- de SES enfants. Lu par le secrétariat / la direction / la fondation.
alter table messages_internes drop constraint if exists messages_internes_destinataire_type_check;
alter table messages_internes add constraint messages_internes_destinataire_type_check
  check (destinataire_type in ('parent','enseignant','ecole'));

drop policy if exists "envoi messages_internes parent" on messages_internes;
create policy "envoi messages_internes parent" on messages_internes for insert with check (
  destinataire_type = 'ecole' and est_parent() and ecole_id = mon_ecole_id() and auteur_id = auth.uid() and lu = false
  and exists (select 1 from parents_eleves pe where pe.parent_profile_id = auth.uid() and pe.eleve_id = messages_internes.eleve_id)
);
drop policy if exists "lecture messages_internes envoyes parent" on messages_internes;
create policy "lecture messages_internes envoyes parent" on messages_internes for select
  using (destinataire_type = 'ecole' and auteur_id = auth.uid());
-- Le personnel marque comme lus les messages reçus des parents
drop policy if exists "maj messages_internes personnel" on messages_internes;
create policy "maj messages_internes personnel" on messages_internes for update
  using (destinataire_type = 'ecole' and ecole_id = mon_ecole_id() and est_perso_admin())
  with check (destinataire_type = 'ecole' and ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 63. ERREURS RÉCENTES — Console Développeur (2026-10-13)
-- =====================================================================
-- Les erreurs rencontrées dans les applications (déjà enregistrées dans
-- erreurs_client) regroupées par message, pour le compte développeur.
create or replace function erreurs_recentes(p_jours int default 14)
returns table (ecole_id uuid, role text, message text, page text, nombre int, premiere timestamptz, derniere timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_developpeur() then raise exception 'Réservé au compte développeur'; end if;
  return query
  select e.ecole_id, e.role::text, left(e.message, 300), left(coalesce(e.page, ''), 120), count(*)::int, min(e.created_at), max(e.created_at)
  from erreurs_client e
  where e.created_at >= now() - make_interval(days => greatest(1, least(p_jours, 90)))
  group by 1, 2, 3, 4
  order by max(e.created_at) desc
  limit 50;
end $$;
revoke all on function erreurs_recentes(int) from public, anon;
grant execute on function erreurs_recentes(int) to authenticated;

-- =====================================================================
-- 64. CAHIER DE TEXTES — devoirs par classe (2026-10-13)
-- =====================================================================
-- L'enseignant note les devoirs de SES classes (le secrétariat et la
-- direction aussi, pour toutes). Les parents ne voient que les devoirs
-- de la classe de leurs enfants (peut_voir_publication).
create table if not exists devoirs (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  classe_id text not null references classes(id) on delete cascade,
  matiere text not null default '' check (char_length(matiere) <= 80),
  travail text not null check (char_length(travail) between 2 and 1000),
  pour_le date not null,
  auteur_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists devoirs_idx on devoirs(ecole_id, pour_le);
alter table devoirs enable row level security;
drop policy if exists "lecture devoirs" on devoirs;
create policy "lecture devoirs" on devoirs for select using (peut_voir_publication(ecole_id, array[classe_id]));
drop policy if exists "gestion devoirs" on devoirs;
create policy "gestion devoirs" on devoirs for all
  using (ecole_id = mon_ecole_id() and (est_perso_admin() or (mon_role() = 'enseignant' and classe_id = any(mes_classes()))))
  with check (ecole_id = mon_ecole_id() and (est_perso_admin() or (mon_role() = 'enseignant' and classe_id = any(mes_classes())))
    and exists (select 1 from classes c where c.id = devoirs.classe_id and c.ecole_id = devoirs.ecole_id));

-- =====================================================================
-- 65. ANNIVERSAIRES DES ÉLÈVES (2026-10-13)
-- =====================================================================
-- Le jour de l'anniversaire d'un élève, ses parents reçoivent à 8h les
-- vœux de l'école (fonction annoncer-horaires, une fois par élève et par
-- an via rappels_envoyes). L'école peut le désactiver dans Paramètres.
alter table ecoles add column if not exists voeux_anniversaire boolean not null default true;

-- =====================================================================
-- 66. SÉCURITÉ ET SANTÉ DE L'ÉLÈVE (2026-10-13)
-- =====================================================================
-- Le parent indique lui-même les personnes autorisées à venir chercher
-- son enfant et ses informations de santé (allergies…). Lecture : le
-- parent de l'enfant, le personnel administratif, l'enseignant de la
-- classe. Le portier ne voit QUE le nom et le lien des personnes
-- autorisées, élève par élève, via une fonction (jamais téléphone ni santé).
create or replace function est_parent_de(p_eleve uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parents_eleves pe join eleves e on e.id = pe.eleve_id
    where pe.parent_profile_id = auth.uid() and pe.eleve_id = p_eleve and e.ecole_id = mon_ecole_id())
$$;
revoke all on function est_parent_de(uuid) from public, anon;
grant execute on function est_parent_de(uuid) to authenticated;

create or replace function peut_voir_fiche_eleve(p_eleve uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from eleves e where e.id = p_eleve and e.ecole_id = mon_ecole_id()
    and (est_perso_admin() or (mon_role() = 'enseignant' and e.classe_id = any(mes_classes())) or est_parent_de(p_eleve)))
$$;
revoke all on function peut_voir_fiche_eleve(uuid) from public, anon;
grant execute on function peut_voir_fiche_eleve(uuid) to authenticated;

create table if not exists personnes_autorisees (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  nom text not null check (char_length(nom) between 2 and 120),
  lien text not null default '' check (char_length(lien) <= 60),
  telephone text not null default '' check (char_length(telephone) <= 30),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists personnes_autorisees_idx on personnes_autorisees(eleve_id);
alter table personnes_autorisees enable row level security;
drop policy if exists "lecture personnes_autorisees" on personnes_autorisees;
create policy "lecture personnes_autorisees" on personnes_autorisees for select using (ecole_id = mon_ecole_id() and peut_voir_fiche_eleve(eleve_id));
drop policy if exists "gestion personnes_autorisees" on personnes_autorisees;
create policy "gestion personnes_autorisees" on personnes_autorisees for all
  using (ecole_id = mon_ecole_id() and (est_perso_admin() or est_parent_de(eleve_id)))
  with check (ecole_id = mon_ecole_id() and (est_perso_admin() or est_parent_de(eleve_id))
    and exists (select 1 from eleves e where e.id = eleve_id and e.ecole_id = personnes_autorisees.ecole_id));

create table if not exists sante_eleves (
  eleve_id uuid primary key references eleves(id) on delete cascade,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  allergies text not null default '' check (char_length(allergies) <= 300),
  infos text not null default '' check (char_length(infos) <= 1000),
  maj_par uuid references auth.users(id) on delete set null default auth.uid(),
  maj_at timestamptz not null default now()
);
alter table sante_eleves enable row level security;
drop policy if exists "lecture sante_eleves" on sante_eleves;
create policy "lecture sante_eleves" on sante_eleves for select using (ecole_id = mon_ecole_id() and peut_voir_fiche_eleve(eleve_id));
drop policy if exists "gestion sante_eleves" on sante_eleves;
create policy "gestion sante_eleves" on sante_eleves for all
  using (ecole_id = mon_ecole_id() and (est_perso_admin() or est_parent_de(eleve_id)))
  with check (ecole_id = mon_ecole_id() and (est_perso_admin() or est_parent_de(eleve_id))
    and exists (select 1 from eleves e where e.id = eleve_id and e.ecole_id = sante_eleves.ecole_id));

-- Portier : nom et lien des personnes autorisées d'UN élève de son école
create or replace function personnes_autorisees_portier(p_eleve uuid)
returns table (nom text, lien text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (mon_role() in ('portier','secretariat','direction','fondation')) then raise exception 'Non autorisé'; end if;
  return query select pa.nom, pa.lien from personnes_autorisees pa
    join eleves e on e.id = pa.eleve_id
    where pa.eleve_id = p_eleve and e.ecole_id = mon_ecole_id()
    order by pa.created_at;
end $$;
revoke all on function personnes_autorisees_portier(uuid) from public, anon;
grant execute on function personnes_autorisees_portier(uuid) to authenticated;

-- =====================================================================
-- 67. RÉPONSES DES PARENTS AUX DATES DE L'AGENDA (2026-10-13)
-- =====================================================================
-- Pour une sortie, une réunion, une fête… l'école peut demander une
-- réponse : « autorisation » (j'autorise / je n'autorise pas) ou
-- « presence » (je serai présent / absent). Le parent répond pour CHACUN
-- de ses enfants concernés ; l'école voit les réponses et les oublis.
alter table evenements_agenda add column if not exists demande_reponse text
  check (demande_reponse in ('autorisation','presence'));

create table if not exists reponses_agenda (
  evenement_id uuid not null references evenements_agenda(id) on delete cascade,
  eleve_id uuid not null references eleves(id) on delete cascade,
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  reponse boolean not null,
  commentaire text not null default '' check (char_length(commentaire) <= 300),
  repondu_par uuid references auth.users(id) on delete set null default auth.uid(),
  repondu_at timestamptz not null default now(),
  primary key (evenement_id, eleve_id)
);
alter table reponses_agenda enable row level security;
drop policy if exists "lecture reponses_agenda" on reponses_agenda;
create policy "lecture reponses_agenda" on reponses_agenda for select
  using (ecole_id = mon_ecole_id() and peut_voir_fiche_eleve(eleve_id));
-- Le parent répond pour son enfant, si la date le concerne et demande une réponse
drop policy if exists "reponse parent agenda" on reponses_agenda;
create policy "reponse parent agenda" on reponses_agenda for all
  using (ecole_id = mon_ecole_id() and est_parent_de(eleve_id))
  with check (ecole_id = mon_ecole_id() and est_parent_de(eleve_id) and exists (
    select 1 from evenements_agenda ev join eleves e on e.id = reponses_agenda.eleve_id
    where ev.id = reponses_agenda.evenement_id and ev.ecole_id = reponses_agenda.ecole_id
      and ev.demande_reponse is not null and ev.date_fin >= current_date
      and (ev.classe_ids is null or e.classe_id = any(ev.classe_ids))));
-- L'administration peut noter une réponse reçue sur papier ou par téléphone
drop policy if exists "reponse admin agenda" on reponses_agenda;
create policy "reponse admin agenda" on reponses_agenda for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin()
    and exists (select 1 from eleves e where e.id = reponses_agenda.eleve_id and e.ecole_id = reponses_agenda.ecole_id));

-- =====================================================================
-- 68. CORRECTIONS DE FICHE PROPOSÉES PAR LES PARENTS (2026-10-13)
-- =====================================================================
-- Le parent signale une erreur sur la fiche de SON enfant (date de
-- naissance, téléphone, nom du parent, adresse). Rien n'est modifié
-- tant que le secrétariat / la direction n'a pas validé.
create table if not exists corrections_fiches (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  champs jsonb not null check (jsonb_typeof(champs) = 'object' and champs <> '{}'::jsonb
    and (champs - array['date_naissance','parent_tel','parent_nom','parent_adresse']) = '{}'::jsonb
    and char_length(champs::text) <= 1000),
  commentaire text not null default '' check (char_length(commentaire) <= 300),
  statut text not null default 'en_attente' check (statut in ('en_attente','appliquee','refusee')),
  demande_par uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  traite_at timestamptz
);
create index if not exists corrections_fiches_idx on corrections_fiches(ecole_id, statut);
alter table corrections_fiches enable row level security;
drop policy if exists "parent corrections_fiches lecture" on corrections_fiches;
create policy "parent corrections_fiches lecture" on corrections_fiches for select
  using (ecole_id = mon_ecole_id() and demande_par = auth.uid() and est_parent_de(eleve_id));
drop policy if exists "parent corrections_fiches ajout" on corrections_fiches;
create policy "parent corrections_fiches ajout" on corrections_fiches for insert
  with check (ecole_id = mon_ecole_id() and demande_par = auth.uid() and statut = 'en_attente' and traite_at is null and est_parent_de(eleve_id));
drop policy if exists "admin corrections_fiches" on corrections_fiches;
create policy "admin corrections_fiches" on corrections_fiches for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 69. RÉSUMÉ DE LA SEMAINE AUX PARENTS (2026-10-13)
-- =====================================================================
-- Chaque vendredi à 17h30, chaque parent reçoit le bilan de la semaine
-- de ses enfants (présences, devoirs de la semaine suivante, dates à
-- venir) par notification — fonction annoncer-horaires. Désactivable.
alter table ecoles add column if not exists resume_hebdo boolean not null default true;

-- =====================================================================
-- 70. MENU DE LA CANTINE (2026-10-13)
-- =====================================================================
-- Un menu par jour (repas + goûter), saisi par l'administration, lu par
-- tout le personnel et les parents de l'école.
create table if not exists menus_cantine (
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  date date not null,
  repas text not null default '' check (char_length(repas) <= 300),
  gouter text not null default '' check (char_length(gouter) <= 200),
  maj_at timestamptz not null default now(),
  primary key (ecole_id, date)
);
alter table menus_cantine enable row level security;
drop policy if exists "lecture menus_cantine" on menus_cantine;
create policy "lecture menus_cantine" on menus_cantine for select using (peut_voir_publication(ecole_id, null));
drop policy if exists "gestion menus_cantine" on menus_cantine;
create policy "gestion menus_cantine" on menus_cantine for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 71. PRÉ-INSCRIPTION EN LIGNE (2026-10-13)
-- =====================================================================
-- Page publique preinscription.html?ecole=… : une famille (sans compte)
-- envoie une demande. Écriture UNIQUEMENT par la fonction
-- preinscrire() (contrôles + limites anti-abus) ; lecture et suivi par
-- l'administration de l'école.
create table if not exists preinscriptions (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade,
  enfant_prenom text not null check (char_length(enfant_prenom) between 1 and 80),
  enfant_nom text not null check (char_length(enfant_nom) between 1 and 80),
  date_naissance date,
  sexe text check (sexe in ('M','F')),
  classe_souhaitee text not null default '' check (char_length(classe_souhaitee) <= 80),
  parent_nom text not null check (char_length(parent_nom) between 2 and 120),
  parent_tel text not null check (char_length(parent_tel) between 8 and 30),
  message text not null default '' check (char_length(message) <= 500),
  statut text not null default 'nouvelle' check (statut in ('nouvelle','contactee','inscrite','refusee')),
  created_at timestamptz not null default now()
);
create index if not exists preinscriptions_idx on preinscriptions(ecole_id, created_at desc);
alter table preinscriptions enable row level security;
drop policy if exists "admin preinscriptions" on preinscriptions;
create policy "admin preinscriptions" on preinscriptions for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- Informations publiques minimales pour afficher le formulaire
create or replace function ecole_preinscription(p_ecole uuid)
returns table (nom_ecole text, logo_url text, classes text[])
language sql stable security definer set search_path = public as $$
  select e.nom_ecole, coalesce(e.logo_url, ''),
    coalesce((select array_agg(c.nom order by c.nom) from classes c where c.ecole_id = e.id), '{}')
  from ecoles e where e.id = p_ecole and e.actif = true
$$;
revoke all on function ecole_preinscription(uuid) from public;
grant execute on function ecole_preinscription(uuid) to anon, authenticated;

create or replace function preinscrire(p_ecole uuid, p_enfant_prenom text, p_enfant_nom text, p_date_naissance date,
  p_sexe text, p_classe text, p_parent_nom text, p_parent_tel text, p_message text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_parent_tel, ''), '\D', '', 'g');
begin
  if not exists (select 1 from ecoles where id = p_ecole and actif = true) then raise exception 'École introuvable'; end if;
  if length(v_tel) < 8 then raise exception 'Numéro de téléphone invalide'; end if;
  if p_date_naissance is not null and (p_date_naissance > current_date or p_date_naissance < current_date - interval '25 years') then
    raise exception 'Date de naissance invalide'; end if;
  -- Limites anti-abus : 3 demandes par numéro et par jour, 40 par école et par heure
  if (select count(*) from preinscriptions where ecole_id = p_ecole and regexp_replace(parent_tel, '\D', '', 'g') = v_tel and created_at > now() - interval '1 day') >= 3
    then raise exception 'Vous avez déjà envoyé plusieurs demandes aujourd’hui. L’école va vous rappeler.'; end if;
  if (select count(*) from preinscriptions where ecole_id = p_ecole and created_at > now() - interval '1 hour') >= 40
    then raise exception 'Trop de demandes en ce moment, réessayez plus tard.'; end if;
  insert into preinscriptions(ecole_id, enfant_prenom, enfant_nom, date_naissance, sexe, classe_souhaitee, parent_nom, parent_tel, message)
  values (p_ecole, trim(p_enfant_prenom), upper(trim(p_enfant_nom)), p_date_naissance, nullif(p_sexe, ''), left(trim(coalesce(p_classe, '')), 80),
    trim(p_parent_nom), trim(p_parent_tel), left(trim(coalesce(p_message, '')), 500));
  return true;
end $$;
revoke all on function preinscrire(uuid, text, text, date, text, text, text, text, text) from public;
grant execute on function preinscrire(uuid, text, text, date, text, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- 72. DEMANDES DE DOCUMENTS PAR LES PARENTS (2026-10-13)
-- =====================================================================
-- Le parent demande un document pour SON enfant (certificat de
-- scolarité…) ; le secrétariat le prépare et le marque « prêt » (le
-- parent est prévenu), puis « remis ».
create table if not exists demandes_documents (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  type text not null check (type in ('certificat_scolarite','autre')),
  precision text not null default '' check (char_length(precision) <= 300),
  statut text not null default 'en_attente' check (statut in ('en_attente','pret','remis','refuse')),
  demande_par uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  traite_at timestamptz
);
create index if not exists demandes_documents_idx on demandes_documents(ecole_id, statut);
alter table demandes_documents enable row level security;
drop policy if exists "parent demandes_documents lecture" on demandes_documents;
create policy "parent demandes_documents lecture" on demandes_documents for select
  using (ecole_id = mon_ecole_id() and est_parent_de(eleve_id));
drop policy if exists "parent demandes_documents ajout" on demandes_documents;
create policy "parent demandes_documents ajout" on demandes_documents for insert
  with check (ecole_id = mon_ecole_id() and demande_par = auth.uid() and statut = 'en_attente' and traite_at is null and est_parent_de(eleve_id));
drop policy if exists "admin demandes_documents" on demandes_documents;
create policy "admin demandes_documents" on demandes_documents for all
  using (ecole_id = mon_ecole_id() and est_perso_admin())
  with check (ecole_id = mon_ecole_id() and est_perso_admin());

-- =====================================================================
-- 73. ACCUSÉS DE LECTURE DES MESSAGES (2026-10-13)
-- =====================================================================
-- Heure à laquelle le destinataire a lu le message (posée par la base,
-- jamais par le navigateur) : l'école voit « Lu le … à … ».
alter table messages_internes add column if not exists lu_at timestamptz;
create or replace function horodater_lecture_message() returns trigger
language plpgsql set search_path = public as $$
begin
  new.lu_at := case when new.lu and not coalesce(old.lu, false) then now()
                    when new.lu then old.lu_at
                    else null end;
  return new;
end $$;
revoke all on function horodater_lecture_message() from public, anon, authenticated;
drop trigger if exists horodater_lecture_message on messages_internes;
create trigger horodater_lecture_message before update on messages_internes
  for each row execute function horodater_lecture_message();

-- =====================================================================
-- 74. SANTÉ DES ÉCOLES — nouveaux indicateurs d'usage (2026-10-13)
-- =====================================================================
-- Toujours des CHIFFRES seulement, réservés au compte développeur.
drop function if exists sante_ecoles();
create or replace function sante_ecoles()
returns table (ecole_id uuid, eleves_actifs int, eleves_relies int, enseignants int, jours_appel_7j int,
               paiements_30j int, publications int, telephones_abonnes int, derniere_activite date,
               comptes_enseignants int, devoirs_30j int, messages_parents_30j int, messages_lus_30j int, preinscriptions_30j int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_developpeur() then raise exception 'Réservé au compte développeur'; end if;
  return query
  select e.id,
    (select count(*)::int from eleves el where el.ecole_id = e.id and el.statut = 'Actif'),
    (select count(distinct pe.eleve_id)::int from parents_eleves pe join eleves el on el.id = pe.eleve_id where pe.ecole_id = e.id and el.statut = 'Actif'),
    (select count(*)::int from enseignants t where t.ecole_id = e.id and t.statut = 'Actif'),
    (select count(distinct p.date)::int from presences_eleves p where p.ecole_id = e.id and p.date >= current_date - 7),
    (select count(*)::int from paiements_scolarite ps where ps.ecole_id = e.id and ps.date >= current_date - 30),
    (select count(*)::int from publications pu where pu.ecole_id = e.id),
    (select count(*)::int from push_abonnements pa where pa.ecole_id = e.id),
    greatest(
      (select max(p.date) from presences_eleves p where p.ecole_id = e.id),
      (select max(ps.date) from paiements_scolarite ps where ps.ecole_id = e.id),
      (select max(pu.created_at)::date from publications pu where pu.ecole_id = e.id),
      (select max(m.created_at)::date from messages_internes m where m.ecole_id = e.id),
      (select max(d.created_at)::date from devoirs d where d.ecole_id = e.id),
      (select max(el.date_inscription) from eleves el where el.ecole_id = e.id and el.date_inscription <= current_date)
    ),
    (select count(*)::int from profiles pr where pr.ecole_id = e.id and pr.role = 'enseignant' and pr.enseignant_id is not null),
    (select count(*)::int from devoirs d where d.ecole_id = e.id and d.created_at >= now() - interval '30 days'),
    (select count(*)::int from messages_internes m where m.ecole_id = e.id and m.destinataire_type = 'parent' and m.created_at >= now() - interval '30 days'),
    (select count(*)::int from messages_internes m where m.ecole_id = e.id and m.destinataire_type = 'parent' and m.lu and m.created_at >= now() - interval '30 days'),
    (select count(*)::int from preinscriptions pi where pi.ecole_id = e.id and pi.created_at >= now() - interval '30 days')
  from ecoles e;
end $$;
revoke all on function sante_ecoles() from public, anon;
grant execute on function sante_ecoles() to authenticated;

-- =====================================================================
-- 75. ÉCOLE DE DÉMONSTRATION (2026-10-13)
-- =====================================================================
-- Accord de Vehi Zoh Junior (2026-10-13) : une école entièrement fictive
-- pour présenter EcoMaZ aux autres écoles sans montrer de vraies données.
-- ecoles.est_demo = true l'identifie (bandeau « démonstration » dans
-- l'application). remplir_ecole_demo() REFUSE toute école qui n'est pas
-- marquée démo ou qui a déjà des élèves : une vraie école ne peut jamais
-- être touchée. Téléphones fictifs non attribuables (« 00 00 … »).
alter table ecoles add column if not exists est_demo boolean not null default false;

create or replace function remplir_ecole_demo(p_ecole uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ecole ecoles%rowtype;
  pre text := 'demo-' || left(replace(p_ecole::text, '-', ''), 6) || '-';
  prenoms_f text[] := array['Awa','Aya','Mariam','Fatou','Adjoua','Affoué','Amenan','Grâce','Esther','Christelle','Divine','Océane','Prisca','Naomi','Ange','Emmanuella'];
  prenoms_m text[] := array['Yao','Koffi','Kouamé','Ibrahim','Moussa','Junior','Emmanuel','Jean-Marc','Ismaël','Christ','Daniel','Samuel','Boris','Ange','Elie','Prince'];
  noms text[] := array['KOUASSI','KONÉ','TRAORÉ','YAO','BAMBA','N''GUESSAN','OUATTARA','COULIBALY','KOFFI','DIABATÉ','TOURÉ','ASSI','BROU','KACOU','ZADI','GNAHORÉ','SANOGO','DIARRA','AKA','TANOH'];
  classes text[][] := array[['ps','Petite Section','Maternelle'],['ms','Moyenne Section','Maternelle'],['gs','Grande Section','Maternelle'],
                            ['cp1','CP1','Primaire'],['cp2','CP2','Primaire'],['ce1','CE1','Primaire'],['ce2','CE2','Primaire'],['cm1','CM1','Primaire'],['cm2','CM2','Primaire']];
  mat_mat text[] := array['Langage','Graphisme','Éveil Scientifique','Activités Numériques'];
  mat_pri text[] := array['Français','Mathématiques','Sciences d''Observation','Histoire-Géographie','Anglais'];
  i int; j int; k int; n int := 0; age int; v_ens uuid; v_el uuid; v_cl text; v_cycle text; v_sexe text; v_nom text; v_jour date; v_r float; v_mat text;
  ens_ids uuid[] := '{}';
begin
  if not (est_developpeur() or session_user = 'postgres') then raise exception 'Réservé au compte développeur'; end if;
  select * into v_ecole from ecoles where id = p_ecole;
  if not found then raise exception 'École introuvable'; end if;
  if not v_ecole.est_demo then raise exception 'Refusé : cette école n''est pas une école de démonstration'; end if;
  if exists (select 1 from eleves where ecole_id = p_ecole) then raise exception 'Refusé : cette école a déjà des élèves'; end if;
  perform setseed(0.42);

  update ecoles set directeur_nom = coalesce(nullif(directeur_nom, ''), 'M. Directeur Démo'),
    telephone = coalesce(nullif(telephone, ''), '00 00 00 00 00'), adresse = coalesce(nullif(adresse, ''), 'Abidjan — école de démonstration')
  where id = p_ecole;

  -- Classes et enseignants (un titulaire par classe)
  for i in 1 .. array_length(classes, 1) loop
    v_cl := pre || classes[i][1];
    insert into classes(id, ecole_id, nom, cycle) values (v_cl, p_ecole, classes[i][2], classes[i][3]);
    insert into enseignants(ecole_id, matricule, nom, prenom, sexe, telephone, classes_assignees, matieres, date_embauche, statut)
    values (p_ecole, 'ENS-' || lpad(i::text, 3, '0'), noms[1 + (i * 7) % array_length(noms, 1)],
      case when i % 2 = 0 then prenoms_m[1 + i] else prenoms_f[1 + i] end, case when i % 2 = 0 then 'M' else 'F' end,
      '00 00 00 01 ' || lpad(i::text, 2, '0'), array[v_cl], case when classes[i][3] = 'Maternelle' then mat_mat else mat_pri end,
      date '2021-09-01' + (i * 37), 'Actif') returning id into v_ens;
    update classes set titulaire_id = v_ens where id = v_cl;
    ens_ids := ens_ids || v_ens;
  end loop;

  -- Grille de scolarité commune
  insert into echeances_scolarite(ecole_id, label, montant, date_echeance, ordre) values
    (p_ecole, 'Inscription', 50000, current_date - 40, 1),
    (p_ecole, '1re tranche', 150000, current_date + 10, 2),
    (p_ecole, '2e tranche', 125000, current_date + 75, 3),
    (p_ecole, '3e tranche', 125000, current_date + 150, 4);

  -- Élèves (8 par classe), présences des 10 derniers jours de classe, notes, paiements
  for i in 1 .. array_length(classes, 1) loop
    v_cl := pre || classes[i][1]; v_cycle := classes[i][3];
    age := case classes[i][1] when 'ps' then 3 when 'ms' then 4 when 'gs' then 5 when 'cp1' then 6 when 'cp2' then 7 when 'ce1' then 8 when 'ce2' then 9 when 'cm1' then 10 else 11 end;
    for j in 1 .. 8 loop
      n := n + 1;
      v_sexe := case when random() < 0.5 then 'F' else 'M' end;
      v_nom := noms[1 + floor(random() * array_length(noms, 1))::int];
      insert into eleves(ecole_id, matricule, nom, prenom, sexe, date_naissance, classe_id, parent_nom, parent_tel, parent_adresse, date_inscription, statut)
      values (p_ecole, 'EL-' || lpad(n::text, 4, '0'), v_nom,
        case when v_sexe = 'F' then prenoms_f[1 + floor(random() * 16)::int] else prenoms_m[1 + floor(random() * 16)::int] end, v_sexe,
        (current_date - make_interval(years => age))::date - (floor(random() * 300))::int,
        v_cl, initcap(lower(v_nom)) || ' ' || case when random() < 0.5 then prenoms_f[1 + floor(random() * 16)::int] else prenoms_m[1 + floor(random() * 16)::int] end,
        '00 00 00 ' || lpad((n / 100)::text, 2, '0') || ' ' || lpad((n % 100)::text, 2, '0'), 'Abidjan', current_date - 40 - (n % 10), 'Actif')
      returning id into v_el;
      -- présences
      for k in 0 .. 13 loop
        v_jour := current_date - k;
        continue when extract(isodow from v_jour) > 5;
        v_r := random();
        insert into presences_eleves(ecole_id, date, classe_id, eleve_id, statut, motif)
        values (p_ecole, v_jour, v_cl, v_el, case when v_r < 0.05 then 'Absent' when v_r < 0.08 then 'Retard' else 'Présent' end,
                case when v_r < 0.03 then 'Maladie' else null end);
      end loop;
      -- notes du 1er trimestre
      foreach v_mat in array (case when v_cycle = 'Maternelle' then mat_mat else mat_pri end) loop
        insert into notes(ecole_id, eleve_id, matiere, note, note_sur, trimestre, type, date)
        values (p_ecole, v_el, v_mat, round((8 + random() * 11)::numeric, 1), 20, 'Trimestre 1', 'Devoir', current_date - 20),
               (p_ecole, v_el, v_mat, round((7 + random() * 12)::numeric, 1), 20, 'Trimestre 1', 'Composition', current_date - 5);
      end loop;
      -- paiements : inscription pour tous, 1re tranche pour 70 %
      insert into paiements_scolarite(ecole_id, eleve_id, montant, tranche, date, mode_paiement)
      values (p_ecole, v_el, 50000, 'Inscription', current_date - 30 - (n % 15), case when n % 3 = 0 then 'Mobile Money' else 'Espèces' end);
      if random() < 0.7 then
        insert into paiements_scolarite(ecole_id, eleve_id, montant, tranche, date, mode_paiement)
        values (p_ecole, v_el, 150000, '1re tranche', current_date - (n % 20), case when n % 2 = 0 then 'Mobile Money' else 'Espèces' end);
      end if;
    end loop;
  end loop;

  -- Pointage des enseignants (aujourd'hui)
  insert into presences_enseignants(ecole_id, date, enseignant_id, statut)
  select p_ecole, current_date, x, case when random() < 0.9 then 'Présent' else 'Retard' end from unnest(ens_ids) x;

  -- Devoirs, agenda, cantine
  insert into devoirs(ecole_id, classe_id, matiere, travail, pour_le) values
    (p_ecole, pre || 'cp1', 'Mathématiques', 'Exercices 2 et 3 page 18', current_date + 1),
    (p_ecole, pre || 'ce2', 'Français', 'Apprendre la poésie « Le petit oiseau »', current_date + 2),
    (p_ecole, pre || 'cm2', 'Histoire-Géographie', 'Réviser la leçon sur les régions de Côte d’Ivoire', current_date + 3);
  insert into evenements_agenda(ecole_id, titre, description, type, date_debut, date_fin, classe_ids, demande_reponse) values
    (p_ecole, 'Réunion des parents', 'Présentation des résultats du 1er trimestre', 'reunion', current_date + 5, current_date + 5, null, 'presence'),
    (p_ecole, 'Sortie au Parc national du Banco', 'Prévoir casquette et gourde', 'sortie', current_date + 12, current_date + 12, array[pre || 'ce2', pre || 'cm1'], 'autorisation'),
    (p_ecole, 'Compositions du 1er trimestre', '', 'examen', current_date + 20, current_date + 24, null, null);
  insert into menus_cantine(ecole_id, date, repas, gouter)
  select p_ecole, d::date, (array['Riz sauce graine, poisson','Attiéké poisson braisé','Riz gras au poulet','Foutou sauce arachide','Spaghetti à la viande'])[extract(isodow from d)::int],
    (array['Banane','Bouillie de mil','Mangue','Yaourt','Biscuits'])[extract(isodow from d)::int]
  from generate_series(date_trunc('week', current_date), date_trunc('week', current_date) + interval '4 days', interval '1 day') d;

  return format('%s élèves, %s classes, %s enseignants créés (fictifs)', n, array_length(classes, 1), array_length(ens_ids, 1));
end $$;
revoke all on function remplir_ecole_demo(uuid) from public, anon;
grant execute on function remplir_ecole_demo(uuid) to authenticated;

-- Console Développeur : transformer une école NEUVE (sans aucun élève) en
-- école de démonstration et la remplir de données fictives, en un geste.
create or replace function preparer_ecole_demo(p_ecole uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not est_developpeur() then raise exception 'Réservé au compte développeur'; end if;
  if exists (select 1 from eleves where ecole_id = p_ecole) then raise exception 'Refusé : cette école a déjà des élèves (ce n''est pas une école neuve)'; end if;
  update ecoles set est_demo = true where id = p_ecole;
  return remplir_ecole_demo(p_ecole);
end $$;
revoke all on function preparer_ecole_demo(uuid) from public, anon;
grant execute on function preparer_ecole_demo(uuid) to authenticated;

-- =====================================================================
-- 76. REMPLISSAGE INTELLIGENT — source « texte collé » (2026-10-14)
-- =====================================================================
alter table usage_remplissage_intelligent drop constraint if exists usage_remplissage_intelligent_type_source_check;
alter table usage_remplissage_intelligent add constraint usage_remplissage_intelligent_type_source_check
  check (type_source in ('photo','audio','texte'));

-- =====================================================================
-- 77. DURCISSEMENT DE SÉCURITÉ — audit Supabase du 13/10/2026
-- =====================================================================
-- Demande de Vehi Zoh Junior : « très sécurisée, protection blindée ».
-- Constats de l'outil d'audit officiel (supabase db advisors) et corrections :
-- 1. eleves_portier_lecture : lisible par TOUT compte de l'école, y compris
--    les parents (liste complète des élèves) → réservée au portier et au
--    personnel.
-- 2. tableau_honneur_public / actualites_affichage_public / ecoles_vitrine :
--    lisibles par n'importe qui sur internet, pour TOUTES les écoles à la
--    fois → les visiteurs passent désormais par des fonctions qui exigent
--    l'identifiant exact de l'école (impossible de tout lister) ; les vues
--    ne montrent plus que l'école du compte connecté.
-- 3. Vues internes et fonctions d'aide inutiles aux visiteurs non connectés
--    → droits retirés au rôle « anon ».

-- 1.
create or replace view eleves_portier_lecture as
select id, prenom, nom, classe_id, matricule, statut
from eleves
where ecole_id = mon_ecole_id() and statut = 'Actif'
  and mon_role() in ('portier','enseignant','secretariat','direction','fondation');

-- 2. Vues limitées à l'école du compte connecté
create or replace view tableau_honneur_public as
select ecole_id, categorie, periode, nom_affiche, classe_ou_matiere, libelle_periode, commentaire, updated_at
from tableau_honneur where ecole_id = mon_ecole_id();
create or replace view actualites_affichage_public as
select ecole_id, id, texte, created_at from actualites_affichage where ecole_id = mon_ecole_id();

-- Écran du hall (affichage.html, sans connexion) : tout en une fois, pour UNE école dont on connaît l'identifiant
create or replace function affichage_ecole(p_ecole uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when e.id is null then null else json_build_object(
    'ecole', json_build_object('id', e.id, 'nom_ecole', e.nom_ecole, 'logo_url', coalesce(e.logo_url, '')),
    'honneurs', coalesce((select json_agg(json_build_object('ecole_id', t.ecole_id, 'categorie', t.categorie, 'periode', t.periode, 'nom_affiche', t.nom_affiche,
        'classe_ou_matiere', t.classe_ou_matiere, 'libelle_periode', t.libelle_periode, 'commentaire', t.commentaire, 'updated_at', t.updated_at))
        from tableau_honneur t where t.ecole_id = e.id), '[]'::json),
    'actualites', coalesce((select json_agg(json_build_object('ecole_id', a.ecole_id, 'id', a.id, 'texte', a.texte, 'created_at', a.created_at) order by a.created_at desc)
        from actualites_affichage a where a.ecole_id = e.id), '[]'::json)) end
  from (select 1) x left join ecoles e on e.id = p_ecole and e.actif = true
$$;
revoke all on function affichage_ecole(uuid) from public;
grant execute on function affichage_ecole(uuid) to anon, authenticated;

-- Nom et logo d'UNE école (titre des applications avant connexion)
create or replace function ecole_vitrine(p_ecole uuid) returns table (id uuid, nom_ecole text, logo_url text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom_ecole, coalesce(e.logo_url, '') from ecoles e where e.id = p_ecole and e.actif = true
$$;
revoke all on function ecole_vitrine(uuid) from public;
grant execute on function ecole_vitrine(uuid) to anon, authenticated;

-- 3. Les visiteurs non connectés n'ont plus accès aux vues internes
revoke select on eleves_portier_lecture, enseignants_lecture, fne_config_lecture, paiement_en_ligne_config_lecture,
  tva_categories_lecture, tableau_honneur_public, actualites_affichage_public, ecoles_vitrine from anon;

-- … ni aux fonctions d'aide (elles servent aux règles des comptes connectés)
revoke execute on function est_admin(), est_perso_admin(), est_developpeur(), est_parent(), est_portier(), mon_role(),
  mon_ecole_id(), mon_enseignant_id(), mes_classes() from anon, public;
grant execute on function est_admin(), est_perso_admin(), est_developpeur(), est_parent(), est_portier(), mon_role(),
  mon_ecole_id(), mon_enseignant_id(), mes_classes() to authenticated;
revoke execute on function developpeur_a_acces(uuid) from anon, public;
grant execute on function developpeur_a_acces(uuid) to authenticated;

-- =====================================================================
-- 78. CAHIER D'APPEL ET CAMPS DE BASE (2026-10-13)
-- =====================================================================
-- Demande de Vehi Zoh Junior : deux modules de l'application de l'école
-- (jamais les consoles parent et portier) :
-- 1. Cahier d'appel : registre mensuel des présences (presences_eleves) ;
--    un seul relevé par élève et par jour (index unique ci-dessous).
-- 2. Camps de base : évaluations continues (devoirs, exercices de classe,
--    exercices de maison, interrogations), autant que voulu, notées sur 10,
--    20… ; leur moyenne (« moyenne de classe ») entre dans le bulletin avec
--    la composition : (moyenne de classe + 2 × composition) / 3.
create unique index if not exists presences_eleves_un_par_jour on presences_eleves(eleve_id, date);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  ecole_id uuid not null references ecoles(id) on delete cascade default mon_ecole_id(),
  classe_id text not null references classes(id) on delete cascade,
  matiere text not null check (char_length(matiere) between 1 and 80),
  trimestre text not null check (trimestre in ('Trimestre 1','Trimestre 2','Trimestre 3')),
  type text not null check (type in ('Devoir','Exercice de classe','Exercice de maison','Interrogation')),
  titre text not null default '' check (char_length(titre) <= 120),
  date date not null default current_date,
  note_sur numeric not null default 20 check (note_sur in (5, 10, 20, 40, 50, 100)),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists evaluations_idx on evaluations(ecole_id, classe_id, trimestre);
alter table evaluations enable row level security;
drop policy if exists "acces evaluations" on evaluations;
create policy "acces evaluations" on evaluations for all
  using (ecole_id = mon_ecole_id() and (est_perso_admin() or (mon_role() = 'enseignant' and classe_id = any(mes_classes()))))
  with check (ecole_id = mon_ecole_id() and (est_perso_admin() or (mon_role() = 'enseignant' and classe_id = any(mes_classes())))
    and exists (select 1 from classes c where c.id = evaluations.classe_id and c.ecole_id = evaluations.ecole_id));

alter table notes add column if not exists evaluation_id uuid references evaluations(id) on delete cascade;
create index if not exists notes_evaluation_idx on notes(evaluation_id);
create unique index if not exists notes_une_par_evaluation on notes(evaluation_id, eleve_id) where evaluation_id is not null;
alter table notes drop constraint if exists notes_type_valide;
alter table notes add constraint notes_type_valide check (type is null or type in ('Devoir','Composition','Exercice de classe','Exercice de maison','Interrogation'));
