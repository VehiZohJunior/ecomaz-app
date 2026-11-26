"""EcoMaZ — Fabrique la VERSION DE DÉMONSTRATION pour les prospects (25/11/2026).

Copie l'application en ligne (mêmes écrans, même version) dans un autre dossier,
en remplaçant le serveur par une base FICTIVE qui vit dans le navigateur
(tools/demo/demo.js). Aucun lien vers la vraie base n'est conservé : le script
s'arrête si l'adresse du vrai projet reste quelque part.

Usage : python tools/demo/construire_demo.py "<dossier du dépôt ecomaz-demo>"
Données : tools/captures/donnees-demo.json (école ENTIÈREMENT fictive).
"""
import hashlib, json, os, re, shutil, sys, uuid, random

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
PROD = 'hvqtsvpkxffseclsfoun'
if len(sys.argv) < 2:
    raise SystemExit('Indiquez le dossier de sortie (dépôt ecomaz-demo).')
SORTIE = os.path.abspath(sys.argv[1])
if os.path.abspath(SORTIE).startswith(os.path.abspath(RACINE)):
    raise SystemExit('Refus : la sortie ne doit pas être dans le dépôt de la vraie application.')
os.makedirs(SORTIE, exist_ok=True)

# 1. Nettoyage de la sortie (le dossier .git du dépôt de démo est conservé)
for n in os.listdir(SORTIE):
    if n in ('.git',):
        continue
    p = os.path.join(SORTIE, n)
    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)

# 2. Fichiers de l'application
PAGES = ['index.html', 'enseignant.html', 'parent.html', 'portier.html', 'conditions.html', 'confidentialite.html', 'preinscription.html', 'pointage-gps.html', 'affichage.html', '404.html']
AUTRES = [f for f in os.listdir(RACINE) if os.path.isfile(os.path.join(RACINE, f)) and (
    f.endswith(('.css', '.png', '.svg')) or f.endswith('.min.js') or f in ('i18n.js', 'manifest.json', 'theme.js'))]
for f in AUTRES:
    shutil.copy2(os.path.join(RACINE, f), os.path.join(SORTIE, f))

SCRIPT_SUPABASE = re.compile(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^"]+"[^>]*></script>\s*')
for f in PAGES:
    h = open(os.path.join(RACINE, f), encoding='utf-8').read()
    h = SCRIPT_SUPABASE.sub('', h)
    h = re.sub(r'<link rel="preconnect" href="https://' + PROD + r'\.supabase\.co"[^>]*>\s*', '', h)
    h = h.replace(f'https://{PROD}.supabase.co/functions/v1/manifeste-application?espace=enseignant', 'manifest.json?espace=enseignant')
    if '<script src="config.js"></script>' in h:
        h = h.replace('<script src="config.js"></script>', '<script src="demo-donnees.js"></script>\n<script src="demo.js"></script>\n<script src="config.js"></script>')
    h = h.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
    h = h.replace('/ecomaz-app/landing/', '/ecomaz-demo/').replace('/ecomaz-app/', '/ecomaz-demo/')
    h = re.sub(r'<title>([^<]*)</title>', r'<title>\1 — Démonstration</title>', h, count=1)
    open(os.path.join(SORTIE, f), 'w', encoding='utf-8', newline='\n').write(h)

# Adresse du serveur : une adresse inexistante (rien ne part vers la vraie base)
open(os.path.join(SORTIE, 'config.js'), 'w', encoding='utf-8', newline='\n').write(
    "/* EcoMaZ — DÉMONSTRATION : aucun serveur, base fictive dans le navigateur (demo.js) */\n"
    "const SUPABASE_URL = 'https://demo.invalid';\nconst SUPABASE_KEY = 'demo';\n")
shutil.copy2(os.path.join(ICI, 'demo.js'), os.path.join(SORTIE, 'demo.js'))

# Toute trace restante de l'adresse du vrai projet (politique de sécurité des pages, scripts) → adresse fictive
for f in os.listdir(SORTIE):
    p = os.path.join(SORTIE, f)
    if os.path.isfile(p) and f.endswith(('.html', '.js', '.json', '.css')):
        t = open(p, encoding='utf-8').read()
        if PROD in t:
            open(p, 'w', encoding='utf-8', newline='\n').write(t.replace(f'{PROD}.supabase.co', 'demo.invalid').replace(PROD, 'demo'))

# 3. École fictive
D = json.load(open(os.path.join(RACINE, 'tools', 'captures', 'donnees-demo.json'), encoding='utf-8'))
ancienne = D.pop('_ecole_id')
for k in ('enseignants_lecture', 'eleves_portier_lecture'):
    D.pop(k, None)
D = {k: v for k, v in D.items() if v}
texte = json.dumps(D, ensure_ascii=False)
ECOLE = '0d3e0000-0000-4000-8000-00000000e001'
texte = texte.replace(ancienne, ECOLE).replace('demo-853c98-', 'flam-')
D = json.loads(texte)
e = D['ecoles'][0]
e.update(nom_ecole='École Les Flamboyants', adresse='Cocody, Abidjan — école fictive', directeur_nom='M. Konan Yao',
         fondateur_nom='Mme Kouadio Ama', telephone='00 00 00 00 00', est_demo=True, geofence_latitude=5.3489,
         geofence_longitude=-3.9897, geofence_rayon_metres=120, scolarite_visible_parents=True)

rnd = random.Random(2026)
ens = D['enseignants']
cp1 = next(c for c in D['classes'] if c['code'] == 'cp1')
prof = next((t for t in ens if cp1['id'] in (t.get('classes_assignees') or [])), ens[0])
eleves_cp1 = [x for x in D['eleves'] if x['classe_id'] == cp1['id']]
autre = next(x for x in D['eleves'] if x['classe_id'] != cp1['id'] and x['classe_id'].endswith('-gs'))
enfant1 = eleves_cp1[0]
autre.update(nom=enfant1['nom'], parent_nom=enfant1['parent_nom'], parent_tel=enfant1['parent_tel'])
D['profiles'] = [
    {'id': 'demo-direction', 'ecole_id': ECOLE, 'role': 'direction', 'nom_complet': 'Konan Yao', 'civilite': 'M', 'nom_appel': 'Konan', 'mdp_a_changer': False},
    {'id': 'demo-enseignant', 'ecole_id': ECOLE, 'role': 'enseignant', 'nom_complet': f"{prof['prenom']} {prof['nom']}", 'civilite': 'F' if prof.get('sexe') == 'F' else 'M', 'nom_appel': prof['nom'].title(), 'enseignant_id': prof['id'], 'mdp_a_changer': False},
    {'id': 'demo-parent', 'ecole_id': ECOLE, 'role': 'parent', 'nom_complet': enfant1['parent_nom'], 'civilite': 'M', 'nom_appel': enfant1['parent_nom'].split()[0], 'mdp_a_changer': False},
    {'id': 'demo-portier', 'ecole_id': ECOLE, 'role': 'portier', 'nom_complet': 'Bamba Seydou', 'civilite': 'M', 'nom_appel': 'Bamba', 'mdp_a_changer': False},
]
# Collègues fictifs (pour « Personnes connectées » et les messages entre collègues)
D['profiles'] += [
    {'id': 'demo-fondation', 'ecole_id': ECOLE, 'role': 'fondation', 'nom_complet': 'Kouadio Ama', 'civilite': 'F', 'nom_appel': 'Kouadio', 'mdp_a_changer': False},
    {'id': 'demo-secretariat', 'ecole_id': ECOLE, 'role': 'secretariat', 'nom_complet': 'Aya Kouassi', 'civilite': 'F', 'nom_appel': 'Kouassi', 'mdp_a_changer': False}]
for i, t in enumerate([t for t in ens if t['id'] != prof['id']][:6]):
    D['profiles'].append({'id': f'demo-collegue-{i + 1}', 'ecole_id': ECOLE, 'role': 'enseignant', 'nom_complet': f"{t['prenom']} {t['nom']}", 'civilite': 'F' if t.get('sexe') == 'F' else 'M', 'nom_appel': t['nom'].title(), 'enseignant_id': None, 'mdp_a_changer': False})
D['messages_personnel'] = [
    {'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'expediteur_id': 'demo-secretariat', 'destinataire_id': 'demo-direction', 'contenu': 'Bonjour Monsieur le Directeur, les reçus de la semaine sont prêts à signer.', 'lu_at': None, 'created_at': '2026-10-16T08:15:00+00:00'},
    {'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'expediteur_id': 'demo-direction', 'destinataire_id': 'demo-enseignant', 'contenu': 'Bonjour, pensez à faire l’appel avant 8 h 15. Merci !', 'lu_at': None, 'created_at': '2026-10-16T07:40:00+00:00'}]
D['parents_eleves'] = [{'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'parent_profile_id': 'demo-parent', 'eleve_id': x['id'], 'created_at': '2026-09-20T09:00:00+00:00'} for x in (enfant1, autre)]

# Pointage des enseignants sur les 10 derniers jours de classe (fictif)
jours = sorted({p['date'] for p in D.get('presences_eleves', [])})
D['presences_enseignants'] = []
for j in jours:
    for t in ens:
        r = rnd.random()
        retard = r < 0.12
        h, m = (7, rnd.randint(36, 55)) if retard else (7, rnd.randint(5, 28))
        D['presences_enseignants'].append({'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'enseignant_id': t['id'], 'date': j,
            'statut': 'Absent' if r > 0.97 else ('Retard' if retard else 'Présent'), 'heure_arrivee': None if r > 0.97 else f'{h:02d}:{m:02d}:00',
            'heure_depart': None if r > 0.97 else f'16:{rnd.randint(30, 59):02d}:00', 'methode': rnd.choice(['GPS', 'QR', 'GPS']), 'minutes_retard': (m - 30) if retard else 0, 'motif': None})
# Dépenses et personnel (fictifs)
D['depenses'] = [{'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'categorie': c, 'libelle': l, 'montant': mt, 'date': j, 'mode_paiement': mp} for c, l, mt, j, mp in [
    ('Électricité', 'Facture CIE septembre', 86500, '2026-10-05', 'Mobile Money'), ('Eau', 'Facture SODECI', 24300, '2026-10-06', 'Espèces'),
    ('Fournitures', 'Craies, cahiers de préparation', 41000, '2026-10-08', 'Espèces'), ('Entretien', 'Réparation table-bancs CE1', 35000, '2026-10-13', 'Espèces'),
    ('Transport', 'Carburant car scolaire', 60000, '2026-10-15', 'Espèces')]]
D['personnel_autre'] = [
    {'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'nom': 'BAMBA', 'prenom': 'Seydou', 'sexe': 'M', 'poste': 'Gardien', 'telephone': '00 00 00 02 01', 'salaire_mensuel': 75000, 'date_embauche': '2022-09-01', 'statut': 'Actif'},
    {'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'nom': 'N\'GUESSAN', 'prenom': 'Adjoua', 'sexe': 'F', 'poste': 'Cuisinière', 'telephone': '00 00 00 02 02', 'salaire_mensuel': 70000, 'date_embauche': '2023-09-01', 'statut': 'Actif'}]

# Cas réalistes pour l'assistant « À faire aujourd'hui » (fictifs) :
# - 2 élèves absents aux 3 derniers appels de leur classe
for x in [e for e in D['eleves'] if e['classe_id'] != cp1['id']][3:5]:
    dates = sorted({p['date'] for p in D.get('presences_eleves', []) if p.get('classe_id') == x['classe_id']})[-3:]
    for p in D.get('presences_eleves', []):
        if p['eleve_id'] == x['id'] and p['date'] in dates:
            p['statut'] = 'Absent'
    connues = {p['date'] for p in D.get('presences_eleves', []) if p['eleve_id'] == x['id']}
    for d in dates:
        if d not in connues:
            D['presences_eleves'].append({'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'eleve_id': x['id'], 'classe_id': x['classe_id'], 'date': d, 'statut': 'Absent'})
# - 6 familles n'ont pas encore réglé l'inscription (date limite passée)
sans_inscription = {e['id'] for e in D['eleves'][10:16]}
D['paiements_scolarite'] = [p for p in D.get('paiements_scolarite', []) if not (p['eleve_id'] in sans_inscription and p.get('tranche') == 'Inscription')]
# Écran d'affichage : tableau d'honneur et actualités (fictifs)
D['tableau_honneur'] = [{'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'categorie': c, 'periode': p, 'nom_affiche': n, 'classe_ou_matiere': cm, 'libelle_periode': lp, 'commentaire': co, 'updated_at': '2026-10-15T08:00:00+00:00'} for c, p, n, cm, lp, co in [
    ('eleve', 'mois', 'Awa KONÉ', 'CM2', 'Octobre', 'Première de la classe, toujours souriante'), ('eleve', 'trimestre', 'Junior AKA', 'CE1', '1er trimestre', 'Gros progrès en lecture'),
    ('eleve', 'annee', 'Prisca YAO', 'CP2', '2025-2026', 'Excellente en tout'), ('enseignant', 'mois', 'Moussa KOFFI', 'CP1', 'Octobre', 'Appel fait tous les jours avant 8 h'),
    ('enseignant', 'trimestre', 'Fatou KONÉ', 'Mathématiques', '1er trimestre', 'Classe la plus régulière'), ('enseignant', 'annee', 'Aya COULIBALY', 'Petite Section', '2025-2026', 'Toujours à l’écoute des parents')]]
D['actualites_affichage'] = [{'id': str(uuid.UUID(int=rnd.getrandbits(128))), 'ecole_id': ECOLE, 'texte': t, 'created_at': d} for t, d in [
    ('Réunion des parents samedi à 9 h dans la cour.', '2026-10-14T08:00:00+00:00'), ('Compositions du 1er trimestre à partir du 11 décembre.', '2026-10-13T08:00:00+00:00'),
    ('Fête de Noël de l’école : vendredi 18 décembre.', '2026-10-12T08:00:00+00:00')]]
D['_ancre'] = max(jours) if jours else '2026-10-16'
D['_version'] = hashlib.sha1(json.dumps(D, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
open(os.path.join(SORTIE, 'demo-donnees.js'), 'w', encoding='utf-8', newline='\n').write(
    '/* EcoMaZ — DÉMONSTRATION : école ENTIÈREMENT FICTIVE (aucune donnée réelle) */\nwindow.ECOMAZ_DEMO_DONNEES = ' + json.dumps(D, ensure_ascii=False) + ';\n')

# 4. Fichiers du site de démo
open(os.path.join(SORTIE, 'robots.txt'), 'w', encoding='utf-8', newline='\n').write('User-agent: *\nDisallow: /\n')
open(os.path.join(SORTIE, '.nojekyll'), 'w').close()
open(os.path.join(SORTIE, 'README.md'), 'w', encoding='utf-8', newline='\n').write(
    '# EcoMaZ — démonstration\n\nVersion de démonstration d’EcoMaZ avec une école **entièrement fictive** (École Les Flamboyants).\n'
    'Aucun serveur, aucun compte : les essais restent dans le navigateur du visiteur.\n\n'
    'Fabriquée automatiquement à partir de l’application en ligne par `tools/demo/construire_demo.py` (dépôt EcoMaZ).\n')

# 5. Contrôle final : plus aucune trace du vrai projet
reste = [f for f in os.listdir(SORTIE) if os.path.isfile(os.path.join(SORTIE, f)) and PROD in open(os.path.join(SORTIE, f), encoding='utf-8', errors='ignore').read()]
if reste:
    raise SystemExit('ARRÊT : adresse du vrai projet encore présente dans ' + ', '.join(reste))
print(f"Démo fabriquée dans {SORTIE} : {len(os.listdir(SORTIE))} fichiers, {len(D['eleves'])} élèves fictifs, aucune trace du vrai projet.")
