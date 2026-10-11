"""Publie la branche de travail dans le dossier /preview/ de la branche main.

Usage (depuis le dossier EcoMaZgit) :
    python tools/publier_apercu.py "Lot 1"

- L'application de l'école (racine du site) n'est PAS modifiée : seul le
  dossier preview/ est remplacé, à partir de la branche design/motion-refonte.
- Le service worker de l'aperçu utilise ses propres noms de cache, pour ne
  jamais effacer ceux de l'application de l'école (même domaine).
- Un bandeau « APERÇU » est ajouté sur chaque page, et les moteurs de
  recherche sont priés de ne pas indexer ces pages.
"""
import os, subprocess, sys, tempfile, shutil

BRANCHE = 'design/motion-refonte'
FICHIERS = [
    'index.html', 'parent.html', 'portier.html', 'affichage.html', 'pointage-gps.html', 'confidentialite.html',
    'app.js', 'supabase-client.js', 'i18n.js', 'config.js', 'theme.js', 'recherche.js', 'espace-fixe.js', 'sw.js',
    'style.css', 'theme.css', 'ecomaz-tokens.css', 'ecomaz-motion.css', 'motion.js', 'icones.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
]
BANDEAU = ('<div aria-hidden="true" style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:1000;'
           'pointer-events:none;background:#e8b04b;color:#14392d;font:800 11px/1.6 system-ui,sans-serif;'
           'padding:2px 10px;border-radius:0 0 8px 8px;letter-spacing:.04em;">APERÇU — version d\'essai, '
           'pas encore en service à l\'école</div>')


def git(*args, cwd=None, binaire=False):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} a échoué :\n{r.stderr.decode('utf-8', 'replace')}")
    return r.stdout if binaire else r.stdout.decode('utf-8', 'replace')


def main():
    lot = sys.argv[1] if len(sys.argv) > 1 else 'aperçu'
    depot = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if git('status', '--porcelain', cwd=depot).strip():
        raise SystemExit("Des modifications ne sont pas enregistrées (commit) : enregistrez-les d'abord.")
    arbre = tempfile.mkdtemp(prefix='ecomaz-main-')
    shutil.rmtree(arbre)
    git('worktree', 'add', arbre, 'main', cwd=depot)
    try:
        git('pull', '--ff-only', cwd=arbre)
        cible = os.path.join(arbre, 'preview')
        shutil.rmtree(cible, ignore_errors=True)
        os.makedirs(cible)
        for f in FICHIERS:
            contenu = git('show', f'{BRANCHE}:{f}', cwd=depot, binaire=True)
            if f == 'sw.js':
                contenu = contenu.replace(b"'ecomaz-shell-", b"'ecomaz-apercu-shell-")
            elif f.endswith('.html'):
                texte = contenu.decode('utf-8')
                texte = texte.replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
                texte = texte.replace('<body>', '<body>\n' + BANDEAU, 1)
                contenu = texte.encode('utf-8')
            with open(os.path.join(cible, f), 'wb') as out:
                out.write(contenu)
        git('add', 'preview', cwd=arbre)
        if not git('status', '--porcelain', cwd=arbre).strip():
            print('Aperçu déjà à jour, rien à publier.')
            return
        version = git('rev-parse', '--short', BRANCHE, cwd=depot).strip()
        git('commit', '-m', f'Aperçu ({lot}) : branche {BRANCHE} @ {version} publiée dans /preview/',
            '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', cwd=arbre)
        git('push', 'origin', 'main', cwd=arbre)
        print('Publié : https://vehizohjunior.github.io/ecomaz-app/preview/')
    finally:
        git('worktree', 'remove', '--force', arbre, cwd=depot)


if __name__ == '__main__':
    main()
