"""Reconstruit app.js à partir des morceaux du dossier app/ (21/11/2026).

app.js faisait 16 000 lignes d'un seul tenant : il est désormais découpé en
morceaux lisibles dans app/ (un par grande partie de l'application). Ce sont
EUX qu'on modifie. app.js est reconstruit en les mettant bout à bout, dans
l'ordre de leurs numéros : le comportement est strictement le même qu'avant
(mêmes variables globales, même ordre), et les pages chargent toujours
app.min.js.

Usage : python tools/assembler_app.py            → réécrit app.js
        python tools/assembler_app.py --verifier → code 1 si app.js n'est pas à jour
Appelé automatiquement par tools/minifier.py.
"""
import os, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER = os.path.join(RACINE, 'app')
ENTETE = ('/* EcoMaZ — FICHIER GÉNÉRÉ par tools/assembler_app.py à partir du dossier app/.\n'
          '   Ne pas modifier ici : modifier le morceau concerné dans app/, puis lancer python tools/minifier.py. */\n')

def assembler():
    morceaux = sorted(f for f in os.listdir(DOSSIER) if f.endswith('.js'))
    if not morceaux:
        sys.exit('Dossier app/ vide')
    contenu = ''.join(open(os.path.join(DOSSIER, f), encoding='utf-8', newline='').read() for f in morceaux)
    nl = '\r\n' if '\r\n' in contenu else '\n'
    return ENTETE.replace('\n', nl) + contenu, morceaux

if __name__ == '__main__':
    texte, morceaux = assembler()
    cible = os.path.join(RACINE, 'app.js')
    actuel = open(cible, encoding='utf-8', newline='').read() if os.path.exists(cible) else ''
    if '--verifier' in sys.argv:
        sys.exit(0 if actuel == texte else 1)
    if actuel != texte:
        open(cible, 'w', encoding='utf-8', newline='').write(texte)
    print(f'app.js assemblé à partir de {len(morceaux)} morceaux')
