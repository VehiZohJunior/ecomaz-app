/* =====================================================================
   EcoMaZ — VERSION DE DÉMONSTRATION pour les prospects (25/11/2026)
   ---------------------------------------------------------------------
   Remplace le serveur Supabase par une base FICTIVE qui vit uniquement
   dans le navigateur du visiteur (enregistrée sur son appareil).
   Aucune connexion à la vraie base : aucune donnée de SUCCESS KIDS,
   aucun compte. Chargé AVANT supabase-client.min.js par les pages de
   la démo (voir tools/demo/construire_demo.py).
   ===================================================================== */
(function(){
  'use strict';
  const CLE_BASE = 'ecomaz_demo_base_v1', CLE_USER = 'ecomaz_demo_utilisateur';
  const SOURCE = window.ECOMAZ_DEMO_DONNEES;
  const ECOLE = SOURCE.ecoles[0].id;

  // ---- Les dates fictives suivent le calendrier : décalées de semaines entières
  //      (les jours de la semaine restent justes) pour finir la semaine passée.
  function decalerDates(D){
    const ancre = new Date(SOURCE._ancre + 'T12:00:00'), auj = new Date();
    auj.setHours(12, 0, 0, 0);
    const semaines = Math.max(0, Math.floor((auj - ancre) / (7 * 86400000)));
    if(!semaines) return D;
    const ms = semaines * 7 * 86400000;
    const re = /^(\d{4}-\d{2}-\d{2})/;
    const decale = v => v.replace(re, d => { const x = new Date(new Date(d + 'T12:00:00').getTime() + ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
    for(const t in D){ if(!Array.isArray(D[t])) continue;
      for(const l of D[t]) for(const c in l){ if(typeof l[c] === 'string' && re.test(l[c]) && c !== 'annee_scolaire' && c !== 'date_naissance') l[c] = decale(l[c]); } }
    return D;
  }
  function neuve(){ const D = JSON.parse(JSON.stringify(SOURCE)); delete D._ancre; return decalerDates(D); }
  let T;
  try{ T = JSON.parse(localStorage.getItem(CLE_BASE) || 'null'); }catch(_e){ T = null; }
  if(!T || T._version !== SOURCE._version) T = Object.assign(neuve(), { _version: SOURCE._version });
  let minuterie = null;
  function enregistrer(){ clearTimeout(minuterie); minuterie = setTimeout(() => { try{ localStorage.setItem(CLE_BASE, JSON.stringify(T)); }catch(_e){} }, 150); }
  // Un anniversaire « aujourd'hui » (pour montrer l'assistant), recalculé à chaque ouverture
  try{ const ann = (T.eleves || []).find(e => e.date_naissance && e.statut === 'Actif'); if(ann){ const d = new Date(); ann.date_naissance = ann.date_naissance.slice(0, 5) + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } }catch(_e){}
  enregistrer();

  // ---- Utilisateur fictif courant
  const ROLES = {
    direction:  { id: 'demo-direction',  email: 'direction@demo.ecomaz',  page: 'index.html',      libelle: 'Direction',  icone: '🏫', aide: 'Tableau de bord, élèves, scolarité, comptabilité' },
    secretariat: { id: 'demo-secretariat', email: 'secretariat@demo.ecomaz', page: 'index.html', libelle: 'Secrétariat', icone: '🗂️', aide: 'Inscriptions, scolarité, reçus, rapports' },
    enseignant: { id: 'demo-enseignant', email: 'enseignant@demo.ecomaz', page: 'enseignant.html', libelle: 'Enseignant', icone: '👩🏾‍🏫', aide: 'Appel, notes, devoirs, pointage' },
    parent:     { id: 'demo-parent',     email: 'parent@demo.ecomaz',     page: 'parent.html',     libelle: 'Parent',     icone: '👨🏾‍👧🏾', aide: 'Suivi de ses enfants, absences, paiements' },
    portier:    { id: 'demo-portier',    email: 'portier@demo.ecomaz',    page: 'portier.html',    libelle: 'Portier',    icone: '🚪', aide: 'Sorties des élèves, personnes autorisées' },
  };
  function utilisateur(){ let id = null; try{ id = localStorage.getItem(CLE_USER); }catch(_e){} const p = id && (T.profiles || []).find(x => x.id === id); return p ? { id: p.id, email: (Object.values(ROLES).find(r => r.id === p.id) || {}).email || 'demo@demo.ecomaz', role: 'authenticated' } : null; }
  function profilCourant(){ const u = utilisateur(); return u ? (T.profiles || []).find(p => p.id === u.id) : null; }

  // ---- Un parent ne voit que SES enfants (comme la règle de sécurité du vrai serveur)
  function enfantsDuParent(){ const p = profilCourant(); if(!p || p.role !== 'parent') return null; return new Set((T.parents_eleves || []).filter(l => l.parent_profile_id === p.id).map(l => l.eleve_id)); }

  const VUES = { enseignants_lecture: 'enseignants', eleves_portier_lecture: 'eleves', fne_config_lecture: 'fne_config', paiement_en_ligne_config_lecture: 'paiement_en_ligne_config' };
  const nomTable = t => VUES[t] || t;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const egal = (a, b) => a === b || (a != null && b != null && String(a) === String(b));
  const comparer = (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : a > b ? 1 : a < b ? -1 : 0);

  // Filtre « or » de Supabase (forme simple : col.eq.val et and(...) imbriqués)
  function decouper(x){
    const parts = []; let prof = 0, cour = '';
    for(const ch of x){ if(ch === '(') prof++; if(ch === ')') prof--; if(ch === ',' && !prof){ parts.push(cour); cour = ''; } else cour += ch; }
    if(cour) parts.push(cour);
    return parts.map(t => t.trim()).filter(Boolean).map(t => {
      const m = /^and\((.*)\)$/.exec(t);
      if(m){ const sous = decouper(m[1]); return l => sous.every(f => f(l)); }
      const [c, o, ...v] = t.split('.'); const val = v.join('.');
      if(o === 'eq') return l => egal(l[c], val);
      if(o === 'is') return l => val === 'null' ? l[c] == null : String(l[c]) === val;
      return () => true;
    });
  }
  function requete(table){
    const t = nomTable(table);
    let op = 'select', donnees = null, filtres = [], tris = [], debut = 0, fin = null, une = false, peutEtre = false, tete = false, retour = false, conflit = 'id', colonnes = null;
    const q = {
      select(c, o){ if(op !== 'select') retour = true; if(o && o.head) tete = true; if(typeof c === 'string' && c.trim() !== '*' && !c.includes('(')) colonnes = c.split(',').map(s => s.trim()).filter(Boolean); return q; },
      eq(c, v){ filtres.push(l => egal(l[c], v)); return q; },
      neq(c, v){ filtres.push(l => !egal(l[c], v)); return q; },
      in(c, vs){ const s = (vs || []).map(String); filtres.push(l => s.includes(String(l[c]))); return q; },
      gte(c, v){ filtres.push(l => l[c] != null && l[c] >= v); return q; }, lte(c, v){ filtres.push(l => l[c] != null && l[c] <= v); return q; },
      gt(c, v){ filtres.push(l => l[c] != null && l[c] > v); return q; }, lt(c, v){ filtres.push(l => l[c] != null && l[c] < v); return q; },
      is(c, v){ filtres.push(l => v === null ? l[c] == null : l[c] === v); return q; },
      not(c, o, v){ if(o === 'is' && (v === null || v === 'null')) filtres.push(l => l[c] != null); return q; },
      like(c, m){ return q.ilike(c, m); },
      ilike(c, m){ const re = new RegExp('^' + String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); filtres.push(l => re.test(String(l[c] ?? ''))); return q; },
      contains(c, v){ const vs = Array.isArray(v) ? v : [v]; filtres.push(l => Array.isArray(l[c]) && vs.every(x => l[c].includes(x))); return q; },
      overlaps(c, v){ filtres.push(l => Array.isArray(l[c]) && (v || []).some(x => l[c].includes(x))); return q; },
      match(o){ for(const k in o) q.eq(k, o[k]); return q; },
      or(expr){ const termes = decouper(String(expr || '')); if(termes.length) filtres.push(l => termes.some(tm => tm(l))); return q; },
      filter(){ return q; }, textSearch(){ return q; },
      order(c, o){ tris.push([c, !o || o.ascending !== false]); return q; },
      limit(n){ fin = debut + n - 1; return q; }, range(a, b){ debut = a; fin = b; return q; },
      single(){ une = true; return q; }, maybeSingle(){ peutEtre = true; return q; },
      csv(){ return q; }, abortSignal(){ return q; },
      insert(x){ op = 'insert'; donnees = Array.isArray(x) ? x : [x]; return q; },
      upsert(x, o){ op = 'upsert'; donnees = Array.isArray(x) ? x : [x]; if(o && o.onConflict) conflit = o.onConflict; return q; },
      update(x){ op = 'update'; donnees = x; return q; },
      delete(){ op = 'delete'; return q; },
      then(ok, ko){ return new Promise(r => setTimeout(r, 40)).then(executer).then(ok, ko); },
    };
    function lignes(){ return (T[t] = T[t] || []); }
    function visibles(){
      let r = lignes();
      const enfants = enfantsDuParent();
      if(t === 'messages_personnel'){ const u = utilisateur(); r = r.filter(l => u && (l.expediteur_id === u.id || l.destinataire_id === u.id)); }
      if(enfants){ if(t === 'eleves') r = r.filter(l => enfants.has(l.id)); else if(r[0] && 'eleve_id' in r[0]) r = r.filter(l => !l.eleve_id || enfants.has(l.eleve_id)); }
      return r;
    }
    function resultat(rows){
      rows = rows.map(l => { if(!colonnes) return { ...l }; const o = {}; colonnes.forEach(c => { const [n] = c.split(':'); o[n] = l[n]; }); return o; });
      if(tete) return { data: null, count: rows.length, error: null };
      if(une) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: rows.length ? 'Plusieurs lignes' : 'Aucune ligne', code: 'PGRST116' } };
      if(peutEtre) return { data: rows[0] || null, error: null };
      return { data: rows, count: rows.length, error: null };
    }
    function executer(){
      const passe = l => filtres.every(f => f(l));
      if(op === 'select'){
        let r = visibles().filter(passe);
        if(tris.length) r = r.slice().sort((a, b) => { for(const [c, asc] of tris){ const k = comparer(a[c], b[c]); if(k) return asc ? k : -k; } return 0; });
        const total = r.length;
        r = r.slice(debut, fin == null ? undefined : fin + 1);
        const res = resultat(r); if(!tete && !une && !peutEtre) res.count = total; return res;
      }
      if(op === 'insert' || op === 'upsert'){
        const cles = conflit.split(',').map(s => s.trim());
        const faits = donnees.map(d => {
          const l = { ...d }; if(!l.id && t !== 'bulletins_commentaires' && t !== 'coefficients_matieres') l.id = uuid();
          if(!l.ecole_id && t !== 'ecoles') l.ecole_id = ECOLE; if(!l.created_at) l.created_at = new Date().toISOString();
          if(op === 'upsert'){ const ex = lignes().find(x => cles.every(k => egal(x[k], l[k]))); if(ex){ Object.assign(ex, d); return ex; } }
          lignes().push(l); return l;
        });
        enregistrer(); actionsInternes(t, faits);
        return retour ? resultat(faits) : { data: null, error: null };
      }
      if(op === 'update'){
        const cibles = visibles().filter(passe); cibles.forEach(l => Object.assign(l, donnees)); enregistrer();
        return retour ? resultat(cibles) : { data: null, error: null };
      }
      if(op === 'delete'){
        const cibles = visibles().filter(passe); T[t] = lignes().filter(l => !cibles.includes(l)); enregistrer();
        return retour ? resultat(cibles) : { data: null, error: null };
      }
    }
    return q;
  }
  // Petits automatismes du vrai serveur (reçu numéroté après un paiement)
  const REPONSES = ['Bien reçu, merci !', 'D’accord, je m’en occupe.', 'Merci pour l’information 👍', 'Je passe vous voir à la pause.'];
  function actionsInternes(t, faits){
    if(t === 'messages_personnel'){
      for(const m of faits){ const dest = (T.profiles || []).find(p => p.id === m.destinataire_id);
        if(dest && enLigneDemo(dest.id)) setTimeout(() => { T.messages_personnel.push({ id: uuid(), ecole_id: ECOLE, expediteur_id: dest.id, destinataire_id: m.expediteur_id, contenu: REPONSES[Math.floor(Math.random() * REPONSES.length)], lu_at: null, created_at: new Date().toISOString() }); m.lu_at = new Date().toISOString(); enregistrer(); }, 3500); }
    }
    if(t === 'paiements_scolarite' || t === 'paiements_cotisations'){
      T.recus = T.recus || [];
      for(const p of faits){ const n = T.recus.length + 1;
        T.recus.push({ id: uuid(), ecole_id: ECOLE, numero: `R-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`, table_cible: t, enregistrement_id: p.id, eleve_id: p.eleve_id, montant: p.montant, objet: p.tranche || 'Paiement', mode_paiement: p.mode_paiement, date_paiement: p.date, emis_le: new Date().toISOString(), emis_par: (utilisateur() || {}).id, en_ligne: false }); }
    }
  }

  const ok = data => Promise.resolve({ data, error: null });
  const heure = () => new Date().toTimeString().slice(0, 5);
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const PERSONNEL = ['direction', 'fondation', 'secretariat', 'enseignant'];
  // Présence fictive : environ la moitié du personnel « connecté », le reste vu récemment
  function enLigneDemo(id){ let h = 0; for(const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 2 === 0; }
  function vuDemo(id){ let h = 7; for(const c of String(id)) h = (h * 17 + c.charCodeAt(0)) >>> 0; return new Date(Date.now() - (enLigneDemo(id) ? 20 : 600 + (h % 3000)) * 60000 / 60).toISOString(); }
  const RPC = {
    signaler_presence: () => null, quitter_presence: () => null,
    personnel_connecte: () => { const moi = profilCourant(); if(!moi || !PERSONNEL.includes(moi.role)) return [];
      return (T.profiles || []).filter(p => p.id !== moi.id && PERSONNEL.includes(p.role)).map(p => ({ id: p.id, nom: p.nom_complet, role: p.role, civilite: p.civilite,
        en_ligne: enLigneDemo(p.id), vu_le: vuDemo(p.id), non_lus: (T.messages_personnel || []).filter(m => m.destinataire_id === moi.id && m.expediteur_id === p.id && !m.lu_at).length }))
        .sort((a, b) => (b.en_ligne - a.en_ligne) || a.nom.localeCompare(b.nom)); },
    marquer_messages_lus: (a) => { const moi = profilCourant(); let n = 0; (T.messages_personnel || []).forEach(m => { if(moi && m.destinataire_id === moi.id && m.expediteur_id === (a && a.p_de) && !m.lu_at){ m.lu_at = new Date().toISOString(); n++; } }); enregistrer(); return n; },
    mes_fonctions: () => { const p = profilCourant(); return p ? [{ role: p.role, principale: true }] : []; },
    compteur_portier_jour: () => (T.notifications_portier || []).filter(n => String(n.created_at || '').startsWith(aujourdhui())).length,
    jeton_qr_pointage: () => 'demo-jeton-qr', renouveler_jeton_qr_pointage: () => 'demo-jeton-qr',
    ecole_a_des_versements: () => true, usage_remplissage_mois: () => 0,
    compter_applaudissements: () => 0, apercu_invitation_parent: () => null,
    creer_invitation_parent: () => 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
  };
  const FONCTIONS = {
    'pointer-presence': (corps) => {
      const p = profilCourant(); const ens = p && p.enseignant_id;
      const action = (corps && corps.action) || 'arrivee';
      if(corps && corps.methode === 'appel') return { ok: true, distanceMetres: 18 };
      if(ens){ T.presences_enseignants = T.presences_enseignants || [];
        let l = T.presences_enseignants.find(x => x.enseignant_id === ens && x.date === aujourdhui());
        if(!l){ l = { id: uuid(), ecole_id: ECOLE, enseignant_id: ens, date: aujourdhui(), statut: 'Présent', methode: (corps && corps.methode) || 'GPS', minutes_retard: 0 }; T.presences_enseignants.push(l); }
        if(action === 'depart') l.heure_depart = heure(); else l.heure_arrivee = heure();
        enregistrer(); }
      return { ok: true, action, heure: heure(), distanceMetres: 18 };
    },
  };
  const client = {
    from: requete,
    rpc: (nom, args) => ok(RPC[nom] ? RPC[nom](args) : []),
    functions: { invoke: async (nom, o) => { await new Promise(r => setTimeout(r, 300)); return { data: FONCTIONS[nom] ? FONCTIONS[nom](o && o.body) : { ok: true, demo: true, message: 'Action simulée (démonstration)' }, error: null }; } },
    channel(){ const c = { on(){ return c; }, subscribe(){ return c; }, unsubscribe(){}, send(){ return Promise.resolve('ok'); } }; return c; },
    removeChannel(){}, removeAllChannels(){},
    storage: { from: () => ({
      upload: async (chemin) => ({ data: { path: chemin }, error: null }),
      remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'icon-192.png' } }),
      createSignedUrl: async () => ({ data: { signedUrl: 'icon-192.png' }, error: null }),
      createSignedUrls: async (cs) => ({ data: (cs || []).map(c => ({ path: c, signedUrl: 'icon-192.png' })), error: null }),
      download: async () => ({ data: new Blob([]), error: null }) }) },
    auth: {
      getSession: async () => { const u = utilisateur(); return { data: { session: u ? { user: u, access_token: 'demo' } : null }, error: null }; },
      getUser: async () => ({ data: { user: utilisateur() }, error: null }),
      refreshSession: async () => { const u = utilisateur(); return { data: { session: u ? { user: u } : null, user: u }, error: null }; },
      signInWithPassword: async ({ email }) => {
        const r = Object.values(ROLES).find(x => x.email === String(email || '').toLowerCase());
        if(!r) return { data: {}, error: { message: 'Invalid login credentials' } };
        try{ localStorage.setItem(CLE_USER, r.id); }catch(_e){}
        const u = utilisateur(); return { data: { user: u, session: { user: u } }, error: null };
      },
      signInWithOAuth: async () => ({ data: {}, error: { message: 'Connexion Google indisponible dans la démonstration.' } }),
      signOut: async () => { try{ localStorage.removeItem(CLE_USER); }catch(_e){} setTimeout(afficherChoix, 50); return { error: null }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      updateUser: async () => ({ data: { user: utilisateur() }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
        listFactors: async () => ({ data: { all: [], totp: [] }, error: null }),
        enroll: async () => ({ data: null, error: { message: 'Indisponible dans la démonstration.' } }),
        challengeAndVerify: async () => ({ data: null, error: { message: 'Indisponible dans la démonstration.' } }),
        unenroll: async () => ({ data: null, error: null }),
      },
    },
  };
  window.supabase = { createClient: () => client };

  // ---- Position GPS simulée : le visiteur est « dans » l'école fictive
  //      (le contrôle de position du pointage et de l'appel se voit en action)
  try{
    const e = T.ecoles[0];
    const pos = () => ({ coords: { latitude: e.geofence_latitude + 0.0001, longitude: e.geofence_longitude + 0.0001, accuracy: 14, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
    const geo = { getCurrentPosition(ok){ setTimeout(() => ok(pos()), 600); }, watchPosition(ok){ setTimeout(() => ok(pos()), 600); return 1; }, clearWatch(){} };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  }catch(_e){}

  // ---- Pas de service worker dans la démo (toujours la dernière version publiée)
  try{ if(navigator.serviceWorker){ navigator.serviceWorker.register = () => Promise.reject(new Error('démo')); navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {}); } }catch(_e){}

  // ---- Interface de la démo : choix du rôle + pastille « DÉMO »
  const STYLE = `
  #demo-choix{position:fixed;inset:0;z-index:2147483000;background:rgba(20,30,25,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Nunito,system-ui,sans-serif}
  #demo-choix .boite{background:#FFFDF8;color:#1E2A24;border-radius:18px;max-width:460px;width:100%;padding:22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.35);max-height:92vh;overflow:auto}
  #demo-choix h2{margin:0 0 4px;font-size:1.3rem} #demo-choix p{margin:0 0 14px;color:#4A5A52;font-size:.95rem;line-height:1.4}
  #demo-choix button.role{display:flex;gap:12px;align-items:center;width:100%;text-align:left;border:1.5px solid #D9D2C3;background:#fff;border-radius:14px;padding:12px 14px;margin:0 0 10px;cursor:pointer;font:inherit;color:inherit}
  #demo-choix button.role:hover,#demo-choix button.role:focus{border-color:#2E7D62;outline:none;background:#F1F8F4}
  #demo-choix .ic{font-size:1.7rem} #demo-choix b{display:block;font-size:1.05rem} #demo-choix small{color:#5B6A62}
  #demo-choix .pied{font-size:.8rem;color:#6B776F;margin:6px 0 0}
  #demo-pastille{position:fixed;left:10px;bottom:calc(74px + env(safe-area-inset-bottom));z-index:2147482000;font-family:Nunito,system-ui,sans-serif}
  #demo-pastille>button{background:#B5492F;color:#fff;border:0;border-radius:999px;padding:7px 12px;font:700 .8rem Nunito,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
  #demo-pastille .menu{display:none;position:absolute;bottom:40px;left:0;background:#FFFDF8;color:#1E2A24;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:8px;min-width:230px}
  #demo-pastille.ouvert .menu{display:block}
  #demo-pastille .menu p{margin:4px 8px 8px;font-size:.8rem;color:#5B6A62}
  #demo-pastille .menu button{display:block;width:100%;text-align:left;background:none;border:0;padding:9px 8px;border-radius:8px;font:600 .9rem Nunito,system-ui,sans-serif;color:inherit;cursor:pointer}
  #demo-pastille .menu button:hover{background:#F1F0EA}`;
  function style(){ if(document.getElementById('demo-style')) return; const s = document.createElement('style'); s.id = 'demo-style'; s.textContent = STYLE; document.head.appendChild(s); }
  function marquerNouveautesVues(id){ try{ (window.VERSIONS || (typeof VERSIONS !== 'undefined' ? VERSIONS : [])).forEach(v => localStorage.setItem(`ecomaz_nouveautes_${v.version}_${id}`, '1')); }catch(_e){} }
  function entrer(role){
    const r = ROLES[role];
    try{ localStorage.setItem(CLE_USER, r.id); sessionStorage.removeItem('ecomaz_fonction_choisie'); }catch(_e){}
    marquerNouveautesVues(r.id);
    const page = location.pathname.split('/').pop() || 'index.html';
    if(page === r.page) location.reload(); else location.href = r.page;
  }
  function afficherChoix(){
    style(); if(document.getElementById('demo-choix')) return;
    const nom = (T.ecoles[0] || {}).nom_ecole || 'École de démonstration';
    const d = document.createElement('div'); d.id = 'demo-choix'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Choisir un rôle');
    d.innerHTML = `<div class="boite"><h2>Bienvenue dans la démonstration d’EcoMaZ</h2>
      <p><b style="display:inline">${nom}</b> est une école <b style="display:inline">fictive</b>. Choisissez qui vous voulez être : vous pourrez tout essayer, rien n’est envoyé à une vraie école.</p>
      ${Object.entries(ROLES).map(([k, r]) => `<button class="role" data-role="${k}"><span class="ic">${r.icone}</span><span><b>${r.libelle}</b><small>${r.aide}</small></span></button>`).join('')}
      <p class="pied">Vos essais restent sur cet appareil. Le bouton rouge « DÉMO », en bas de l’écran, permet de changer de rôle ou de tout remettre à zéro.</p></div>`;
    d.addEventListener('click', e => { const b = e.target.closest('button.role'); if(b) entrer(b.dataset.role); });
    document.body.appendChild(d);
  }
  function afficherPastille(){
    style(); if(document.getElementById('demo-pastille')) return;
    const p = profilCourant();
    const d = document.createElement('div'); d.id = 'demo-pastille';
    d.innerHTML = `<button type="button" aria-haspopup="true">DÉMO · ${p ? (ROLES[p.role] || {}).libelle || p.role : ''} ▾</button>
      <div class="menu"><p>École fictive : vos essais restent sur cet appareil.</p>
      <button type="button" data-a="role">🔄 Changer de rôle</button>
      <button type="button" data-a="zero">🧹 Remettre la démo à zéro</button></div>`;
    d.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if(!a){ d.classList.toggle('ouvert'); return; }
      if(a.dataset.a === 'role'){ try{ localStorage.removeItem(CLE_USER); }catch(_e){} d.classList.remove('ouvert'); afficherChoix(); }
      if(a.dataset.a === 'zero' && confirm('Effacer tous vos essais et revenir à l’école de démonstration d’origine ?')){ clearTimeout(minuterie); try{ localStorage.removeItem(CLE_BASE); localStorage.removeItem(CLE_USER); }catch(_e){} location.href = 'index.html'; }
    });
    document.addEventListener('click', e => { if(!d.contains(e.target)) d.classList.remove('ouvert'); });
    document.body.appendChild(d);
  }
  function demarrerInterface(){ if(utilisateur()) afficherPastille(); else afficherChoix(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerInterface); else demarrerInterface();
  window.ECOMAZ_DEMO = { entrer, remettreAZero(){ try{ localStorage.removeItem(CLE_BASE); }catch(_e){} } };
})();
