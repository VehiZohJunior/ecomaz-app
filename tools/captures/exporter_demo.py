"""Exporte les données de l'ÉCOLE DÉMO (entièrement fictives) vers
tools/captures/donnees-demo.json, pour les captures d'écran de la refonte.
Lecture seule. Le fichier reste sur ce PC (exclu de GitHub).
Usage : python tools/captures/exporter_demo.py
"""
import json, os, shutil, subprocess, tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
REF = 'hvqtsvpkxffseclsfoun'
SUPABASE = shutil.which('supabase') or os.path.expandvars(r'%APPDATA%\npm\supabase.cmd')


def requete(sql):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write(sql); chemin = f.name
    try:
        sortie = subprocess.run([SUPABASE, 'db', 'query', '--file', chemin, '--linked', '--project-ref', REF, '-o', 'json'],
                                cwd=RACINE, capture_output=True, text=True, encoding='utf-8', check=True).stdout
    finally:
        os.remove(chemin)
    debut = min(i for i in (sortie.find('['), sortie.find('{')) if i >= 0)
    valeur, _ = json.JSONDecoder().raw_decode(sortie[debut:])
    return valeur['rows'] if isinstance(valeur, dict) and 'rows' in valeur else valeur


ecole = requete("select id from ecoles where est_demo limit 1;")
if not ecole:
    raise SystemExit("Aucune école démo dans la base.")
eid = ecole[0]['id']
tables = [r['table_name'] for r in requete(
    "select table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name) "
    "where c.table_schema='public' and c.column_name='ecole_id' and t.table_type='BASE TABLE' order by 1;")]
morceaux = [f"select 'ecoles' t, coalesce((select jsonb_agg(x) from ecoles x where id = '{eid}'), '[]'::jsonb) d"]
morceaux += [f"select '{t}' t, coalesce((select jsonb_agg(x) from public.\"{t}\" x where ecole_id = '{eid}'), '[]'::jsonb) d" for t in tables]
donnees = {r['t']: (json.loads(r['d']) if isinstance(r['d'], str) else r['d']) for r in requete('\nunion all\n'.join(morceaux) + ';')}
# Les vues lues par l'application, reconstituées depuis leurs tables
donnees['enseignants_lecture'] = donnees.get('enseignants', [])
donnees['eleves_portier_lecture'] = [{k: e[k] for k in ('id', 'ecole_id', 'prenom', 'nom', 'classe_id', 'matricule', 'statut')} for e in donnees.get('eleves', [])]
donnees['_ecole_id'] = eid
with open(os.path.join(ICI, 'donnees-demo.json'), 'w', encoding='utf-8') as f:
    json.dump(donnees, f, ensure_ascii=False)
print(f"École démo {eid} : {sum(len(v) for k, v in donnees.items() if isinstance(v, list))} lignes, {len(tables)} tables")
