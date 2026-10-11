"""Produit les versions compactes (.min.js) des scripts autonomes de l'application.

Usage (depuis le dossier EcoMaZgit) :  python tools/minifier.py

- Outil utilisé : `deno bundle --minify` (Deno, déjà installé, gratuit).
- Seuls les scripts entièrement enfermés dans une fonction (function(){ … })()
  sont compactés : ils ne déclarent aucune variable globale, donc le
  compactage ne peut rien casser. app.js et supabase-client.js partagent des
  variables globales (DB, session, ui…) et des fonctions appelées depuis le
  HTML : ils restent tels quels.
- Les fichiers lisibles (theme.js, icones.js…) restent la source à modifier ;
  relancer ce script après chaque modification.
"""
import os, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ['theme.js', 'icones.js', 'motion.js', 'recherche.js', 'espace-fixe.js']

for f in SCRIPTS:
    src = os.path.join(RACINE, f)
    dst = os.path.join(RACINE, f[:-3] + '.min.js')
    contenu = open(src, encoding='utf-8').read().strip()
    if not (contenu.startswith('/*') or contenu.startswith('(function')) or not contenu.rstrip(';').endswith('})()'):
        sys.exit(f'{f} : le script doit être entièrement enfermé dans (function(){{ … }})(); — compactage refusé.')
    r = subprocess.run(['deno', 'bundle', '--minify', '--format=esm', '--platform=browser', src, '-o', dst],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', shell=(os.name == 'nt'))
    if r.returncode != 0:
        sys.exit(f'Échec du compactage de {f} :\n{r.stderr}')
    entete = f'/* EcoMaZ — version compacte de {f} (générée par tools/minifier.py, ne pas modifier à la main) */\n'
    if f == 'icones.js':
        entete += '/* Icônes : Lucide (lucide-static 1.55.0), licence ISC — https://lucide.dev */\n'
    code = open(dst, encoding='utf-8').read()
    open(dst, 'w', encoding='utf-8').write(entete + code)
    print(f'{f} -> {os.path.basename(dst)} ({os.path.getsize(src)} -> {os.path.getsize(dst)} octets)')
