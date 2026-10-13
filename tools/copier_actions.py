"""Copie sur ce PC de TOUTES les actions EcoMaZ (corrections et nouveautés),
depuis le début, sans jamais créer de doublon.

Demande de Vehi Zoh Junior (2026-10-14) : « création des copies de toutes les
corrections et nouvelles actions depuis le début jusqu'à cette heure sur mon
PC. Si une action a déjà été copiée, ne crée pas de doublon. »

Pour chaque dépôt (application, Console Développeur, journal), chaque action
(commit) devient un fichier lisible dans
    Desktop\\DOSSIER CODAGE\\EcoMaZ-copies-actions\\<dépôt>\\
nommé  AAAA-MM-JJ_HHhMM_<empreinte>_<titre>.patch
L'empreinte (identifiant unique de l'action) sert à reconnaître une action
déjà copiée : elle n'est jamais recopiée. Les dossiers d'avant le suivi
(EcoMaZ, EcoMaZ-deploy, EcoMaZ-github) sont archivés une seule fois.
Un INDEX.md (réécrit à chaque passage, jamais dupliqué) liste tout.

Usage : python tools/copier_actions.py      (lancé aussi chaque soir par sauvegarde.py)
"""
import os, re, subprocess, sys, zipfile, datetime

RACINE_CODAGE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(RACINE_CODAGE, 'EcoMaZ-copies-actions')
DEPOTS = [('Application EcoMaZ', 'EcoMaZgit'), ('Console Développeur', 'EcoMaZ-dev-console'), ('Journal des actions', 'EcoMaZ-journal')]
AVANT_SUIVI = ['EcoMaZ', 'EcoMaZ-deploy', 'EcoMaZ-github']


def git(depot, *args):
    return subprocess.run(['git', '-C', depot, *args], capture_output=True, check=True).stdout


def titre_fichier(sujet):
    t = re.sub(r'[\\/:*?"<>|\r\n]+', ' ', sujet)
    t = re.sub(r'\s+', '-', t.strip())[:70].strip('-.')
    return t or 'action'


def copier_depot(libelle, nom):
    depot = os.path.join(RACINE_CODAGE, nom)
    if not os.path.isdir(os.path.join(depot, '.git')):
        return libelle, 0, 0, []
    dossier = os.path.join(DEST, nom)
    os.makedirs(dossier, exist_ok=True)
    deja = set()
    for f in os.listdir(dossier):
        m = re.match(r'^\d{4}-\d{2}-\d{2}_\d{2}h\d{2}_([0-9a-f]{10})_', f)
        if m:
            deja.add(m.group(1))
    sortie = git(depot, 'log', '--reverse', '--format=%H%x1f%ad%x1f%s', '--date=format:%Y-%m-%d_%Hh%M').decode('utf-8', 'replace')
    actions, nouvelles = [], 0
    for ligne in sortie.splitlines():
        h, date, sujet = ligne.split('\x1f', 2)
        court = h[:10]
        actions.append((date, court, sujet))
        if court in deja:
            continue
        contenu = git(depot, 'format-patch', '-1', '--stdout', '--no-signature', h)
        chemin = os.path.join(dossier, f'{date}_{court}_{titre_fichier(sujet)}.patch')
        with open(chemin, 'wb') as fh:
            fh.write(contenu)
        deja.add(court)
        nouvelles += 1
    return libelle, len(actions), nouvelles, actions


def archiver_avant_suivi():
    dossier = os.path.join(DEST, 'avant-le-suivi')
    os.makedirs(dossier, exist_ok=True)
    faits = 0
    for nom in AVANT_SUIVI:
        src = os.path.join(RACINE_CODAGE, nom)
        zip_chemin = os.path.join(dossier, nom + '.zip')
        if not os.path.isdir(src) or os.path.exists(zip_chemin):
            continue
        with zipfile.ZipFile(zip_chemin, 'w', zipfile.ZIP_DEFLATED) as z:
            for base, _dirs, fichiers in os.walk(src):
                for f in fichiers:
                    complet = os.path.join(base, f)
                    z.write(complet, os.path.relpath(complet, RACINE_CODAGE))
        faits += 1
    return faits


def main():
    os.makedirs(DEST, exist_ok=True)
    bilans = [copier_depot(lib, nom) for lib, nom in DEPOTS]
    archives = archiver_avant_suivi()
    maintenant = datetime.datetime.now().strftime('%d/%m/%Y à %Hh%M')
    lignes = ['# Copies de toutes les actions EcoMaZ', '',
              f'Mis à jour le {maintenant}. Chaque action = un fichier `.patch` (date, empreinte, titre) : '
              'il contient la description et le détail exact de ce qui a changé. Une action déjà copiée n’est jamais recopiée.', '']
    for lib, total, nouvelles, actions in bilans:
        lignes += [f'## {lib} — {total} action(s)', '']
        for date, court, sujet in reversed(actions):
            lignes.append(f'- {date.replace("_", " ")} · `{court}` · {sujet}')
        lignes.append('')
    lignes += ['## Avant le suivi des versions', '', 'Archives `avant-le-suivi/EcoMaZ.zip`, `EcoMaZ-deploy.zip`, `EcoMaZ-github.zip` (copiées une seule fois).', '']
    with open(os.path.join(DEST, 'INDEX.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lignes))
    for lib, total, nouvelles, _ in bilans:
        print(f'{lib} : {total} action(s), {nouvelles} nouvelle(s) copie(s)')
    print(f'Archives avant le suivi créées : {archives}')
    print('Dossier :', DEST)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as e:
        print('Erreur git :', (e.stderr or b'').decode('utf-8', 'replace')[:300])
        sys.exit(1)
