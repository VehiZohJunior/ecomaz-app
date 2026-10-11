/* =========================================================================
   EcoMaZ — Applications dédiées Parent / Portier
   Chargé par parent.html et portier.html AVANT app.js. Identifie l'école
   (paramètre ?ecole=, sinon dernière école utilisée sur cet appareil), puis
   nomme l'application « EcoMaZ-<nom de l'école> » : titre de la page, nom sous
   l'icône (manifeste généré à la volée) et écran de connexion.
   ========================================================================= */
(function(){
  const espace = window.ESPACE_FIXE; // 'parent' | 'portier'
  // Le portier travaille toujours en thème sombre dédié, dès l'écran de connexion
  if(espace === 'portier' && document.body) document.body.classList.add('theme-portier');
  const page = espace + '.html';
  const base = new URL('./', window.location.href);
  const abs = (f) => new URL(f, base).href;
  const params = new URLSearchParams(window.location.search);
  let ecoleId = params.get('ecole');
  try{
    if(ecoleId) localStorage.setItem('ecomaz_ecole_' + espace, ecoleId);
    else ecoleId = localStorage.getItem('ecomaz_ecole_' + espace);
  }catch(_e){}

  function appliquerNom(nom){
    const titre = espace === 'parent' ? "EcoMaZ-PARENTS D'ELEVES " + nom : 'EcoMaZ-PORTIER ' + nom;
    document.title = titre;
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(m) m.setAttribute('content', titre);
    const manifest = {
      id: abs(page) + '?ecole=' + ecoleId,
      name: titre,
      short_name: titre,
      description: espace === 'parent' ? 'Espace parents — ' + nom : 'Espace portier — ' + nom,
      start_url: abs(page) + '?ecole=' + encodeURIComponent(ecoleId),
      scope: base.href,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#4f5fea',
      orientation: 'portrait-primary',
      icons: [
        { src: abs('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    let link = document.querySelector('link[rel="manifest"]');
    if(!link){ link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    link.href = url;
  }

  window.ESPACE_FIXE_PRET = (async function(){
    if(!ecoleId) return;
    try{
      const { data } = await sb.from('ecoles_vitrine').select('id,nom_ecole,logo_url').eq('id', ecoleId).maybeSingle();
      if(data){
        window.ECOLE_VITRINE = data;
        appliquerNom(data.nom_ecole);
      }
    }catch(_e){ /* hors ligne : titre générique */ }
  })();
})();
