/* =========================================================================
   EcoMaZ — Landing "Console Parent" — vanilla JS, aucune dépendance.
   ========================================================================= */
(function(){
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
     Icônes SVG réutilisables (texte, aucune image externe)
     ---------------------------------------------------------------------- */
  function iconBell(color){
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  }
  function iconPay(color){
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 7h6"/><path d="M12 15h.01"/></svg>';
  }
  function iconChat(color){
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  }
  function iconTrophy(color){
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4a2 2 0 0 0 2 4M17 5h3a2 2 0 0 1-2 4"/></svg>';
  }
  function iconNews(color){
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16M4 11v8a1 1 0 0 0 1 1h11l4-4v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M8 15h6"/></svg>';
  }
  function iconPerson(color){
    return '<svg width="100%" height="100%" viewBox="0 0 80 80" aria-hidden="true">'
      + '<circle cx="40" cy="40" r="38" fill="'+color+'1a"/>'
      + '<circle cx="40" cy="32" r="13" fill="'+color+'"/>'
      + '<path d="M16 66c2-14 12-22 24-22s22 8 24 22" fill="'+color+'"/>'
      + '</svg>';
  }

  /* ----------------------------------------------------------------------
     Menu mobile
     ---------------------------------------------------------------------- */
  var menuToggle = document.getElementById('menuToggle');
  var mobileNav = document.getElementById('mobileNav');
  if(menuToggle && mobileNav){
    menuToggle.addEventListener('click', function(){
      var open = mobileNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    mobileNav.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        mobileNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ----------------------------------------------------------------------
     Apparition au scroll (IntersectionObserver) — appelable plusieurs fois :
     le tableau d'honneur est injecté dynamiquement APRÈS cette mise en
     place initiale, donc on la relance pour tout nouveau ".reveal" trouvé
     dans le DOM (sinon ces éléments resteraient invisibles pour toujours).
     ---------------------------------------------------------------------- */
  var io = null;
  if('IntersectionObserver' in window && !reduceMotion){
    io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  }
  function observeReveals(){
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(function(el){
      if(io) io.observe(el); else el.classList.add('is-visible');
    });
  }
  observeReveals();

  /* ----------------------------------------------------------------------
     Maquette téléphone — HERO : boucle décorative courte (alerte → paiement
     → actualité), non interactive, purement illustrative (aria-hidden).
     ---------------------------------------------------------------------- */
  function buildHeroPhone(container){
    if(!container) return;
    container.innerHTML =
      '<div class="phone" aria-hidden="true">'
        + '<div class="phone-screen">'
          + '<div class="phone-topbar"><span>9:41</span><span>●●●</span></div>'
          + '<div class="phone-app-head"><span class="logo-dot"></span> Espace Parent</div>'
          + '<div class="phone-body" id="heroPhoneBody"></div>'
        + '</div>'
      + '</div>';
    var body = container.querySelector('#heroPhoneBody');
    var states = [
      { cls:'demo-alert-card', html:
          '<div class="ic">'+iconBell('var(--coral)')+'</div>'
          + '<div><strong>Absence signalée</strong><span>Votre enfant est noté absent aujourd\'hui.</span></div>' },
      { cls:'demo-pay-card', html:
          '<div class="ic" style="width:40px;height:40px;background:var(--green-bg);margin:0 auto 8px;">'+iconPay('var(--green)')+'</div>'
          + '<div class="demo-pay-amount" style="font-size:19px;">Paiement confirmé</div>'
          + '<svg class="demo-pay-check is-active" viewBox="0 0 48 48" aria-hidden="true" style="width:46px;height:46px;"><circle cx="24" cy="24" r="20"/><path d="M15 24l6 6 12-13"/></svg>' },
      { cls:'', html:
          '<div class="demo-news-strip"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--sun);display:inline-block;"></span>Journée culturelle — vendredi, cour principale</div>'
          + '<div class="demo-news-strip" style="margin-top:10px;"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--sun);display:inline-block;"></span>Réunion de parents — [à compléter]</div>' }
    ];
    states.forEach(function(s, i){
      var panel = document.createElement('div');
      panel.className = 'phone-panel' + (i===0 ? ' is-active' : '');
      panel.innerHTML = '<div class="'+s.cls+'">' + s.html + '</div>';
      body.appendChild(panel);
    });

    if(reduceMotion) return;
    var panels = body.querySelectorAll('.phone-panel');
    var idx = 0;
    setInterval(function(){
      panels[idx].classList.remove('is-active');
      idx = (idx + 1) % panels.length;
      panels[idx].classList.add('is-active');
    }, 3200);
  }

  /* ----------------------------------------------------------------------
     Maquette téléphone — DÉMONSTRATION : 5 onglets accessibles (tablist),
     une vue par fonction, avance automatique qui respecte le survol, le
     focus et prefers-reduced-motion.
     ---------------------------------------------------------------------- */
  var DEMO_TABS = [
    { id:'absence', label:'Alerte', icon:iconBell, color:'var(--coral)' },
    { id:'paiement', label:'Paiement', icon:iconPay, color:'var(--green)' },
    { id:'messages', label:'Messages', icon:iconChat, color:'var(--purple)' },
    { id:'honneur', label:'Honneur', icon:iconTrophy, color:'var(--sun)' },
    { id:'actus', label:'Actualités', icon:iconNews, color:'var(--primary)' }
  ];
  function demoPanelMarkup(id){
    switch(id){
      case 'absence':
        return '<div class="demo-alert-card">'
          + '<div class="ic">'+iconBell('var(--coral)')+'</div>'
          + '<div><strong>Absence signalée</strong><span>Votre enfant est noté absent aujourd\'hui. Contactez l\'école pour toute justification.</span></div>'
          + '</div>';
      case 'paiement':
        return '<div class="demo-pay-card">'
          + '<div class="ic" style="width:40px;height:40px;background:var(--green-bg);margin:0 auto 8px;">'+iconPay('var(--green)')+'</div>'
          + '<div class="demo-pay-amount">Scolarité — Tranche 2</div>'
          + '<button class="demo-pay-btn" type="button" tabindex="-1" aria-hidden="true">Payer avec Mobile Money</button>'
          + '<svg class="demo-pay-check" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><path d="M15 24l6 6 12-13"/></svg>'
          + '</div>';
      case 'messages':
        return '<div class="demo-msg from-ecole unread"><b>Secrétariat</b>N\'oubliez pas le certificat médical avant vendredi.</div>'
          + '<div class="demo-msg from-ecole"><b>Direction</b>Merci pour votre participation à la journée culturelle !</div>'
          + '<div class="demo-msg" style="border-left:4px solid var(--sun);"><b style="color:var(--amber);">Votre suggestion</b>Bien reçue, merci.</div>';
      case 'honneur':
        return '<div class="demo-honor-card">'
          + '<div class="demo-honor-avatar">'+iconPerson('#4f5fea')+'</div>'
          + '<div class="demo-honor-label">Élève du mois</div>'
          + '<strong style="font-family:var(--font-display);display:block;margin-top:4px;">Prénom</strong>'
          + '</div>';
      case 'actus':
        return '<div class="demo-news-strip"><span style="width:7px;height:7px;border-radius:50%;background:var(--sun);display:inline-block;"></span>Journée culturelle — vendredi</div>'
          + '<div class="demo-news-strip" style="margin-top:10px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--sun);display:inline-block;"></span>Sortie pédagogique — [à compléter]</div>'
          + '<div class="demo-news-strip" style="margin-top:10px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--sun);display:inline-block;"></span>Réunion de parents — [à compléter]</div>';
      default: return '';
    }
  }
  function buildDemoPhone(container){
    if(!container) return;
    var tabsHtml = DEMO_TABS.map(function(t, i){
      return '<button type="button" class="phone-tab" role="tab" id="tab-'+t.id+'" aria-controls="panel-'+t.id+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?'0':'-1')+'" data-id="'+t.id+'" title="'+t.label+'">'
        + t.icon(i===0 ? '#fff' : 'var(--ink-soft)') + '<span class="visually-hidden">'+t.label+'</span></button>';
    }).join('');
    var panelsHtml = DEMO_TABS.map(function(t, i){
      return '<div class="phone-panel'+(i===0?' is-active':'')+'" role="tabpanel" id="panel-'+t.id+'" aria-labelledby="tab-'+t.id+'" hidden="'+(i!==0)+'">'+demoPanelMarkup(t.id)+'</div>';
    }).join('');

    container.innerHTML =
      '<div>'
        + '<div class="phone">'
          + '<div class="phone-screen">'
            + '<div class="phone-topbar"><span>9:41</span><span>●●●</span></div>'
            + '<div class="phone-app-head"><span class="logo-dot"></span> Espace Parent</div>'
            + '<div class="phone-body">'+panelsHtml+'</div>'
            + '<div class="phone-tabs" role="tablist" aria-label="Fonctions de la Console Parent">'+tabsHtml+'</div>'
          + '</div>'
        + '</div>'
        + '<div class="demo-caption"><div class="tab-label" id="demoCaptionLabel">Alerte d\'absence</div><p id="demoCaptionText" style="margin:0;font-size:13.5px;color:var(--ink-soft);">Vous êtes prévenu automatiquement si votre enfant est absent.</p></div>'
      + '</div>';

    var captions = {
      absence:{ label:'Alerte d\'absence', text:'Vous êtes prévenu automatiquement si votre enfant est absent.' },
      paiement:{ label:'Paiement Mobile Money', text:'Réglez les frais de scolarité depuis votre téléphone.' },
      messages:{ label:'Messagerie & suggestions', text:'Échangez avec l\'école et proposez vos idées.' },
      honneur:{ label:'Tableau d\'honneur', text:'Les élèves et enseignant(e)s mis à l\'honneur par l\'école.' },
      actus:{ label:'Actualités de l\'école', text:'Les événements et informations importantes.' }
    };

    var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(container.querySelectorAll('[role="tabpanel"]'));
    var labelEl = container.querySelector('#demoCaptionLabel');
    var textEl = container.querySelector('#demoCaptionText');
    var activeIdx = 0;
    var timer = null;

    function activate(i, moveFocus){
      tabs[activeIdx].setAttribute('aria-selected','false');
      tabs[activeIdx].setAttribute('tabindex','-1');
      tabs[activeIdx].innerHTML = DEMO_TABS[activeIdx].icon('var(--ink-soft)') + '<span class="visually-hidden">'+DEMO_TABS[activeIdx].label+'</span>';
      panels[activeIdx].classList.remove('is-active');
      panels[activeIdx].setAttribute('hidden','');

      activeIdx = i;
      tabs[activeIdx].setAttribute('aria-selected','true');
      tabs[activeIdx].setAttribute('tabindex','0');
      tabs[activeIdx].innerHTML = DEMO_TABS[activeIdx].icon('#fff') + '<span class="visually-hidden">'+DEMO_TABS[activeIdx].label+'</span>';
      panels[activeIdx].classList.add('is-active');
      panels[activeIdx].removeAttribute('hidden');
      var c = captions[DEMO_TABS[activeIdx].id];
      labelEl.textContent = c.label;
      textEl.textContent = c.text;
      if(moveFocus) tabs[activeIdx].focus();
    }

    tabs.forEach(function(tab, i){
      tab.addEventListener('click', function(){ activate(i, false); restartAuto(); });
      tab.addEventListener('keydown', function(e){
        var next = null;
        if(e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if(e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if(e.key === 'Home') next = 0;
        else if(e.key === 'End') next = tabs.length - 1;
        if(next !== null){ e.preventDefault(); activate(next, true); restartAuto(); }
      });
    });

    function startAuto(){
      if(reduceMotion) return;
      timer = setInterval(function(){ activate((activeIdx + 1) % tabs.length, false); }, 4200);
    }
    function stopAuto(){ if(timer){ clearInterval(timer); timer = null; } }
    function restartAuto(){ stopAuto(); startAuto(); }

    container.addEventListener('mouseenter', stopAuto);
    container.addEventListener('mouseleave', startAuto);
    container.addEventListener('focusin', stopAuto);
    container.addEventListener('focusout', startAuto);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) stopAuto(); else startAuto();
    });

    startAuto();
  }

  buildHeroPhone(document.getElementById('phoneDemo'));
  buildDemoPhone(document.getElementById('phoneDemoMain'));

  /* ----------------------------------------------------------------------
     Tableau d'honneur — cartes génériques retournables (clic + clavier)
     ---------------------------------------------------------------------- */
  var HONOR_PERIODES = [
    { id:'mois', label:'Du mois' },
    { id:'trimestre', label:'Du trimestre' },
    { id:'annee', label:"De l'année" }
  ];
  function buildHonorGrid(container, categoryLabel, color){
    if(!container) return;
    container.innerHTML = HONOR_PERIODES.map(function(p, i){
      return '<div class="honor-card reveal" style="--i:'+i+';">'
        + '<button type="button" aria-pressed="false" aria-label="'+categoryLabel+' '+p.label.toLowerCase()+' — touchez pour retourner la carte">'
          + '<div class="honor-flip">'
            + '<div class="honor-face honor-face-front">'
              + '<div style="width:64px;height:64px;">'+iconPerson(color)+'</div>'
              + '<strong style="font-family:var(--font-display);margin-top:10px;">'+categoryLabel+'</strong>'
              + '<span class="period">'+p.label+'</span>'
            + '</div>'
            + '<div class="honor-face honor-face-back">'
              + '<svg class="confetti" viewBox="0 0 100 100" aria-hidden="true">'
                + '<circle cx="15" cy="20" r="3" fill="#fff"/><circle cx="80" cy="15" r="2" fill="#fff"/>'
                + '<circle cx="90" cy="70" r="3" fill="#fff"/><circle cx="20" cy="85" r="2" fill="#fff"/>'
                + '<circle cx="50" cy="10" r="2" fill="#fff"/><circle cx="60" cy="90" r="2.5" fill="#fff"/>'
              + '</svg>'
              + '<span>'+categoryLabel+' — '+p.label.toLowerCase()+'</span>'
              + '<strong>Prénom</strong>'
              + '<span style="font-size:12px;">Classe / matière : [à compléter plus tard]</span>'
            + '</div>'
          + '</div>'
        + '</button>'
      + '</div>';
    }).join('');

    container.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        var pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
      });
    });
  }
  buildHonorGrid(document.getElementById('honorGridEleve'), 'Élève', '#4f5fea');
  buildHonorGrid(document.getElementById('honorGridEnseignant'), 'Enseignant(e)', '#8b5cf6');
  observeReveals();

  /* ----------------------------------------------------------------------
     Bannière d'actualités — défilement continu, exemples fictifs
     ---------------------------------------------------------------------- */
  var NEWS_ITEMS = [
    'Journée culturelle — vendredi, cour principale',
    'Sortie pédagogique — [à compléter plus tard]',
    'Réunion de parents — [à compléter plus tard]',
    'Rentrée des classes — [à compléter plus tard]'
  ];
  function buildNewsTrack(container){
    if(!container) return;
    function itemHtml(t){ return '<span class="news-item"><span class="dot"></span>'+t+'</span>'; }
    var list = NEWS_ITEMS.map(itemHtml).join('');
    // dupliqué pour un défilement sans coupure (keyframes à -50%)
    container.innerHTML = list + list;
  }
  buildNewsTrack(document.getElementById('newsTrack'));

})();
