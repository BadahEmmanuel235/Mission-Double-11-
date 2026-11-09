/* ============================================================
   MD11 // FINAL EXPERIENCE LAYER
   Timer · Admin · End-of-mission note · Secret portrait · Settings
   Static-hosting aware: local admin is convenience, not server security.
   ============================================================ */
(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const STORE = {
    timer: "md11.timer.settings",
    feedback: "md11.jessica.feedback",
    feedbackSent: "md11.jessica.feedback.sent",
    visited: "md11.jessica.visited",
    codes: ["md11.admin.code01", "md11.admin.code02"]
  };
  const ADMIN_HASH = "3eaecc9736eddfc4f1433f732277f035cf2d16dd56d4da5a8c0563cad34d7589";
  const DEFAULT_CONFIG = window.MD11_DEPLOY_CONFIG || {};
  const defaultTimer = {
    enabled: DEFAULT_CONFIG.timerEnabled !== false,
    target: DEFAULT_CONFIG.timerTarget || "2026-11-11T00:00",
    unlockedOnce: false,
    siteClosed: DEFAULT_CONFIG.siteClosed === true
  };
  const readJSON = (key, fallback) => {
    try { const v=localStorage.getItem(key); return v ? {...fallback,...JSON.parse(v)} : {...fallback}; }
    catch (_) { return {...fallback}; }
  };
  const saveJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/gi,"").toUpperCase();
  const state = { admin:false, timer:readJSON(STORE.timer, defaultTimer), visited:readJSON(STORE.visited, {}) };
  let countdownInterval = null;
  let feedbackShown = false;
  let feedbackTimer = null;
  const DEFER_KEY = "md11.jessica.feedback.deferredUntil";

  async function isAdminCode(value) {
    try {
      const bytes = new TextEncoder().encode(normalize(value));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
      return hash === ADMIN_HASH;
    } catch (_) { return false; }
  }

  function unlockAsAdmin() {
    state.admin = true;
    window.MD11_ADMIN = true;
    document.body.classList.add("md11-admin-mode");
    $("#countdownGate")?.classList.add("is-hidden");
    $("#countdownGate")?.setAttribute("aria-hidden","true");
    const adminButton=$("#adminSettingsButton");
    if (adminButton) adminButton.hidden=false;
    if (window.MD11?.state) {
      window.MD11.state.identityPath="jessica";
      window.MD11.state.firstCodeUnlocked=true;
      window.MD11.state.secondCodeUnlocked=true;
    }
    toast("MODE SYSTÈME ACTIVÉ");
  }
  function toast(message, ms=3000) {
    const node=$("#notification"), text=$("#notificationText");
    if (!node || !text) return;
    text.textContent=message; node.classList.add("is-visible"); node.setAttribute("aria-hidden","false");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>{node.classList.remove("is-visible");node.setAttribute("aria-hidden","true");},ms);
  }
  function formatWeekday(date) {
    return new Intl.DateTimeFormat("fr-FR",{weekday:"long"}).format(date).toLocaleUpperCase("fr-FR");
  }
  function updateCountdown() {
    const gate=$("#countdownGate");
    if (!gate) return;
    const target=new Date(state.timer.target);
    if (!Number.isFinite(target.getTime())) return;
    const now=new Date(), delta=target.getTime()-now.getTime();
    const days=Math.max(0,Math.floor(Math.max(0,delta)/86400000));
    const hours=Math.max(0,Math.floor(Math.max(0,delta)%86400000/3600000));
    const minutes=Math.max(0,Math.floor(Math.max(0,delta)%3600000/60000));
    const seconds=Math.max(0,Math.floor(Math.max(0,delta)%60000/1000));
    $("#countDays").textContent=String(days).padStart(2,"0");
    $("#countWeekday").textContent=formatWeekday(target).slice(0,3);
    $("#countHours").textContent=String(hours).padStart(2,"0");
    $("#countMinutes").textContent=String(minutes).padStart(2,"0");
    $("#countSeconds").textContent=String(seconds).padStart(2,"0");
    $("#countdownDateLabel").textContent=state.timer.siteClosed?"ACCÈS TEMPORAIREMENT SUSPENDU":new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(target);
    const title=$("#countdownGate h1");
    if(title)title.textContent=state.timer.siteClosed?"Accès temporairement suspendu.":"Chaque seconde nous rapproche.";
    const start=new Date("2026-05-31T00:00").getTime();
    const progress=Math.min(100,Math.max(0,(now.getTime()-start)/(target.getTime()-start)*100));
    $("#countdownProgress").style.width=`${progress}%`;
    if (delta<=0 && !state.timer.siteClosed) {
      state.timer.unlockedOnce=true; saveJSON(STORE.timer,state.timer);
      gate.classList.add("is-releasing");
      setTimeout(()=>{gate.classList.add("is-hidden");gate.setAttribute("aria-hidden","true");},850);
      if (countdownInterval) clearInterval(countdownInterval);
    }
  }
  function showCountdownIfNeeded() {
    const gate=$("#countdownGate");
    if (!gate) return;
    const target=new Date(state.timer.target);
    const locked=(state.timer.siteClosed || (state.timer.enabled && Number.isFinite(target.getTime()) && Date.now()<target.getTime())) && !state.admin;
    gate.classList.toggle("is-hidden",!locked);
    gate.setAttribute("aria-hidden",String(!locked));
    if (locked) {
      updateCountdown();
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval=setInterval(updateCountdown,1000);
    } else if (countdownInterval) { clearInterval(countdownInterval); countdownInterval=null; }
  }

  function ensureAdminPanel() {
    if ($("#md11AdminPanel")) return $("#md11AdminPanel");
    const panel=document.createElement("section");
    panel.id="md11AdminPanel"; panel.className="admin-panel"; panel.setAttribute("aria-hidden","true");
    panel.innerHTML=`
      <div class="admin-panel__backdrop" data-admin-close></div>
      <div class="admin-panel__window" role="dialog" aria-modal="true" aria-labelledby="adminPanelTitle">
        <header><div><span>MD11 // CONTROL ROOM</span><h2 id="adminPanelTitle">Paramètres système</h2></div><button type="button" data-admin-close aria-label="Fermer">×</button></header>
        <div class="admin-panel__body">
          <section class="admin-card"><h3>Accès Jessica</h3>
            <label>Code 01<input id="adminCode01" type="text" autocomplete="off" maxlength="24"></label>
            <label>Code 02<input id="adminCode02" type="text" autocomplete="off" maxlength="24"></label>
            <button id="saveAccessCodes" class="md11-button md11-button--primary" type="button">ENREGISTRER LES CODES</button><small>Les nouveaux codes seront appliqués après rechargement. Le code 02 accepte aussi sa version sans accent.</small>
          </section>
          <section class="admin-card"><h3>Verrou temporel</h3>
            <label class="admin-check"><input id="adminTimerEnabled" type="checkbox"> Activer le compte à rebours et verrouiller l’accès avant la date</label>
            <label class="admin-check"><input id="adminSiteClosed" type="checkbox"> Fermer le site aux visiteurs (le code de contrôle reste autorisé)</label>
            <label>Date et heure d’ouverture<input id="adminTimerTarget" type="datetime-local"></label>
            <button id="saveTimerSettings" class="md11-button" type="button">APPLIQUER LE MINUTEUR</button>
            <small>Le compte à rebours utilise l’horloge de l’appareil. Pour un verrou inviolable, un serveur avec contrôle d’accès est nécessaire.</small>
          </section>
          <section class="admin-card"><h3>Chanson d’anniversaire</h3>
            <p>Choisis le fichier audio final. L’outil le renomme pour remplacer le fichier attendu par le site.</p>
            <input id="adminSongFile" type="file" accept=".mp3,audio/mpeg">
            <audio id="adminSongPreview" controls hidden></audio>
            <button id="downloadSongFile" class="md11-button" type="button" disabled>TÉLÉCHARGER birthday-song.mp3</button>
            <small>Après téléchargement, remplace <code>Site/audio/music/birthday-song.mp3</code> dans ton dépôt GitHub puis republie le site.</small>
          </section>
          <section class="admin-card"><h3>Fond d’écran MD11</h3><p>Après l’entrée dans MUSIC, le portrait prend le relais comme fond d’écran. Tu peux restaurer ici le décor original.</p><button id="restoreOriginalBackdrop" class="md11-button" type="button">RESTAURER LE FOND ORIGINAL MD11</button></section>
          <section class="admin-card"><h3>Message de fin reçu sur cet appareil</h3>
            <pre id="adminFeedbackText" class="admin-feedback-empty">Aucun message enregistré pour le moment.</pre>
            <label>Jeton admin du serveur (si un relais distant est configuré)<input id="adminFeedbackToken" type="password" autocomplete="off" placeholder="Jeton privé du serveur"></label>
            <div class="admin-actions"><button id="syncRemoteFeedback" class="md11-button" type="button">RÉCUPÉRER LE MESSAGE DISTANT</button><button id="copyFeedback" class="md11-button" type="button">COPIER LE MESSAGE</button><button id="clearFeedback" class="md11-button" type="button">EFFACER</button></div>
            <small>Sans service de notification configuré, le message reste dans le stockage local de ce navigateur. Il ne remonte pas automatiquement depuis un autre téléphone.</small>
          </section>
          <section class="admin-card"><h3>Configuration à publier</h3><p>Exporte les réglages pour les reporter dans le fichier de configuration du dépôt.</p><button id="exportConfig" class="md11-button" type="button">EXPORTER LA CONFIGURATION</button></section>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelectorAll("[data-admin-close]").forEach(el=>el.addEventListener("click",closeAdminPanel));
    $("#saveAccessCodes").addEventListener("click",()=>{
      const a=$("#adminCode01").value.trim(), b=$("#adminCode02").value.trim();
      if (a.length<4 || b.length<4) return toast("Chaque code doit contenir au moins 4 caractères.");
      localStorage.setItem(STORE.codes[0],a); localStorage.setItem(STORE.codes[1],b);
      toast("Codes enregistrés. Recharge le site pour les activer.");
    });
    $("#saveTimerSettings").addEventListener("click",()=>{
      const target=$("#adminTimerTarget").value;
      if ($("#adminTimerEnabled").checked && (!target || !Number.isFinite(new Date(target).getTime()))) return toast("Choisis une date valide.");
      state.timer={...state.timer,enabled:$("#adminTimerEnabled").checked,siteClosed:$("#adminSiteClosed").checked,target:target||state.timer.target};
      saveJSON(STORE.timer,state.timer); showCountdownIfNeeded();
      toast(state.timer.siteClosed?"SITE FERMÉ AUX VISITEURS":state.timer.enabled?"MINUTEUR ACTIVÉ":"MINUTEUR DÉSACTIVÉ");
    });
    $("#adminSongFile").addEventListener("change",event=>{
      const file=event.target.files?.[0]; if(!file)return;
      if(!(file.type==="audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")))return toast("Choisis la chanson finale au format MP3.");
      const url=URL.createObjectURL(file), player=$("#adminSongPreview");
      player.src=url; player.hidden=false; player.load();
      $("#downloadSongFile").disabled=false;
      $("#downloadSongFile").onclick=()=>{
        const a=document.createElement("a");a.href=url;a.download="birthday-song.mp3";a.click();
      };
      toast("Fichier prêt. Écoute-le puis télécharge-le pour remplacer l’original.");
    });
    $("#restoreOriginalBackdrop")?.addEventListener("click",()=>{document.body.classList.remove("md11-portrait-backdrop");localStorage.removeItem("md11.music.backdrop");toast("FOND ORIGINAL MD11 RESTAURÉ");});
    $("#syncRemoteFeedback").addEventListener("click",async()=>{
      const url=(window.MD11_CONFIG||{}).feedbackReadUrl;
      const token=$("#adminFeedbackToken").value.trim();
      if(!url||!token)return toast("Configure l’URL de lecture et le jeton privé du serveur.");
      try{
        const response=await fetch(url,{headers:{"x-md11-admin-token":token}});
        if(!response.ok)throw new Error("HTTP "+response.status);
        const data=await response.json();
        const latest=data.messages?.[0]?.message || data.message || "";
        if(!latest)throw new Error("Aucun message distant");
        localStorage.setItem(STORE.feedback,latest);
        renderAdminFeedback();
        toast("MESSAGE DISTANT RÉCUPÉRÉ");
      }catch(error){console.error("MD11 — REMOTE FEEDBACK READ FAILED",error);toast("Impossible de récupérer le message distant.");}
    });
    $("#copyFeedback").addEventListener("click",()=>{
      const message=localStorage.getItem(STORE.feedback)||"";
      if(!message)return toast("Aucun message à copier.");
      navigator.clipboard?.writeText(message).then(()=>toast("MESSAGE COPIÉ")).catch(()=>toast("Copie non autorisée par le navigateur."));
    });
    $("#clearFeedback").addEventListener("click",()=>{
      if(!confirm("Effacer définitivement le message enregistré sur cet appareil ?"))return;
      localStorage.removeItem(STORE.feedback);renderAdminFeedback();toast("MESSAGE EFFACÉ");
    });
    $("#exportConfig").addEventListener("click",()=>{
      const config={
        code01:localStorage.getItem(STORE.codes[0])||"LBJ235",
        code02:localStorage.getItem(STORE.codes[1])||"AIDA235",
        timerEnabled:state.timer.enabled,
        timerTarget:state.timer.target,
        siteClosed:state.timer.siteClosed===true
      };
      const notifyConfig=window.MD11_CONFIG||{web3FormsAccessKey:"",webhookUrl:"",feedbackReadUrl:""};
      const source="window.MD11_DEPLOY_CONFIG = "+JSON.stringify(config,null,2)+";\n"+
        "window.MD11_CONFIG = "+JSON.stringify(notifyConfig,null,2)+";\n";
      const blob=new Blob([source],{type:"text/javascript"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="md11-config.js";a.click();
    });
    return panel;
  }
  function renderAdminFeedback() {
    const node=$("#adminFeedbackText"); if(!node)return;
    const message=localStorage.getItem(STORE.feedback);
    node.textContent=message||"Aucun message enregistré pour le moment.";
    node.classList.toggle("has-message",!!message);
  }
  function openAdminPanel() {
    if(!state.admin)return;
    const panel=ensureAdminPanel();
    $("#adminCode01").value=localStorage.getItem(STORE.codes[0])||DEFAULT_CONFIG.code01||"LBJ235";
    $("#adminCode02").value=localStorage.getItem(STORE.codes[1])||DEFAULT_CONFIG.code02||"AIDA235";
    $("#adminTimerEnabled").checked=state.timer.enabled;
    $("#adminSiteClosed").checked=state.timer.siteClosed===true;
    $("#adminTimerTarget").value=state.timer.target;
    renderAdminFeedback();
    panel.classList.add("is-open");panel.setAttribute("aria-hidden","false");
  }
  function closeAdminPanel() {
    const panel=$("#md11AdminPanel");panel?.classList.remove("is-open");panel?.setAttribute("aria-hidden","true");
  }

  async function submitFinalMessage(message) {
    const clean=String(message||"").trim();
    if(clean.length<3 || clean.length>1000)return {ok:false,reason:"invalid-length"};
    localStorage.setItem(STORE.feedback,clean);
    const config=window.MD11_CONFIG||{};
    const remote=[];
    if(config.web3FormsAccessKey) {
      const body=new FormData();
      body.append("access_key",config.web3FormsAccessKey);
      body.append("subject","Mission Double 11 — Message de Jessica");
      body.append("from_name","Mission Double 11");
      body.append("nom","Jessica");
      body.append("message",clean);
      try {
        const response=await fetch("https://api.web3forms.com/submit",{method:"POST",body});
        const result=await response.json();
        if(result.success)remote.push("email");
      } catch(error){console.warn("MD11 — EMAIL DELIVERY FAILED",error);}
    }
    if(config.feedbackReadUrl) {
      try {
        const response=await fetch(config.feedbackReadUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:clean})});
        if(response.ok)remote.push("supabase");
      } catch(error){console.warn("MD11 — SUPABASE FEEDBACK DELIVERY FAILED",error);}
    }
    if(config.webhookUrl) {
      try {
        const response=await fetch(config.webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:"Mission Double 11",sender:"Jessica",message:clean,createdAt:new Date().toISOString()})});
        if(response.ok)remote.push("webhook");
      } catch(error){console.warn("MD11 — WEBHOOK DELIVERY FAILED",error);}
    }
    return {ok:true,remote};
  }
  function openFeedback() {
    if(feedbackShown || localStorage.getItem(STORE.feedbackSent)==="1")return;
    const deferredUntil=Number(localStorage.getItem(DEFER_KEY)||0);
    if(deferredUntil>Date.now()) return;
    feedbackShown=true;
    const modal=$("#feedbackModal");
    if(!modal)return;
    modal.classList.add("is-open");modal.setAttribute("aria-hidden","false");
    setTimeout(()=>$("#feedbackMessage")?.focus(),300);
  }
  function closeFeedback() {
    const modal=$("#feedbackModal");modal?.classList.remove("is-open");modal?.setAttribute("aria-hidden","true");
  }

  function trackModule(module) {
    if(!module || !window.MD11?.state || window.MD11.state.identityPath!=="jessica" || !window.MD11.state.secondCodeUnlocked)return;
    state.visited[module]=true;saveJSON(STORE.visited,state.visited);
    const required=["archives","memories","missions","music","classified","transmission"];
    const complete=required.every(key=>state.visited[key]);
    if(complete && !localStorage.getItem(STORE.feedbackSent)) {
      const deferredUntil=Number(localStorage.getItem(DEFER_KEY)||0);
      const delay=Math.max(900,deferredUntil-Date.now());
      clearTimeout(feedbackTimer);
      feedbackTimer=setTimeout(openFeedback,delay);
    }
  }

  function installHooks() {
    const decor=document.createElement("div");decor.className="md11-celebration-layer";decor.setAttribute("aria-hidden","true");decor.innerHTML='<div class="md11-garland md11-garland--one"></div><div class="md11-garland md11-garland--two"></div><div class="md11-sparkle-field"></div>';document.body.appendChild(decor);
    const sparkles=decor.querySelector(".md11-sparkle-field");
    for(let i=0;i<34;i++){const dot=document.createElement("i");dot.style.setProperty("--x",(Math.random()*100).toFixed(2)+"%");dot.style.setProperty("--delay",(-Math.random()*8).toFixed(2)+"s");dot.style.setProperty("--duration",(5+Math.random()*7).toFixed(2)+"s");sparkles.appendChild(dot);}
    let celebrationTimer=null, musicActive=false, songFinished=false;
    function startCelebration(){decor.classList.add("is-active");}
    function stopCelebration(){decor.classList.remove("is-active");}
    function startMusicEffects(){musicActive=true;songFinished=false;document.body.classList.add("md11-portrait-backdrop");localStorage.setItem("md11.music.backdrop","portrait");startCelebration();clearInterval(celebrationTimer);}
    function stopMusicEffects(){musicActive=false;clearInterval(celebrationTimer);celebrationTimer=null;stopCelebration();}
    document.addEventListener("click",event=>{const moduleButton=event.target.closest(".station-module[data-module=music]");if(moduleButton){startMusicEffects();setTimeout(()=>{const player=document.querySelector("[data-md11-song-player]");if(player){player.addEventListener("ended",()=>{if(musicActive){songFinished=true;startCelebration();clearInterval(celebrationTimer);celebrationTimer=setInterval(()=>{if(musicActive&&songFinished){startCelebration();setTimeout(stopCelebration,9000);}},45000);}},{once:true});}},0);}});
    document.querySelector("#moduleCloseButton")?.addEventListener("click",()=>{if(musicActive){stopMusicEffects();runMiniPhotoExit();}},{capture:true});
    function runMiniPhotoExit(){const layer=document.createElement("div");layer.className="md11-photo-exit";layer.setAttribute("aria-hidden","true");const photos=(window.MD11_COLLECTION?.photos||[]).slice(0,18);photos.forEach((photo,index)=>{const img=document.createElement("img");img.src=photo.src;img.alt="";img.style.setProperty("--i",index);img.style.setProperty("--photo-x",((index%6)*16+2)+"%");img.style.setProperty("--photo-y",(Math.floor(index/6)*27+3)+"%");layer.appendChild(img);});document.body.appendChild(layer);requestAnimationFrame(()=>layer.classList.add("is-active"));setTimeout(()=>layer.remove(),5200);}
    if(localStorage.getItem("md11.music.backdrop")==="portrait")document.body.classList.add("md11-portrait-backdrop");
    const jessyPanel=$(".jessy-station-panel"), jessyToggle=$("#jessyPanelToggle"), jessyBody=$("#jessyPanelBody");
    jessyPanel?.classList.add("is-collapsed");
    let jessyPanelMode="collapsed";
    jessyToggle?.addEventListener("click",()=>{
      if(jessyPanelMode==="collapsed") jessyPanelMode="open";
      else if(jessyPanelMode==="open") jessyPanelMode="expanded";
      else jessyPanelMode="collapsed";
      const collapsed=jessyPanelMode==="collapsed";
      jessyToggle.setAttribute("aria-expanded",String(!collapsed));
      jessyToggle.textContent=collapsed?"OUVRIR":jessyPanelMode==="open"?"AGRANDIR":"RÉDUIRE";
      jessyToggle.title=collapsed?"Déployer Jessy IA":jessyPanelMode==="open"?"Agrandir la fenêtre Jessy IA":"Rétracter Jessy IA";
      jessyBody.hidden=collapsed;
      jessyPanel.classList.toggle("is-collapsed",collapsed);
      jessyPanel.classList.toggle("is-expanded",jessyPanelMode==="expanded");
    });
    const gateForm=$("#countdownAdminForm");
    gateForm?.addEventListener("submit",async event=>{
      event.preventDefault();
      const input=$("#countdownAdminCode"), feedback=$("#countdownAdminFeedback");
      if(await isAdminCode(input.value)){unlockAsAdmin();feedback.textContent="";if(window.MD11?.station)window.MD11.station.enter(true);}
      else {feedback.textContent="CODE REFUSÉ";input.select();}
    });
    // Admin code is intercepted before the ordinary first-code validator.
    let replayNormalAccessSubmit=false;
    $("#accessForm")?.addEventListener("submit",async event=>{
      if(replayNormalAccessSubmit){replayNormalAccessSubmit=false;return;}
      const form=event.currentTarget, input=$("#accessCode");
      event.preventDefault();event.stopImmediatePropagation();
      if(await isAdminCode(input?.value)){
        unlockAsAdmin();
        if(window.MD11?.station)window.MD11.station.enter(true);
      } else {
        replayNormalAccessSubmit=true;
        form.requestSubmit();
      }
    },true);
    $("#adminSettingsButton")?.addEventListener("click",openAdminPanel);
    $("#photoSecretTrigger")?.addEventListener("click",()=>{
      if(!window.MD11?.state || (!state.admin && (window.MD11.state.identityPath!=="jessica" || !window.MD11.state.secondCodeUnlocked)))return;
      const modal=$("#photoModal");
      $("#photoModalImage").src="assets/music-jessica-bw.png";
      $("#photoModalImage").alt="Portrait noir et blanc de Jessica";
      $("#photoModalCode").textContent="PRIVATE MEMORY // FAVOURITE";
      $("#photoModalCaption").textContent="Cette photo de toi est ma préférée 😍🥵🥰";
      modal?.classList.add("is-open");modal?.setAttribute("aria-hidden","false");
    });
    $("#feedbackLater")?.addEventListener("click",()=>{
      feedbackShown=false;
      const reopenAt=Date.now()+8000;
      localStorage.setItem(DEFER_KEY,String(reopenAt));
      closeFeedback();
      toast("D’accord. Je te le redemanderai dans quelques instants.");
      clearTimeout(feedbackTimer);
      feedbackTimer=setTimeout(()=>{localStorage.removeItem(DEFER_KEY);openFeedback();},8000);
    });
    $("#feedbackForm")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=event.currentTarget.querySelector('[type="submit"]');
      const status=$("#feedbackStatus");button.disabled=true;button.textContent="TRANSMISSION…";
      const result=await submitFinalMessage($("#feedbackMessage").value);
      button.disabled=false;button.textContent="ENVOYER MON MESSAGE";
      if(!result.ok){status.textContent="Écris quelques mots avant d’envoyer.";return;}
      localStorage.setItem(STORE.feedbackSent,"1");
      localStorage.removeItem(DEFER_KEY);
      clearTimeout(feedbackTimer);
      $("#photoSecretTrigger")?.classList.add("is-unlocked");
      closeFeedback();
      if(result.remote.length)toast("Merci d’avoir pris le temps pour écrire ce message, rassure-toi : je l’ai reçu 🙂😊🤓",6000);
      else toast("Merci d’avoir pris le temps pour écrire ce message. Il est enregistré sur cet appareil 🙂😊🤓",6000);
    });
    const originalOpen=window.MD11?.modules?.open;
    if(originalOpen)window.MD11.modules.open=function(module){const result=originalOpen.call(this,module);trackModule(module);return result;};
    document.addEventListener("keydown",event=>{if(event.key==="Escape")closeAdminPanel();});
  }

  const TimerTick = {
    audio:null, timer:null, active:false,
    async start(){
      try{
        this.audio=new Audio("audio/sfx/countdown-tick.wav");
        this.audio.preload="auto";
        await this.audio.play();
        this.audio.pause();this.audio.currentTime=0;
        this.active=true;
        const button=$("#countdownSoundButton");
        if(button){button.classList.add("is-active");button.textContent="TIC-TAC ACTIVÉ";}
        this.schedule();
      }catch(error){console.warn("MD11 — COUNTDOWN SOUND FAILED",error);toast("Le tic-tac n’a pas pu démarrer. Vérifie le fichier audio.");}
    },
    stop(){
      this.active=false;if(this.timer)clearTimeout(this.timer);this.timer=null;
      if(this.audio){this.audio.pause();this.audio=null;}
      const button=$("#countdownSoundButton");
      if(button){button.classList.remove("is-active");button.textContent="ACTIVER LE TIC-TAC";}
    },
    remaining(){return Math.max(0,new Date(state.timer.target).getTime()-Date.now());},
    interval(){const ms=this.remaining();if(ms>86400000)return 1800;if(ms>3600000)return 1300;if(ms>600000)return 950;if(ms>60000)return 700;if(ms>10000)return 460;return 260;},
    play(){if(!this.audio)return;const remaining=this.remaining();this.audio.pause();this.audio.currentTime=0;this.audio.playbackRate=remaining<10000?1.45:remaining<60000?1.2:remaining<600000?1.05:.92;this.audio.play().catch(error=>console.debug("MD11 tick playback blocked",error));},
    schedule(){if(!this.active)return;if(this.remaining()<=0){this.stop();return;}this.play();this.timer=setTimeout(()=>this.schedule(),this.interval());}
  };

  function init() {
    installHooks();
    if(localStorage.getItem(STORE.feedbackSent)==="1")$("#photoSecretTrigger")?.classList.add("is-unlocked");
    showCountdownIfNeeded();
    $("#countdownSoundButton")?.addEventListener("click",()=>TimerTick.active?TimerTick.stop():TimerTick.start());
    if(state.admin)unlockAsAdmin();
    console.info("MD11 — FINAL EXPERIENCE LAYER READY", {timer:state.timer.enabled,target:state.timer.target});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
