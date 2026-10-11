"""Construit landing/index.html (page de présentation d'EcoMaZ pour les écoles).

Les icônes sont celles de tools/lucide-icons (Lucide, licence ISC), intégrées
directement dans la page : aucune dépendance en ligne.
Usage : python tools/generer_landing.py
"""
import os, re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONES = os.path.join(RACINE, 'tools', 'lucide-icons')


def ico(nom, classe='ico'):
    s = open(os.path.join(ICONES, nom + '.svg'), encoding='utf-8').read()
    inner = re.sub(r'\s*\n\s*', '', re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1))
    return (f'<svg class="{classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{inner}</svg>')


FONCTIONS = [
    ('clock', 'vert', 'Présences en temps réel', "L'appel des élèves en quelques touches, le pointage des enseignants par badge QR ou par lien GPS : la direction voit qui est là, dès le matin."),
    ('bell', 'terre', 'Parents prévenus aussitôt', "Une absence ou un retard est signalé au parent par SMS et dans sa console, sans que le secrétariat ait à téléphoner."),
    ('smartphone', 'or', 'Paiement Mobile Money', "Les familles peuvent régler la scolarité depuis leur téléphone ; chaque paiement arrive directement dans la comptabilité."),
    ('door-open', 'vert', 'Arrivées des parents signalées', "Au portail, le portier signale l'arrivée d'un parent : l'enseignant concerné est prévenu sans quitter sa classe."),
    ('chart-column', 'terre', 'Comptabilité complète', "Scolarité, salaires, dépenses, budget, rapprochement bancaire et plan SYSCOHADA, avec reçus imprimables."),
    ('calendar-days', 'or', 'Emplois du temps et programmes', "Les emplois du temps par classe et le suivi des programmes, partagés avec chaque enseignant."),
]
JOURNEE = [
    ('7h30', 'Au portail', "Les enseignants pointent leur arrivée ; le portier signale les parents qui se présentent."),
    ('9h00', "L'appel", "L'appel est fait en classe ; les parents des absents sont prévenus aussitôt."),
    ('12h00', 'La gestion', "Le secrétariat encaisse la scolarité, imprime les reçus, met à jour les fiches des élèves."),
    ('16h00', 'La sortie', "Les parents arrivent, l'enseignant est prévenu ; le soir, chacun retrouve les actualités et le tableau d'honneur."),
]
NIVEAUX = ['Garderie', 'Maternelle', 'Primaire', 'Collège', 'Lycée', 'Grande école', 'Université']
FAQ = [
    ("Faut-il installer un logiciel ?", "Non. EcoMaZ s'ouvre dans le navigateur d'un ordinateur ou d'un téléphone, et peut s'installer comme une application sur l'écran d'accueil."),
    ("Que se passe-t-il quand internet coupe ?", "L'application s'ouvre quand même et garde vos saisies sur l'appareil ; elles sont envoyées automatiquement dès que la connexion revient."),
    ("Qui voit les données de mon école ?", "Seules les personnes de votre école, chacune selon son rôle (direction, secrétariat, enseignant, parent, portier). Une autre école ne peut techniquement pas les voir."),
    ("Comment les parents se connectent-ils ?", "L'école leur envoie leur lien et leurs identifiants, ou ils se connectent avec Google ; la direction valide alors chaque demande et la relie à l'enfant."),
    # À ajouter quand le délai de mise en place sera connu :
    # ("Combien de temps faut-il pour démarrer ?", "…"),
]
# Témoignage : None tant que la direction de SUCCESS KIDS ne l'a pas donné
# (jamais de texte inventé). Format : ("La citation…", "Nom, fonction")
TEMOIGNAGE = None


def bloc_temoignage():
    if not TEMOIGNAGE:
        return ''
    from html import escape
    citation, auteur = TEMOIGNAGE
    return '''<section class="section" aria-labelledby="titre-temoignage">
  <div class="conteneur temoignage em-reveal">
    <h2 id="titre-temoignage" class="sr-only">Témoignage</h2>
    <svg class="guillemets" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 34c0-8 4-15 12-20l2 3c-4 3-6 7-6 10h6v11H8zm18 0c0-8 4-15 12-20l2 3c-4 3-6 7-6 10h6v11H26z" fill="currentColor"/></svg>
    <blockquote class="citation">''' + escape(citation) + '''</blockquote>
    <p class="auteur">''' + escape(auteur) + '''</p>
  </div>
</section>

'''


def page():
    h = []
    a = h.append
    fleche = ico('arrow-left', 'ico ico-fleche')
    a('''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EcoMaZ — Gestion scolaire de la garderie à l'université | Côte d'Ivoire</title>
<link rel="canonical" href="https://vehizohjunior.github.io/ecomaz-app/landing/">
<meta name="description" content="Présences, parents prévenus, paiement Mobile Money, comptabilité : EcoMaZ gère votre école de la garderie à l'université. Conçu à Abidjan.">
<meta property="og:type" content="website">
<meta property="og:title" content="EcoMaZ — Gestion scolaire de la garderie à l'université">
<meta property="og:description" content="Présences, parents prévenus, paiement Mobile Money, comptabilité : EcoMaZ gère votre école. Conçu à Abidjan.">
<meta property="og:url" content="https://vehizohjunior.github.io/ecomaz-app/landing/">
<meta property="og:image" content="https://vehizohjunior.github.io/ecomaz-app/landing/partage.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="EcoMaZ — gestion scolaire, de la garderie à l'université. Conçu à Abidjan.">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:locale" content="fr_FR">
<meta name="theme-color" content="#14392d">
<link rel="icon" href="../icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../ecomaz-tokens.css">
<link rel="stylesheet" href="../ecomaz-motion.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="lien-evitement" href="#contenu">Aller au contenu</a>

<header class="nav">
  <div class="conteneur nav-ligne">
    <a class="logo" href="#haut" aria-label="EcoMaZ, retour en haut"><span class="logo-e" aria-hidden="true">E</span><span class="logo-nom">EcoMaZ</span></a>
    <nav class="nav-liens" aria-label="Sections">
      <a href="#fonctionnalites">Fonctionnalités</a>
      <a href="#donnees">Vos données</a>
      <a href="#tarifs">Tarifs</a>
      <a href="#questions">Questions</a>
    </nav>
    <a class="btn-or btn-nav em-press" data-cfg-href="whatsapp" href="#contact">Demander une démo</a>
  </div>
</header>

<main id="contenu">
<section class="hero" id="haut">
  <div class="orbite" aria-hidden="true"><span class="orbite-point orbite-point--or"></span><span class="orbite-point orbite-point--terre"></span></div>
  <div class="conteneur hero-grille">
    <div class="hero-texte">
      <p class="sur-titre pilule em-rise-lg" style="animation-delay:80ms">Gestion scolaire · De la garderie à l'université</p>
      <h1 class="em-rise-lg" style="animation-delay:180ms">L'école tourne.<br>Les parents sont rassurés.<br><span class="or">Vous pilotez.</span></h1>
      <p class="hero-para em-rise-lg" style="animation-delay:300ms">Présences, messages aux familles, paiements Mobile Money, comptabilité et emplois du temps réunis dans une seule application, pensée pour les écoles de Côte d'Ivoire.</p>
      <div class="hero-boutons em-rise-lg" style="animation-delay:420ms">
        <a class="btn-or btn-grand btn-reflet em-press" data-cfg-href="whatsapp" href="#contact">Demander une démo ''' + fleche + '''</a>
        <a class="btn-contour btn-grand em-press" href="#fonctionnalites">Voir les fonctionnalités</a>
      </div>
      <p class="preuve em-rise-lg" style="animation-delay:540ms"><span class="point-vert" aria-hidden="true"></span>En service à l'école <strong data-cfg="ecolePilote">SUCCESS KIDS</strong>, Abidjan, depuis <span data-cfg="enServiceDepuis">août 2026</span></p>
    </div>
    <div class="hero-visuel" aria-hidden="true">
      <div class="telephone em-float">
        <div class="ecran">
          <div class="mini-tete"><span class="mini-logo">E</span><span>EcoMaZ Parents</span></div>
          <div class="mini-salut">Bonjour !</div>
          <div class="mini-carte">
            <div class="mini-ligne"><span class="mini-avatar">KA</span><span><b>Prénom N.</b><br><small>CP1 · Actif</small></span></div>
            <div class="mini-libelle">Présence de la semaine</div>
            <div class="mini-progression"><span class="em-fill-x" style="animation-delay:900ms"></span></div>
          </div>
          <div class="notifs">
            <div class="notif notif-1">''' + ico('clock') + '''<span><b>Début des cours · 7h30</b><small>Annonce de l'école</small></span></div>
            <div class="notif notif-2">''' + ico('wallet') + '''<span><b>Paiement reçu</b><small>Scolarité réglée par Mobile Money</small></span></div>
            <div class="notif notif-3">''' + ico('newspaper') + '''<span><b>Nouvelle actualité</b><small>Réunion des parents samedi à 8h</small></span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="bandeau" aria-label="Niveaux couverts">
  <div class="bandeau-piste">''')
    liste = ' · '.join(NIVEAUX)
    a(f'<span>{liste} · </span><span aria-hidden="true">{liste} · </span>')
    a('''</div>
</div>

<section class="section" id="fonctionnalites" aria-labelledby="titre-fonctions">
  <div class="conteneur">
    <p class="sur-titre">Tout en un</p>
    <h2 id="titre-fonctions">Ce qui prenait des heures se fait en quelques gestes.</h2>
    <div class="grille-fonctions">''')
    for nom, couleur, titre, texte in FONCTIONS:
        a(f'''
      <article class="carte-fonction em-reveal">
        <span class="pastille pastille--{couleur}">{ico(nom)}</span>
        <h3>{titre}</h3>
        <p>{texte}</p>
      </article>''')
    a('''
    </div>
  </div>
</section>

<section class="section section--douce" aria-labelledby="titre-journee">
  <div class="conteneur">
    <p class="sur-titre">Une journée avec EcoMaZ</p>
    <h2 id="titre-journee">Du portail au bulletin, chacun a son espace.</h2>
    <ol class="frise">
      <span class="frise-ligne" aria-hidden="true"></span>''')
    for heure, titre, texte in JOURNEE:
        a(f'''
      <li class="etape em-reveal"><span class="etape-point" aria-hidden="true"></span><span class="etape-heure">{heure}</span><h3>{titre}</h3><p>{texte}</p></li>''')
    a('''
    </ol>
  </div>
</section>

<section class="section" id="donnees" aria-labelledby="titre-donnees">
  <div class="conteneur">
    <div class="carte-donnees em-reveal">
      <h2 id="titre-donnees">Vos données restent les vôtres.</h2>
      <p>Chaque école est cloisonnée au niveau même de la base de données : une autre école ne peut techniquement pas voir vos élèves, vos notes ou vos comptes. EcoMaZ héberge et protège ces données pour vous, sans jamais les vendre ni les utiliser à d'autres fins.</p>
      <ul class="garanties">
        <li><span class="cadenas">''' + ico('lock') + '''</span>Cloisonnement strict entre les écoles</li>
        <li><span class="cadenas">''' + ico('lock') + '''</span>Accès personnel, selon le rôle de chacun</li>
        <li><span class="cadenas">''' + ico('lock') + '''</span>Aucune revente, aucune publicité</li>
      </ul>
    </div>
  </div>
</section>

''' + bloc_temoignage() + '''<section class="section section--douce" id="tarifs" aria-labelledby="titre-tarifs">
  <div class="conteneur">
    <p class="sur-titre">Tarifs</p>
    <h2 id="titre-tarifs">Un prix clair, sans surprise.</h2>
    <div class="grille-tarifs">
      <article class="carte-tarif em-reveal">
        <h3>Installation</h3>
        <p class="prix">600 000 <span>F CFA</span></p>
        <p class="tarif-note">Paiement unique : mise en place, paramétrage de votre école et prise en main.</p>
      </article>
      <article class="carte-tarif carte-tarif--forte em-reveal">
        <h3>Entretien technique</h3>
        <p class="prix">50 000 <span>F CFA / mois</span></p>
        <p class="tarif-note">Hébergement, sauvegardes, mises à jour et assistance.</p>
      </article>
    </div>
  </div>
</section>

<section class="section" id="questions" aria-labelledby="titre-faq">
  <div class="conteneur conteneur--etroit">
    <p class="sur-titre">Questions</p>
    <h2 id="titre-faq">Vos questions, nos réponses.</h2>
    <div class="faq">''')
    for i, (q, r) in enumerate(FAQ):
        reserve = ' espace-reserve' if r.startswith('[') else ''
        a(f'''
      <div class="faq-item">
        <h3><button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-r{i}" id="faq-q{i}">{q}{ico('chevron-down', 'ico faq-chevron')}</button></h3>
        <div class="faq-r" id="faq-r{i}" role="region" aria-labelledby="faq-q{i}"><div><p class="{reserve.strip()}">{r}</p></div></div>
      </div>''')
    a('''
    </div>
  </div>
</section>

<section class="section" id="contact" aria-labelledby="titre-contact">
  <div class="conteneur">
    <div class="appel-final em-reveal">
      <h2 id="titre-contact">Voyez EcoMaZ fonctionner dans votre école.</h2>
      <p>Une démonstration sur vos propres classes, sans engagement.</p>
      <a class="btn-vert btn-grand em-press" data-cfg-href="whatsapp" href="#">''' + ico('send') + '''Écrire sur WhatsApp</a>
    </div>
  </div>
</section>
</main>

<footer class="pied">
  <div class="conteneur pied-grille">
    <div><p class="pied-nom">EcoMaZ</p><p>Gestion scolaire conçue à <span data-cfg="ville">Abidjan, Côte d’Ivoire</span>.</p></div>
    <ul class="pied-contacts">
      <li>Téléphone : <a data-cfg-href="telephone" data-cfg="telephoneAffiche" href="#">+225 05 44 15 61 26</a></li>
      <li>WhatsApp : <a data-cfg-href="whatsapp" data-cfg="whatsappAffiche" href="#">+225 07 49 66 06 43</a></li>
      <li>E-mail : <a data-cfg-href="email" data-cfg="email" href="#">zohjunior@gmail.com</a></li>
    </ul>
  </div>
</footer>

<script src="site-config.js"></script>
<script src="../motion.min.js"></script>
<script src="script.js"></script>
</body>
</html>
''')
    return ''.join(h)


if __name__ == '__main__':
    os.makedirs(os.path.join(RACINE, 'landing'), exist_ok=True)
    with open(os.path.join(RACINE, 'landing', 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page())
    print('landing/index.html écrit')
