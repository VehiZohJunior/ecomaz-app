/* =====================================================================
   PERSONNES CONNECTÉES + MESSAGES ENTRE COLLÈGUES (26/11/2026)
   Demande de Vehi Zoh Junior : « comme sur Messenger ».
   - Barre du haut : bouton 👥 avec le nombre de personnes connectées
     et une pastille rouge s'il y a des messages non lus.
   - Liste dépliable : voyant VERT = connecté, voyant GRIS = pas connecté
     (« vu il y a 12 min »). Un clic sur un nom ouvre la discussion.
   - Personnel seulement (direction, fondation, secrétariat, enseignants) ;
     règles côté serveur : schema.sql section 129.
   Présence : un signal « je suis là » par minute tant que l'application
   est à l'écran ; connecté = signal de moins de 2 minutes.
   ===================================================================== */
const PC_ROLES = ['direction', 'fondation', 'secretariat', 'enseignant'];
const pc = { liste: [], timer: null, convAvec: null, convTimer: null, ouvert: false, horsLigneOuvert: false, dernierNonLus: null, envoiEnCours: false };

function pcActif(){ return PC_ROLES.includes(ui.role) && !!session.userId; }

function demarrerPersonnesConnectees(){
  arreterPersonnesConnectees(true);
  if(!pcActif()) return;
  pcInstallerBouton();
  pcBattement();
  pc.timer = setInterval(pcBattement, 45000);
}
function arreterPersonnesConnectees(silencieux){
  clearInterval(pc.timer); pc.timer = null;
  clearInterval(pc.convTimer); pc.convTimer = null;
  pc.liste = []; pc.convAvec = null; pc.ouvert = false; pc.dernierNonLus = null;
  document.body.classList.remove('pc-ouvert');
  if(!silencieux){ try{ sb.rpc('quitter_presence'); }catch(_e){} }
  const w = document.getElementById('pcWrap'); if(w) w.remove();
}
// Retour à l'écran : signal immédiat (le voyant repasse au vert sans attendre)
document.addEventListener('visibilitychange', () => { if(!document.hidden && pc.timer) pcBattement(); });

async function pcBattement(){
  if(!pcActif() || document.hidden) return;
  try{
    await sb.rpc('signaler_presence');
    const { data, error } = await sb.rpc('personnel_connecte');
    if(error) throw error;
    pc.liste = data || [];
    const nonLus = pc.liste.reduce((s, p) => s + (p.non_lus || 0), 0);
    if(pc.dernierNonLus !== null && nonLus > pc.dernierNonLus){
      const de = pc.liste.find(p => p.non_lus > 0 && p.id !== pc.convAvec);
      if(de) toast(`💬 Nouveau message de ${de.nom}`);
    }
    pc.dernierNonLus = nonLus;
    pcMajBouton();
    if(pc.ouvert) pcMajPanneau();
  }catch(_e){ /* réseau : on réessaiera au prochain battement */ }
}

function pcInstallerBouton(){
  if(document.getElementById('pcWrap')) return;
  const droite = document.querySelector('.topbar-right'); if(!droite) return;
  const w = document.createElement('div');
  w.className = 'pc-wrap'; w.id = 'pcWrap';
  w.innerHTML = `<button type="button" class="bulle-btn pc-btn" id="pcBtn" onclick="pcBasculer()" aria-haspopup="dialog" aria-expanded="false" title="Personnes connectées">
      <span aria-hidden="true">👥</span><span class="pc-compte" id="pcCompte" hidden></span><span class="bulle-badge" id="pcNonLus" hidden></span></button>
    <div class="pc-panneau" id="pcPanneau" role="dialog" aria-label="Personnes connectées" hidden></div>`;
  droite.insertBefore(w, droite.firstChild);
}

function pcMajBouton(){
  const enLigne = pc.liste.filter(p => p.en_ligne).length;
  const nonLus = pc.liste.reduce((s, p) => s + (p.non_lus || 0), 0);
  const c = document.getElementById('pcCompte'), b = document.getElementById('pcNonLus'), btn = document.getElementById('pcBtn');
  if(c){ c.hidden = !enLigne; c.textContent = enLigne; }
  if(b){ b.hidden = !nonLus; b.textContent = nonLus > 9 ? '9+' : nonLus; }
  if(btn) btn.setAttribute('aria-label', `Personnes connectées : ${enLigne}${nonLus ? `, ${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}` : ''}`);
}

function pcBasculer(ouvrir){
  const p = document.getElementById('pcPanneau'); if(!p) return;
  pc.ouvert = ouvrir === undefined ? p.hidden : !!ouvrir;
  p.hidden = !pc.ouvert;
  document.body.classList.toggle('pc-ouvert', pc.ouvert);
  const btn = document.getElementById('pcBtn'); if(btn) btn.setAttribute('aria-expanded', String(pc.ouvert));
  if(pc.ouvert){ pcMajPanneau(); pcBattement(); }
}
document.addEventListener('click', e => {
  if(!pc.ouvert) return;
  const w = document.getElementById('pcWrap');
  if(w && !w.contains(e.target)) pcBasculer(false);
});

function pcVuIlYa(iso){
  if(!iso) return 'pas encore connecté(e)';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if(min < 60) return `vu(e) il y a ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if(h < 24) return `vu(e) il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'vu(e) hier' : `vu(e) il y a ${j} jours`;
}
function pcInitiales(nom){ return String(nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join(''); }
function pcFonction(role){ return (ROLES[role] && ROLES[role].label) || role; }

function pcLigne(p){
  return `<li><button type="button" class="pc-personne" onclick="pcOuvrirDiscussion('${p.id}')">
      <span class="pc-avatar" aria-hidden="true">${escapeHtml(pcInitiales(p.nom))}<span class="pc-voyant ${p.en_ligne ? 'vert' : 'gris'}"></span></span>
      <span class="pc-txt"><strong>${escapeHtml(p.nom)}</strong><small>${escapeHtml(pcFonction(p.role))} · ${p.en_ligne ? '<span class="pc-en-ligne">connecté(e)</span>' : pcVuIlYa(p.vu_le)}</small></span>
      ${p.non_lus ? `<span class="pc-nl" aria-label="${p.non_lus} non lu(s)">${p.non_lus}</span>` : ''}
    </button></li>`;
}

function pcMajPanneau(){
  const el = document.getElementById('pcPanneau'); if(!el) return;
  const enLigne = pc.liste.filter(p => p.en_ligne);
  const horsLigne = pc.liste.filter(p => !p.en_ligne);
  el.innerHTML = `
    <div class="cn-tete"><strong>Personnes connectées</strong><button type="button" class="cn-fermer" onclick="pcBasculer(false)" aria-label="Fermer">✕</button></div>
    <details class="pc-groupe" open>
      <summary><span class="pc-voyant vert"></span> Connectées maintenant (${enLigne.length})</summary>
      ${enLigne.length ? `<ul class="pc-liste">${enLigne.map(pcLigne).join('')}</ul>` : '<p class="pc-vide">Personne d’autre n’est connecté pour l’instant.</p>'}
    </details>
    <details class="pc-groupe"${pc.horsLigneOuvert ? ' open' : ''} ontoggle="pc.horsLigneOuvert = this.open">
      <summary><span class="pc-voyant gris"></span> Pas connectées (${horsLigne.length})</summary>
      ${horsLigne.length ? `<ul class="pc-liste">${horsLigne.map(pcLigne).join('')}</ul>` : '<p class="pc-vide">Tout le monde est connecté.</p>'}
    </details>
    <p class="pc-aide">Touchez un nom pour lui écrire. Le message reste dans l’application, même si la personne n’est pas connectée.</p>`;
}

/* ----------------------------- Discussion ----------------------------- */
async function pcOuvrirDiscussion(id){
  const p = pc.liste.find(x => x.id === id); if(!p) return;
  pcBasculer(false);
  pc.convAvec = id;
  openModal(`💬 ${p.nom}`, `
    <div class="pc-conv-tete"><span class="pc-voyant ${p.en_ligne ? 'vert' : 'gris'}" id="pcConvVoyant"></span>
      <span id="pcConvEtat">${escapeHtml(pcFonction(p.role))} · ${p.en_ligne ? 'connecté(e)' : pcVuIlYa(p.vu_le)}</span></div>
    <div class="pc-fil" id="pcFil" aria-live="polite"><p class="pc-vide">Chargement…</p></div>
    <form class="pc-saisie" onsubmit="event.preventDefault(); pcEnvoyer()">
      <textarea id="pcTexte" rows="2" maxlength="2000" placeholder="Écrire un message…" aria-label="Votre message"
        onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); pcEnvoyer(); }"></textarea>
      <button type="submit" class="btn" id="pcEnvoyerBtn">Envoyer</button>
    </form>`);
  setTimeout(() => { const t = document.getElementById('pcTexte'); if(t) t.focus(); }, 50);
  await pcChargerFil(true);
  clearInterval(pc.convTimer);
  pc.convTimer = setInterval(() => {
    if(!document.getElementById('pcFil')){ clearInterval(pc.convTimer); pc.convTimer = null; pc.convAvec = null; return; }
    if(!document.hidden) pcChargerFil(false);
  }, 5000);
}

async function pcChargerFil(defiler){
  const id = pc.convAvec, moi = session.userId; if(!id || !moi) return;
  const { data, error } = await sb.from('messages_personnel')
    .select('id,expediteur_id,destinataire_id,contenu,lu_at,created_at')
    .or(`and(expediteur_id.eq.${moi},destinataire_id.eq.${id}),and(expediteur_id.eq.${id},destinataire_id.eq.${moi})`)
    .order('created_at', { ascending: true }).limit(300);
  const fil = document.getElementById('pcFil'); if(!fil || pc.convAvec !== id) return;
  if(error){ fil.innerHTML = '<p class="pc-vide">Impossible de charger la discussion. Vérifiez la connexion.</p>'; return; }
  const enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 40;
  const msgs = data || [];
  let jour = '';
  fil.innerHTML = msgs.length ? msgs.map(m => {
    const d = new Date(m.created_at), j = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const sep = j !== jour ? `<div class="pc-jour">${escapeHtml(j)}</div>` : ''; jour = j;
    const deMoi = m.expediteur_id === moi;
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${sep}<div class="pc-msg ${deMoi ? 'moi' : 'lui'}"><div class="pc-bulle">${escapeHtml(m.contenu).replace(/\n/g, '<br>')}</div>
      <small>${heure}${deMoi ? (m.lu_at ? ' · ✓✓ lu' : ' · ✓ envoyé') : ''}</small></div>`;
  }).join('') : '<p class="pc-vide">Aucun message pour l’instant. Écrivez le premier !</p>';
  if(defiler || enBas) fil.scrollTop = fil.scrollHeight;
  // Les messages reçus sont marqués lus (le voyant rouge disparaît)
  if(msgs.some(m => m.destinataire_id === moi && !m.lu_at)){
    try{ await sb.rpc('marquer_messages_lus', { p_de: id }); }catch(_e){}
    const p = pc.liste.find(x => x.id === id); if(p){ p.non_lus = 0; pc.dernierNonLus = pc.liste.reduce((s, x) => s + (x.non_lus || 0), 0); pcMajBouton(); }
  }
}

async function pcEnvoyer(){
  const t = document.getElementById('pcTexte'); if(!t || pc.envoiEnCours) return;
  const texte = t.value.trim(); if(!texte) return;
  pc.envoiEnCours = true;
  const btn = document.getElementById('pcEnvoyerBtn'); if(btn) btn.disabled = true;
  try{
    const { error } = await sb.from('messages_personnel').insert({ ecole_id: session.ecoleId, expediteur_id: session.userId, destinataire_id: pc.convAvec, contenu: texte });
    if(error) throw error;
    t.value = '';
    await pcChargerFil(true);
  }catch(e){
    toast(typeof erreurReseau === 'function' && erreurReseau(e) ? 'Pas de connexion : message non envoyé, réessayez.' : 'Message non envoyé.');
  }finally{
    pc.envoiEnCours = false; if(btn) btn.disabled = false; t.focus();
  }
}
