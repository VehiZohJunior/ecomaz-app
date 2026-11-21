/* ---------------------------------------------------------------------
   1. UTILITAIRES
   --------------------------------------------------------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function uid(){ return Math.random().toString(36).slice(2,9); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pad(n){ return String(n).padStart(2,'0'); }
function toISO(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function todayISO(){ return toISO(new Date()); }

function fmtDate(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtFCFA(n){
  return Math.round(n||0).toLocaleString('fr-FR') + '\u00a0' + DEVISE;
}
function moisLabel(moisISO){
  const [y,m] = moisISO.split('-');
  const noms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  return `${noms[parseInt(m)-1]} ${y}`;
}
function thisMonthISO(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function lastNMonths(n){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for(let i=0;i<n;i++){
    out.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);
    d.setMonth(d.getMonth()-1);
  }
  return out.reverse();
}
function nowTime(){ const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/* --- Messages automatiques (composition pure, sans dépendance à DB) --- */
function composeMsgAbsenceEleve(nomEcole, eleveNomComplet, classeNom, date, motif){
  return `Bonjour, nous vous informons que ${eleveNomComplet} (${classeNom}) est ABSENT(E) de l'école ce ${fmtDate(date)}${motif?` (motif signalé : ${motif})`:''}. Merci de contacter l'établissement pour toute justification. — ${nomEcole}`;
}
function composeMsgEnseignant(nomEcole, ensNomComplet, date, statut, motif){
  const label = statut==='Absent' ? 'ABSENT(E)' : 'EN RETARD';
  return `Information Direction : l'enseignant(e) ${ensNomComplet} est ${label} ce ${fmtDate(date)}${motif?` (motif : ${motif})`:''}. — ${nomEcole}`;
}
function ageFromISO(iso){
  if(!iso) return '—';
  const b = new Date(iso), n = new Date();
  let age = n.getFullYear()-b.getFullYear();
  const md = n.getMonth()-b.getMonth();
  if(md<0 || (md===0 && n.getDate()<b.getDate())) age--;
  return age;
}
// Valeur insérée dans un gestionnaire onclick="…" : JSON (guillemets, antislash) puis HTML.
// escapeHtml seul ne suffit pas : le navigateur redécode &#39; en ' avant d'exécuter le code.
function jsArg(v){ return escapeHtml(JSON.stringify(v == null ? '' : String(v))); }
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(prenom,nom){
  return ((prenom?.[0]||'') + (nom?.[0]||'')).toUpperCase();
}
function lastNWeekdays(n){
  const out = [];
  let d = new Date();
  while(out.length < n){
    const day = d.getDay();
    if(day !== 0 && day !== 6) out.push(toISO(d));
    d.setDate(d.getDate()-1);
  }
  return out.reverse();
}
function weekdayFR(iso){
  const idx = new Date(iso+'T00:00:00').getDay(); // 0=dim
  const map = {1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi',0:'Dimanche'};
  return map[idx];
}

// Quand une fonction Edge répond avec un code d'erreur (ex : validation
// refusée), supabase-js met "data" à null et "error" à un message générique
// et inexploitable ("Edge Function returned a non-2xx status code") — le
// vrai message ({ok:false, error:"..."}) est dans le corps de la réponse,
// accessible via error.context (l'objet Response brut).
async function messageErreurFonction(error){
  try{
    if(error?.context?.json){
      const corps = await error.context.json();
      if(corps?.error) return corps.error;
    }
  }catch(_e){ /* corps non-JSON ou déjà consommé : on retombe sur error.message */ }
  return error?.message || 'Erreur inconnue';
}

function toast(msg){
  let pile = $('#toastStack');
  if(!pile){
    pile = document.createElement('div');
    pile.id = 'toastStack';
    pile.setAttribute('role', 'status');
    pile.setAttribute('aria-live', 'polite');
    document.body.appendChild(pile);
  }
  const erreur = /^(erreur|impossible|échec|echec)|❌|⚠️/i.test(String(msg).trim());
  const el = document.createElement('div');
  el.className = 'toast-item' + (erreur ? ' error' : '');
  el.textContent = msg;
  if(!erreur && window.EmIcones){
    const coche = document.createElement('span');
    coche.className = 'toast-coche'; coche.setAttribute('aria-hidden', 'true');
    coche.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.prepend(coche);
  }
  if(erreur) el.setAttribute('role', 'alert');
  pile.appendChild(el);
  while(pile.children.length > 4) pile.firstChild.remove();
  requestAnimationFrame(()=>el.classList.add('show'));
  const duree = erreur ? 6500 : 2600;
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 250); }, duree);
}

function openModal(title, bodyHtml){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalBackdrop').classList.add('open');
}
function closeModal(){
  if(typeof arreterCameraPointage === 'function') arreterCameraPointage();
  $('#modalBackdrop').classList.remove('open');
  $('#modalBody').innerHTML = '';
}
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e=>{ if(e.target.id==='modalBackdrop') closeModal(); });

function classeName(id){ const c = DB.classes.find(c=>c.id===id); return c ? c.nom : '—'; }
function classeCycle(id){ const c = DB.classes.find(c=>c.id===id); return c ? c.cycle : 'Primaire'; }
function eleveById(id){ return DB.eleves.find(e=>e.id===id); }
function enseignantById(id){ return DB.enseignants.find(e=>e.id===id); }
function eleveFullName(e){ return `${e.prenom} ${e.nom}`; }
function ensFullName(e){ return e ? `${e.prenom} ${e.nom}` : '—'; }

function moyenneClass(avg){
  if(avg>=16) return 'good';
  if(avg>=10) return 'mid';
  return 'low';
}
function mentionFromAvg(avg){
  if(avg>=16) return 'Excellent';
  if(avg>=14) return 'Très Bien';
  if(avg>=12) return 'Bien';
  if(avg>=10) return 'Passable';
  return 'Insuffisant';
}

