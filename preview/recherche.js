/* =========================================================================
   EcoMaZ — Recherche globale (Ctrl+K / ⌘K, ou bouton 🔍 de la barre du haut)
   Cherche dans les pages du menu, les élèves et les enseignants DÉJÀ chargés
   dans l'appli : aucune nouvelle requête, aucune nouvelle donnée exposée.
   Chaque profil ne trouve que ce qu'il a le droit d'ouvrir (hasAccess()).
   Ouvrir un résultat utilise la navigation d'origine (go / viewEleveProfile).
   ========================================================================= */
(function(){
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MAX = 6;
  let ouverte = false, resultats = [], index = 0, precedent = null;

  function roleStaff(){
    try{ return ['enseignant','secretariat','direction','fondation'].includes(ui.role) && typeof DB !== 'undefined' && DB; }catch(_e){ return false; }
  }

  /* ---- Construction de l'index de recherche ---- */
  function pagesDisponibles(){
    return [...document.querySelectorAll('#nav [data-view]')].filter(b => b.style.display !== 'none').map(b => {
      const ic = b.querySelector('.ic');
      return { type:'page', icone: ic ? ic.textContent : '📄', iconeHtml: ic ? ic.innerHTML : '', titre: b.textContent.replace(ic ? ic.textContent : '', '').trim(), sous:'', cle: norm(b.textContent), vue: b.dataset.view };
    });
  }
  function elevesDisponibles(){
    if(!hasAccess('eleves')) return [];
    return (DB.eleves || []).map(e => ({
      type:'eleve', icone:'🧒', titre: `${e.prenom || ''} ${e.nom || ''}`.trim(),
      sous: [e.matricule, classeName(e.classeId), e.statut && e.statut !== 'Actif' ? e.statut : ''].filter(x => x && x !== '—').join(' · '),
      cle: norm(`${e.prenom} ${e.nom} ${e.nom} ${e.prenom} ${e.matricule || ''} ${classeName(e.classeId)}`), id: e.id,
    }));
  }
  function enseignantsDisponibles(){
    if(!hasAccess('enseignants')) return [];
    return (DB.enseignants || []).map(t => ({
      type:'enseignant', icone:'👩‍🏫', titre: `${t.prenom || ''} ${t.nom || ''}`.trim(),
      sous: (t.matieres || []).join(', '), cle: norm(`${t.prenom} ${t.nom} ${t.nom} ${t.prenom} ${(t.matieres || []).join(' ')}`),
    }));
  }

  function chercher(q){
    const mots = norm(q).split(/\s+/).filter(Boolean);
    const filtre = (liste) => mots.length ? liste.filter(x => mots.every(m => x.cle.includes(m))) : liste;
    const pages = filtre(pagesDisponibles());
    const eleves = mots.length ? filtre(elevesDisponibles()) : [];
    const profs = mots.length ? filtre(enseignantsDisponibles()) : [];
    const groupes = [];
    if(pages.length) groupes.push({ nom: mots.length ? 'Pages' : 'Aller à…', items: pages.slice(0, mots.length ? MAX : 20) });
    if(eleves.length) groupes.push({ nom: 'Élèves' + (eleves.length > MAX ? ` (${eleves.length} résultats, affinez)` : ''), items: eleves.slice(0, MAX) });
    if(profs.length) groupes.push({ nom: 'Enseignants' + (profs.length > MAX ? ` (${profs.length} résultats, affinez)` : ''), items: profs.slice(0, MAX) });
    return groupes;
  }

  /* ---- Affichage ---- */
  function racine(){
    let r = document.getElementById('rechercheGlobale');
    if(r) return r;
    r = document.createElement('div');
    r.id = 'rechercheGlobale';
    r.className = 'rg-backdrop';
    r.innerHTML = `
      <div class="rg-box" role="dialog" aria-modal="true" aria-label="Recherche">
        <div class="rg-champ">
          <span aria-hidden="true" class="rg-loupe">${window.EmIcones ? EmIcones.svg('search') : '🔍'}</span>
          <input id="rgInput" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Rechercher un élève, un enseignant, une page…"
                 role="combobox" aria-expanded="true" aria-controls="rgListe" aria-autocomplete="list" aria-label="Rechercher">
          <button type="button" class="rg-fermer" aria-label="Fermer la recherche">Échap</button>
        </div>
        <div id="rgListe" class="rg-liste" role="listbox" aria-label="Résultats"></div>
        <div class="rg-aide" aria-hidden="true"><span>↑↓ pour choisir</span><span>Entrée pour ouvrir</span></div>
      </div>`;
    document.body.appendChild(r);
    r.addEventListener('mousedown', e => { if(e.target === r) fermer(); });
    r.querySelector('.rg-fermer').addEventListener('click', fermer);
    const input = r.querySelector('#rgInput');
    input.addEventListener('input', () => { index = 0; rendre(); });
    input.addEventListener('keydown', e => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); deplacer(1); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); deplacer(-1); }
      else if(e.key === 'Enter'){ e.preventDefault(); choisir(index); }
      else if(e.key === 'Escape'){ e.preventDefault(); fermer(); }
      else if(e.key === 'Tab'){ e.preventDefault(); }
    });
    r.querySelector('#rgListe').addEventListener('click', e => {
      const it = e.target.closest('[data-i]'); if(it) choisir(parseInt(it.dataset.i, 10));
    });
    r.querySelector('#rgListe').addEventListener('mousemove', e => {
      const it = e.target.closest('[data-i]'); if(it && parseInt(it.dataset.i, 10) !== index){ index = parseInt(it.dataset.i, 10); marquer(); }
    });
    return r;
  }

  function rendre(){
    const input = document.getElementById('rgInput');
    const groupes = chercher(input.value);
    resultats = [];
    let html = '';
    groupes.forEach(g => {
      html += `<div class="rg-groupe" role="presentation">${esc(g.nom)}</div>`;
      g.items.forEach(it => {
        const i = resultats.push(it) - 1;
        html += `<div class="rg-item" role="option" id="rg-o${i}" data-i="${i}" aria-selected="false">
          <span class="rg-ic" aria-hidden="true">${it.iconeHtml || esc(it.icone)}</span>
          <span class="rg-txt"><span class="rg-titre">${esc(it.titre)}</span>${it.sous ? `<span class="rg-sous">${esc(it.sous)}</span>` : ''}</span>
        </div>`;
      });
    });
    if(!resultats.length) html = `<div class="rg-vide">Aucun résultat pour « ${esc(input.value)} ».<br><span>Essayez un autre nom, un matricule ou une classe.</span></div>`;
    document.getElementById('rgListe').innerHTML = html;
    if(index >= resultats.length) index = 0;
    marquer();
  }
  function marquer(){
    const input = document.getElementById('rgInput');
    document.querySelectorAll('#rgListe .rg-item').forEach(el => {
      const actif = parseInt(el.dataset.i, 10) === index;
      el.classList.toggle('actif', actif);
      el.setAttribute('aria-selected', actif ? 'true' : 'false');
      if(actif){ input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block:'nearest' }); }
    });
  }
  function deplacer(d){
    if(!resultats.length) return;
    index = (index + d + resultats.length) % resultats.length;
    marquer();
  }

  /* ---- Actions ---- */
  function choisir(i){
    const it = resultats[i];
    if(!it) return;
    fermer();
    if(it.type === 'page'){ const b = document.querySelector(`#nav [data-view="${it.vue}"]`); if(b) b.click(); }
    else if(it.type === 'eleve'){ go('eleves'); viewEleveProfile(it.id); }
    else if(it.type === 'enseignant'){ go('enseignants'); }
  }
  function ouvrir(){
    if(!roleStaff()) return;
    const r = racine();
    precedent = document.activeElement;
    ouverte = true;
    r.classList.add('open');
    const input = r.querySelector('#rgInput');
    input.value = '';
    index = 0;
    rendre();
    setTimeout(() => input.focus(), 20);
  }
  function fermer(){
    if(!ouverte) return;
    ouverte = false;
    const r = document.getElementById('rechercheGlobale');
    if(r) r.classList.remove('open');
    if(precedent && precedent.focus){ try{ precedent.focus({ preventScroll:true }); }catch(_e){} }
  }

  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')){
      if(!roleStaff()) return;
      e.preventDefault();
      ouverte ? fermer() : ouvrir();
    } else if(e.key === 'Escape' && ouverte){ e.preventDefault(); e.stopPropagation(); fermer(); }
  }, true);

  /* ---- Bouton 🔍 dans la barre du haut (visible seulement pour le personnel) ---- */
  function installerBouton(){
    const barre = document.querySelector('.topbar-right');
    if(!barre || document.getElementById('btnRechercheGlobale')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'btnRechercheGlobale'; b.className = 'theme-toggle';
    b.textContent = '🔍';
    b.setAttribute('aria-label', 'Rechercher (Ctrl+K)'); b.title = 'Rechercher (Ctrl+K)';
    b.addEventListener('click', ouvrir);
    barre.insertBefore(b, barre.firstChild);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installerBouton); else installerBouton();
})();
