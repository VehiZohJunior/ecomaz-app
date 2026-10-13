"""Produit les documents PDF à remettre aux écoles :
  docs/EcoMaZ-Plaquette.pdf       (prospection, 2 pages)
  docs/EcoMaZ-Guide-du-personnel.pdf

Sources modifiables : docs/plaquette-source.html, docs/guide-personnel-source.html,
docs/documents.css. Les contacts viennent de landing/site-config.js, les
icônes de tools/lucide-icons (licence ISC). Rendu PDF : Microsoft Edge
(déjà installé, gratuit).
Usage : python tools/generer_documents.py
"""
import os, re, shutil, subprocess, sys, tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RACINE, 'docs')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

config = open(os.path.join(RACINE, 'landing', 'site-config.js'), encoding='utf-8').read()
def champ(nom):
    return re.search(nom + r":\s*'([^']*)'", config).group(1)
VALEURS = {'telephone': champ('telephoneAffiche'), 'whatsapp': champ('whatsappAffiche'), 'email': champ('email')}

def ico(nom):
    s = open(os.path.join(RACINE, 'tools', 'lucide-icons', nom + '.svg'), encoding='utf-8').read()
    inner = re.sub(r'\s*\n\s*', '', re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1))
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true" style="width:5mm;height:5mm;flex-shrink:0">{inner}</svg>')

def produire(source, pdf):
    html = open(os.path.join(DOCS, source), encoding='utf-8').read()
    html = re.sub(r'\{\{ico:([a-z0-9-]+)\}\}', lambda m: ico(m.group(1)), html)
    html = re.sub(r'\{\{(\w+)\}\}', lambda m: VALEURS[m.group(1)], html)
    dossier = tempfile.mkdtemp()
    shutil.copy(os.path.join(DOCS, 'documents.css'), dossier)
    page = os.path.join(dossier, 'document.html')
    open(page, 'w', encoding='utf-8').write(html)
    sortie = os.path.join(DOCS, pdf)
    url = 'file:///' + page.replace('\\', '/')
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000',
                    f'--print-to-pdf={sortie}', url], check=True, capture_output=True)
    if APERCU:  # image de relecture (une longue capture de toutes les pages)
        image = os.path.join(APERCU, pdf.replace('.pdf', '.png'))
        subprocess.run([EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000',
                        '--window-size=794,3400', f'--screenshot={image}', url], check=True, capture_output=True)
    shutil.rmtree(dossier, ignore_errors=True)
    print(pdf, os.path.getsize(sortie), 'octets')

# « python tools/generer_documents.py --apercu DOSSIER » : ajoute des captures PNG pour relire
APERCU = sys.argv[sys.argv.index('--apercu') + 1] if '--apercu' in sys.argv else None
produire('plaquette-source.html', 'EcoMaZ-Plaquette.pdf')
produire('guide-personnel-source.html', 'EcoMaZ-Guide-du-personnel.pdf')
produire('prise-en-main-source.html', 'EcoMaZ-Prise-en-main.pdf')
