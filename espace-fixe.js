/* =========================================================================
   EcoMaZ — Applications dédiées Parent / Portier
   Chargé par parent.html et portier.html AVANT app.js. Identifie l'école
   (paramètre ?ecole=, sinon dernière école utilisée sur cet appareil), puis
   nomme l'application « EcoMaZ-<nom de l'école> » : titre de la page et écran
   de connexion. Le nom sous l'icône vient du manifeste servi par la fonction
   serveur « manifeste-application » (lien posé dans l'en-tête de la page).
   ========================================================================= */
(function(){
  const espace = window.ESPACE_FIXE; // 'parent' | 'portier' | 'enseignant'
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
    const titre = espace === 'parent' ? "EcoMaZ-PARENTS D'ELEVES " + nom : espace === 'enseignant' ? 'EcoMaZ-ENSEIGNANTS ' + nom : 'EcoMaZ-PORTIER ' + nom;
    document.title = titre;
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(m) m.setAttribute('content', titre);
  }

  window.ESPACE_FIXE_PRET = (async function(){
    if(!ecoleId) return;
    try{
      const { data: lignes } = await sb.rpc('ecole_vitrine', { p_ecole: ecoleId });
      const data = lignes && lignes[0];
      if(data){
        window.ECOLE_VITRINE = data;
        appliquerNom(data.nom_ecole);
      }
    }catch(_e){ /* hors ligne : titre générique */ }
  })();
})();
