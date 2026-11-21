#!/bin/sh
# EcoMaZ — Prépare une BASE DE TEST vide, séparée de la vraie (21/11/2026).
# Usage : sh tools/base-test/preparer-base-test.sh <identifiant-du-projet-de-test>
# Applique supabase/schema.sql (toute la structure, AUCUNE donnée réelle) au projet indiqué.
# Sécurité : refuse de toucher au projet de production.
set -eu
PROD="hvqtsvpkxffseclsfoun"
REF="${1:-}"
if [ -z "$REF" ]; then echo "Indiquez l'identifiant du projet de TEST (Project Settings → General → Project ID)."; exit 1; fi
if [ "$REF" = "$PROD" ]; then echo "REFUS : c'est le projet de la VRAIE école. Rien n'a été fait."; exit 1; fi
cd "$(dirname "$0")/../.."
echo "Projet de test : $REF — application de la structure (schema.sql)…"
supabase db query --file supabase/schema.sql --project-ref "$REF" -o json > /tmp/ecomaz-base-test.log 2>&1 || { echo "Échec : voir /tmp/ecomaz-base-test.log"; tail -5 /tmp/ecomaz-base-test.log; exit 1; }
echo "Structure installée. Base de test prête (vide)."
