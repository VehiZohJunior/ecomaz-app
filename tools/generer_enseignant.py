"""Construit enseignant.html (application « EcoMaZ-ENSEIGNANTS <école> ») à
partir de index.html : même écran que le personnel, mais réservé au rôle
enseignant, avec inscription par Google (l'enseignant coche ses classes,
la direction valide). À relancer après chaque modification de index.html.
Usage : python tools/generer_enseignant.py
"""
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(RACINE, 'index.html'), encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
s = s.replace('\r\n', '\n')

def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

rep('<title id="pageTitle">EcoMaZ — Gestion Scolaire</title>', '<title id="pageTitle">EcoMaZ — Espace Enseignant</title>')
rep('<link rel="manifest" href="manifest.json">', """<script>
  // Manifeste d'installation servi par le serveur, au nom de l'école
  (function(){
    var e = new URLSearchParams(location.search).get('ecole');
    try{ if(e) localStorage.setItem('ecomaz_ecole_enseignant', e); else e = localStorage.getItem('ecomaz_ecole_enseignant'); }catch(_){}
    var l = document.createElement('link'); l.rel = 'manifest';
    l.href = 'https://hvqtsvpkxffseclsfoun.supabase.co/functions/v1/manifeste-application?espace=enseignant' + (e ? '&ecole=' + encodeURIComponent(e) : '');
    document.head.appendChild(l);
  })();
</script>""")
rep('<script src="supabase-client.js"></script>\n<script src="motion.min.js"></script>',
    "<script src=\"supabase-client.js\"></script>\n<script>window.ESPACE_FIXE='enseignant';</script>\n<script src=\"espace-fixe.min.js\"></script>\n<script src=\"motion.min.js\"></script>")
rep('<html lang="fr">', '<html lang="fr">\n<!-- Généré par tools/generer_enseignant.py à partir de index.html : ne pas modifier à la main -->')
open(os.path.join(RACINE, 'enseignant.html'), 'w', encoding='utf-8', newline='').write(s.replace('\n', nl))
print('enseignant.html écrit')
