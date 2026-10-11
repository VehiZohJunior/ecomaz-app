"""Sauvegarde complète des données EcoMaZ sur cet ordinateur.

Copie chaque table de la base (toutes les écoles) dans un fichier JSON :
  Desktop\\DOSSIER CODAGE\\EcoMaZ-sauvegardes\\AAAA-MM-JJ_HHhMM\\<table>.json
Garde les 30 sauvegardes les plus récentes et efface les plus anciennes.

- Gratuit : passe par la commande « supabase » déjà installée et connectée.
- Les clés secrètes (PayDunya, FNE) et les liens de pointage à usage unique
  ne sont PAS copiés : elles se ressaisissent en cas de besoin.
- Ce dossier contient les données personnelles des élèves et des familles :
  il ne doit jamais être envoyé sur GitHub ni partagé.

Usage : python tools/sauvegarde.py   (lancé chaque soir par le Planificateur
de tâches Windows, tâche « EcoMaZ sauvegarde »)
"""
import datetime, json, os, shutil, subprocess, sys, tempfile

PROJET = 'hvqtsvpkxffseclsfoun'
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINATION = os.path.join(os.path.dirname(RACINE), 'EcoMaZ-sauvegardes')
GARDER = 30
SUPABASE = shutil.which('supabase') or os.path.expandvars(r'%APPDATA%\npm\supabase.cmd')
# Colonnes jamais copiées (secrets ou jetons à usage unique)
EXCLUES = {
    'paiement_en_ligne_config': ['identifiants'],
    'fne_config': ['api_key'],
    'liens_pointage_gps': ['token'],
}


def requete(sql):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write(sql)
        chemin = f.name
    try:
        r = subprocess.run([SUPABASE, 'db', 'query', '--file', chemin, '--linked', '--project-ref', PROJET, '-o', 'json'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=RACINE)
    finally:
        os.remove(chemin)
    debut = min([i for i in (r.stdout.find('{'), r.stdout.find('[')) if i >= 0], default=-1)
    if r.returncode != 0 or debut < 0:
        raise RuntimeError(f'code {r.returncode} | sortie: {r.stdout.strip()[:200]} | erreurs: {r.stderr.strip()[-300:]}')
    # Lit la première valeur JSON de la sortie. Selon qu'une fenêtre est
    # ouverte ou non (tâche planifiée), la commande renvoie soit
    # {"rows": [...]}, soit directement la liste [...].
    objet, _fin = json.JSONDecoder().raw_decode(r.stdout[debut:])
    if isinstance(objet, list):
        return objet
    if 'rows' not in objet:
        raise RuntimeError(f'réponse inattendue : {r.stdout.strip()[:300]}')
    return objet['rows']


def main():
    horodatage = datetime.datetime.now().strftime('%Y-%m-%d_%Hh%M-%S')
    dossier = os.path.join(DESTINATION, horodatage)
    os.makedirs(dossier, exist_ok=True)
    journal = []
    tables = [r['table_name'] for r in requete(
        "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1;")]
    # Une seule requête pour toutes les tables (plus rapide qu'un appel par table)
    morceaux = []
    for t in tables:
        sans = EXCLUES.get(t, [])
        selection = f"(to_jsonb(x) - array[{','.join(repr(c) for c in sans)}]::text[])" if sans else 'to_jsonb(x)'
        morceaux.append(f"select '{t}' as t, coalesce((select jsonb_agg({selection}) from public.\"{t}\" x), '[]'::jsonb) as d")
    contenu = {r['t']: (json.loads(r['d']) if isinstance(r['d'], str) else r['d'])
               for r in requete('\nunion all\n'.join(morceaux) + ';')}
    total = 0
    for t in tables:
        lignes = contenu[t]
        with open(os.path.join(dossier, t + '.json'), 'w', encoding='utf-8') as f:
            json.dump(lignes, f, ensure_ascii=False, indent=1)
        total += len(lignes)
        journal.append(f'{t} : {len(lignes)} ligne(s)')
    with open(os.path.join(dossier, 'LISEZMOI.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Sauvegarde EcoMaZ du {horodatage}\n{len(tables)} tables, {total} lignes au total.\n'
                'Données personnelles : ne pas envoyer sur internet. Pour restaurer, demander à Claude.\n\n'
                + '\n'.join(journal) + '\n')
    # Rotation : on garde les GARDER plus récentes
    anciennes = sorted(d for d in os.listdir(DESTINATION) if os.path.isdir(os.path.join(DESTINATION, d)))[:-GARDER]
    for d in anciennes:
        shutil.rmtree(os.path.join(DESTINATION, d), ignore_errors=True)
    print(f'Sauvegarde terminée : {dossier} ({len(tables)} tables, {total} lignes)')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # trace lisible dans le dossier de sauvegarde
        os.makedirs(DESTINATION, exist_ok=True)
        with open(os.path.join(DESTINATION, 'ERREURS.txt'), 'a', encoding='utf-8') as f:
            f.write(f'{datetime.datetime.now():%Y-%m-%d %H:%M} — échec : {e}\n')
        print('Échec de la sauvegarde :', e)
        sys.exit(1)
