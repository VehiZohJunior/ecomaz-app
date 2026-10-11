"""Construit les icônes de l'application (écran d'accueil du téléphone,
onglet du navigateur) aux couleurs EcoMaZ : fond vert forêt, toque dorée.

- icon-192.png, icon-512.png : coins arrondis, fond transparent autour ;
- icon-maskable-512.png : fond plein (Android découpe lui-même la forme),
  dessin réduit pour rester dans la zone sûre.
Copie aussi les trois fichiers dans la Console Développeur.

Rendu par Microsoft Edge en mode sans fenêtre (déjà installé, gratuit).
Dessin : icône « graduation-cap » de Lucide (licence ISC).
Usage : python tools/generer_icones_app.py
"""
import os, shutil, subprocess, tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONSOLE_DEV = os.path.join(os.path.dirname(RACINE), 'EcoMaZ-dev-console')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
VERT, VERT_CLAIR, OR = '#14392d', '#1f5442', '#e8b04b'

TOQUE = f'''
  <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" fill="{OR}"/>
  <path d="M22 10v6"/>
  <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'''


def svg(taille, masquable):
    rayon = 0 if masquable else taille * 0.22
    echelle = (0.50 if masquable else 0.62) * taille / 24     # zone sûre Android : 80 % central
    decal = (taille - 24 * echelle) / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{taille}" height="{taille}" viewBox="0 0 {taille} {taille}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{VERT_CLAIR}"/><stop offset="1" stop-color="{VERT}"/></linearGradient></defs>
  <rect width="{taille}" height="{taille}" rx="{rayon}" fill="url(#g)"/>
  <g transform="translate({decal} {decal + taille * 0.02}) scale({echelle})" fill="none" stroke="{OR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{TOQUE}
  </g>
</svg>'''


def rendre(nom, taille, masquable):
    dossier = tempfile.mkdtemp()
    page = os.path.join(dossier, 'icone.html')
    with open(page, 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><html><body style="margin:0;background:transparent">{svg(taille, masquable)}</body></html>')
    sortie = os.path.join(RACINE, nom)
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                    f'--window-size={taille},{taille}', f'--screenshot={sortie}', 'file:///' + page.replace('\\', '/')],
                   check=True, capture_output=True)
    shutil.rmtree(dossier, ignore_errors=True)
    if os.path.isdir(CONSOLE_DEV):
        shutil.copy(sortie, os.path.join(CONSOLE_DEV, nom))
    print(nom, os.path.getsize(sortie), 'octets')


rendre('icon-192.png', 192, False)
rendre('icon-512.png', 512, False)
rendre('icon-maskable-512.png', 512, True)
