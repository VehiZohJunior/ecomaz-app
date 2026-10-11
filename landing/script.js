/* =========================================================================
   EcoMaZ — Page de présentation : contacts centralisés, FAQ, apparitions
   ========================================================================= */
(function(){
  const cfg = window.siteConfig || {};

  // Contacts : un seul endroit à modifier (site-config.js)
  const liens = {
    whatsapp: cfg.whatsappLien ? cfg.whatsappLien + (cfg.whatsappMessage ? '?text=' + encodeURIComponent(cfg.whatsappMessage) : '') : null,
    telephone: cfg.telephoneLien || null,
    email: cfg.email ? 'mailto:' + cfg.email : null,
  };
  document.querySelectorAll('[data-cfg-href]').forEach(a => {
    const url = liens[a.dataset.cfgHref];
    if(url){
      a.href = url;
      if(a.dataset.cfgHref === 'whatsapp'){ a.target = '_blank'; a.rel = 'noopener'; }
    }
  });
  document.querySelectorAll('[data-cfg]').forEach(el => {
    const v = cfg[el.dataset.cfg];
    if(v) el.textContent = v;
  });

  // FAQ : une seule réponse ouverte à la fois
  const items = Array.from(document.querySelectorAll('.faq-item'));
  items.forEach(item => {
    const btn = item.querySelector('.faq-q');
    btn.addEventListener('click', () => {
      const ouvrir = btn.getAttribute('aria-expanded') !== 'true';
      items.forEach(autre => {
        autre.classList.remove('ouvert');
        autre.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if(ouvrir){ item.classList.add('ouvert'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  // Apparitions au défilement : CSS animation-timeline si disponible,
  // sinon IntersectionObserver (Safari, Firefox) — via motion.js
  const M = window.EmMotion;
  if(M && !CSS.supports('animation-timeline: view()') && !M.prefersReducedMotion() && 'IntersectionObserver' in window){
    document.documentElement.classList.add('js-reveal');
    M.revealOnScroll(document);
  }
})();
