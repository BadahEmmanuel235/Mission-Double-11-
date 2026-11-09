/* ============================================================
   MISSION DOUBLE 11 // V1.2 RUNTIME ENGINE
   ------------------------------------------------------------
   Architecture (future-proof):
   CONFIG → STATE → DOM → EVENT BUS → AUDIO → SCREEN
   → CINEMATIC PROLOGUE → BOOT → JESSY IA → ACCESS
   → STATION → MODULES → ARCHIVE 001 → PHOTO VIEWER
   → DIAGNOSTICS → BOOTSTRAP

   RULE:
   Future fragments extend this engine. They do not create a
   second state machine, duplicate audio handlers, or bypass
   the existing screen/module architecture.
   ============================================================ */

(() => {
    "use strict";

    /* ============================================================
       CONFIGURATION
       ============================================================ */

    const readStored = (key, fallback) => {
        try { return window.localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
    };
    const CONFIG = Object.freeze({
        projectStart: "2026-05-31T00:00:00",
        birthday: "2026-11-11T00:00:00",
        codes: Object.freeze({
            first: readStored("md11.admin.code01", (window.MD11_DEPLOY_CONFIG && window.MD11_DEPLOY_CONFIG.code01) || "LBJ235"),
            second: Object.freeze([readStored("md11.admin.code02", (window.MD11_DEPLOY_CONFIG && window.MD11_DEPLOY_CONFIG.code02) || "AIDA235")])
        }),
        audio: Object.freeze({
            ambienceDefault: 0.12,
            click: 0.42,
            whoosh: 0.45,
            zoom: 0.34,
            birthdaySongDefault: 0.75
        }),
        timings: Object.freeze({
            roomTravel: 2600,
            hackerReveal: 1450,
            laptopReveal: 1700,
            wallReveal: 2100,
            continueReveal: 700,
            transitionBlack: 900,
            bootLine: 520,
            bootFinish: 900,
            aiIntroDelay: 850,
            aiSecondLineDelay: 1050,
            accessDelay: 700,
            stationEntry: 850
        }),
        storage: Object.freeze({
            songVolume: "md11.songVolume"
        }),
        assets: Object.freeze({
            birthdaySong: "audio/music/birthday-song.mp3"
        })
    });

    /* ============================================================
       STATE
       ============================================================ */

    const state = {
        screen: "prologue",
        missionStarted: false,
        prologueComplete: false,
        bootComplete: false,
        aiIntroComplete: false,
        identityPath: null,
        firstCodeUnlocked: false,
        secondCodeUnlocked: false,
        archive001Open: false,
        archive001Complete: false,
        secretFound: false,
        sync: 0,
        songVolume: CONFIG.audio.birthdaySongDefault,
        songAvailable: false,
        diagnostics: {
            audio: {},
            images: {}
        }
    };

    /* ============================================================
       DOM HELPERS
       ============================================================ */

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

    // Authentic keyboard recording, reduced to a tiny sample and played as short random slices.
    const TypingAudio = {
        context: null, buffer: null, loading: null, lastAt: 0,
        async load() {
            if (this.buffer) return this.buffer;
            if (this.loading) return this.loading;
            this.loading = (async () => {
                try {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (!AudioContextClass) return null;
                    this.context = this.context || new AudioContextClass();
                    const response = await fetch("audio/sfx/keyboard-typing-sample.mp3");
                    if (!response.ok) throw new Error("Typing sample unavailable");
                    this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
                    return this.buffer;
                } catch (error) {
                    console.warn("MD11 — TYPING AUDIO UNAVAILABLE", error);
                    return null;
                }
            })();
            return this.loading;
        },
        async play() {
            const now = performance.now();
            if (now - this.lastAt < 42) return;
            this.lastAt = now;
            const buffer = await this.load();
            if (!buffer || !this.context) return;
            try {
                if (this.context.state === "suspended") await this.context.resume();
                const source = this.context.createBufferSource();
                const gain = this.context.createGain();
                source.buffer = buffer;
                gain.gain.value = 0.19;
                source.connect(gain).connect(this.context.destination);
                const duration = Math.min(0.13, buffer.duration * 0.12);
                const offset = Math.random() * Math.max(0, buffer.duration - duration);
                source.start(0, offset, duration);
            } catch (_) { /* audio never blocks typing */ }
        }
    };

    const AudioFallback = {
        ctx: null,
        master: null,
        timer: null,
        active: false,
        step: 0,
        frequencies: [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 293.66, 392.00],
        ensure() {
            if (this.ctx) return true;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0.0001;
                this.master.connect(this.ctx.destination);
                return true;
            } catch (error) {
                console.warn("MD11 — AUDIO FALLBACK UNAVAILABLE", error);
                return false;
            }
        },
        async start() {
            if (!this.ensure()) return false;
            if (this.ctx.state === "suspended") await this.ctx.resume();
            if (this.active) return true;
            this.active = true;
            this.tick();
            this.timer = window.setInterval(() => this.tick(), 620);
            return true;
        },
        tick() {
            if (!this.ctx || !this.master) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = this.frequencies[this.step++ % this.frequencies.length];
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.045 * AudioFallback.volume), now + .06);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + .58);
            osc.connect(gain).connect(this.master);
            osc.start(now);
            osc.stop(now + .6);
        },
        setVolume(v) {
            this.volume = Math.max(0, Math.min(1, v));
            if (this.master && this.ctx) this.master.gain.setTargetAtTime(1, this.ctx.currentTime, .08);
        },
        stop() {
            this.active = false;
            if (this.timer) window.clearInterval(this.timer);
            this.timer = null;
        },
        volume: .75
    };

    const DOM = {
        screens: $$(".screen"),
        overlay: $("#systemOverlay"),
        overlayText: $("#systemOverlayText"),

        prologue: $("#prologue"),
        missionGate: $("#missionGate"),
        startButton: $("#startButton"),
        continueIndicator: $("#continueIndicator"),

        bootScreen: $("#bootScreen"),
        bootLines: $$("#bootScreen .boot-line"),
        bootProgressBar: $("#bootProgressBar"),

        aiIntro: $("#aiIntro"),
        aiLineOne: $("#aiLineOne"),
        aiLineTwo: $("#aiLineTwo"),

        identityScreen: $("#identityScreen"),
        identityMessage: $("#identityMessage"),
        jessicaPathButton: $("#jessicaPathButton"),
        visitorPathButton: $("#visitorPathButton"),

        jessicaAccess: $("#jessicaAccess"),
        codeStep01: $("#codeStep01"),
        codeStep02: $("#codeStep02"),
        accessForm: $("#accessForm"),
        accessCode: $("#accessCode"),
        accessFeedback: $("#accessFeedback"),
        accessSecondForm: $("#accessSecondForm"),
        accessSecondInput: $("#accessSecondInput"),
        accessSecondFeedback: $("#accessSecondFeedback"),

        visitorAccess: $("#visitorAccess"),
        visitorContinueButton: $("#visitorContinueButton"),

        station: $("#station"),
        stationIdentity: $("#stationIdentity"),
        stationAiMessage: $("#stationAiMessage"),
        stationAiContext: $("#stationAiContext"),
        jessyChatForm: $("#jessyChatForm"),
        jessyChatInput: $("#jessyChatInput"),
        jessyChatLog: $("#jessyChatLog"),
        stationModules: $("#stationModules"),
        syncValue: $("#syncValue"),
        syncBar: $("#syncBar"),

        songVolume: $("#songVolume"),
        songVolumeValue: $("#songVolumeValue"),
        songVolumeStatus: $("#songVolumeStatus"),

        moduleLayer: $("#moduleLayer"),
        moduleBackdrop: $("#moduleBackdrop"),
        moduleWindow: $("#moduleWindow"),
        moduleWindowCode: $("#moduleWindowCode"),
        moduleWindowTitle: $("#moduleWindowTitle"),
        moduleCloseButton: $("#moduleCloseButton"),
        moduleContent: $("#moduleContent"),

        archiveTemplate: $("#archive001Template"),

        photoModal: $("#photoModal"),
        photoModalBackdrop: $("#photoModalBackdrop"),
        photoModalClose: $("#photoModalClose"),
        photoModalImage: $("#photoModalImage"),
        photoModalCode: $("#photoModalCode"),
        photoModalCaption: $("#photoModalCaption"),

        notification: $("#notification"),
        notificationText: $("#notificationText"),

        audio: {
            ambience: $("#audioAmbience"),
            click: $("#audioClick"),
            whoosh: $("#audioWhoosh"),
            zoom: $("#audioZoom"),
            birthdaySong: $("#audioBirthdaySong"),
            typing: $("#audioTyping")
        }
    };

    /* ============================================================
       EVENT BUS
       ============================================================ */

    const EventBus = {
        emit(name, detail = {}) {
            window.dispatchEvent(new CustomEvent(`md11:${name}`, { detail }));
        },
        on(name, handler) {
            window.addEventListener(`md11:${name}`, handler);
        }
    };

    /* ============================================================
       CORE UI HELPERS
       ============================================================ */

    function assertCriticalDOM() {
        const required = [
            ["#prologue", $("#prologue")],
            ["#startButton", DOM.startButton],
            ["#continueIndicator", DOM.continueIndicator],
            ["#bootScreen", DOM.bootScreen],
            ["#aiIntro", DOM.aiIntro],
            ["#identityScreen", DOM.identityScreen],
            ["#jessicaAccess", DOM.jessicaAccess],
            ["#station", DOM.station],
            ["#moduleLayer", DOM.moduleLayer],
            ["#archive001Template", DOM.archiveTemplate]
        ];

        const missing = required
            .filter(([, node]) => !node)
            .map(([name]) => name);

        if (missing.length) {
            console.error("MD11 — CRITICAL DOM MISSING:", missing);
            showOverlay(`ERREUR SYSTÈME // ${missing.join(" • ")}`, true);
            return false;
        }

        return true;
    }

    function setScreen(id) {
        const target = document.getElementById(id);

        if (!target) {
            console.error(`MD11 — SCREEN NOT FOUND: ${id}`);
            return false;
        }

        DOM.screens.forEach(screen => {
            const active = screen === target;
            screen.classList.toggle("is-active", active);
            screen.setAttribute("aria-hidden", String(!active));
        });

        state.screen = id;
        document.body.dataset.screen = id;
        EventBus.emit("screenchange", { screen: id });

        return true;
    }

    function updateSync(value) {
        const next = Math.max(state.sync, Math.min(100, Number(value) || 0));
        state.sync = next;

        if (DOM.syncValue) {
            DOM.syncValue.textContent = `${String(next).padStart(2, "0")}%`;
        }

        if (DOM.syncBar) {
            DOM.syncBar.style.width = `${next}%`;
        }
    }

    function feedback(element, message, type = "normal") {
        if (!element) return;
        element.textContent = message;
        element.dataset.type = type;
    }

    function notify(message, duration = 1800) {
        if (!DOM.notification || !DOM.notificationText) return;

        DOM.notificationText.textContent = message;
        DOM.notification.classList.add("is-visible");
        DOM.notification.setAttribute("aria-hidden", "false");

        clearTimeout(notify.timer);
        notify.timer = window.setTimeout(() => {
            DOM.notification.classList.remove("is-visible");
            DOM.notification.setAttribute("aria-hidden", "true");
        }, duration);
    }

    function showOverlay(text = "", visible = true) {
        if (!DOM.overlay) return;

        DOM.overlayText.textContent = text;
        DOM.overlay.classList.toggle("is-visible", visible);
        DOM.overlay.setAttribute("aria-hidden", String(!visible));
    }

    /* ============================================================
       AUDIO ENGINE
       ------------------------------------------------------------
       SFX and ambience are independent from the birthday song.
       The public volume slider controls ONLY birthdaySong.
       ============================================================ */

    const AudioEngine = {
        unlocked: false,
        elements: {},
        songVolume: CONFIG.audio.birthdaySongDefault,

        init() {
            this.elements = DOM.audio;

            Object.entries(this.elements).forEach(([name, audio]) => {
                if (!audio) {
                    state.diagnostics.audio[name] = "ELEMENT_MISSING";
                    return;
                }

                audio.preload = "auto";
                audio.addEventListener("error", () => {
                    state.diagnostics.audio[name] = "LOAD_ERROR";
                    console.error(`MD11 — AUDIO LOAD ERROR: ${name}`, audio.error);
                    console.error(`MD11 AUDIO SOURCE CHECK: ${name}`, audio.currentSrc || audio.src);
                });

                audio.addEventListener("loadeddata", () => {
                    state.diagnostics.audio[name] = "LOADED";
                });

                audio.addEventListener("canplaythrough", () => {
                    state.diagnostics.audio[name] = "READY";
                    if (name === "birthdaySong") {
                        state.songAvailable = true;
                        this.refreshSongUI();
                    }
                });
            });

            this.restoreSongVolume();
            this.prepareSong();
            if (DOM.songVolume) this.setSongVolume(DOM.songVolume.value);
        },

        restoreSongVolume() {
            let stored = null;

            try {
                stored = window.localStorage.getItem(CONFIG.storage.songVolume);
            } catch (error) {
                console.warn("MD11 — STORAGE UNAVAILABLE", error);
            }

            const parsed = Number(stored);
            const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;
            this.songVolume = valid ? parsed : CONFIG.audio.birthdaySongDefault;

            if (DOM.songVolume) {
                DOM.songVolume.value = String(Math.round(this.songVolume * 100));
            }

            this.refreshSongUI();
        },

        prepareSong() {
            const song = this.elements.birthdaySong;
            if (!song) {
                state.songAvailable = false;
                this.refreshSongUI();
                return;
            }
            const authorized = state.identityPath === "jessica" && state.secondCodeUnlocked;
            if (!authorized) {
                state.songAvailable = false;
                song.pause();
                song.removeAttribute("src");
                song.load();
                this.refreshSongUI();
                return;
            }
            if (!song.getAttribute("src")) song.src = CONFIG.assets.birthdaySong;
            song.volume = this.songVolume;
            song.load();
            window.setTimeout(() => {
                if (!state.songAvailable) this.refreshSongUI();
            }, 1200);
        },

        unlock() {
            this.unlocked = true;

            const ambience = this.elements.ambience;
            if (!ambience) return;

            ambience.volume = CONFIG.audio.ambienceDefault;

            if (ambience.paused) {
                const playPromise = ambience.play();

                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(error => {
                        state.diagnostics.audio.ambience = `BLOCKED:${error?.name || "UNKNOWN"}`;
                        console.debug("MD11 ambience deferred until a permitted user gesture", error?.name || error);
                    });
                }
            }

            // La chanson ne démarre que si le vrai fichier est présent et chargé.
            // Aucun faux synthé ne remplace la piste finale.
        },

        async startBirthdaySong() {
            const song = this.elements.birthdaySong;
            if (song && state.songAvailable) {
                song.volume = this.songVolume;
                try {
                    await song.play();
                    return true;
                } catch (error) {
                    state.diagnostics.audio.birthdaySong = `PLAY_BLOCKED:${error?.name || "UNKNOWN"}`;
                }
            }

            state.diagnostics.audio.birthdaySong = "WAITING_FOR_REAL_FILE";
            state.songAvailable = false;
            this.refreshSongUI();
            return false;
        },

        play(name, volume = null) {
            const audio = this.elements[name];
            if (!audio) {
                console.warn(`MD11 — AUDIO ELEMENT MISSING: ${name}`);
                return false;
            }

            try {
                audio.pause();
                audio.currentTime = 0;

                if (volume !== null) {
                    audio.volume = Math.max(0, Math.min(1, volume));
                }

                const promise = audio.play();

                if (promise && typeof promise.catch === "function") {
                    promise.catch(error => {
                        state.diagnostics.audio[name] = `PLAY_BLOCKED:${error?.name || "UNKNOWN"}`;
                        console.debug(`MD11 audio play deferred: ${name}`, error?.name || error);
                    });
                }

                return true;
            } catch (error) {
                state.diagnostics.audio[name] = `PLAY_ERROR:${error?.name || "UNKNOWN"}`;
                console.error(`MD11 — AUDIO FAILED: ${name}`, error);
                this.report(name, "ERREUR DE LECTURE");
                return false;
            }
        },

        setSongVolume(percent) {
            const numeric = Math.max(0, Math.min(100, Number(percent) || 0));
            this.songVolume = numeric / 100;

            if (this.elements.birthdaySong) {
                this.elements.birthdaySong.volume = this.songVolume;
            }
            document.querySelectorAll("[data-md11-song-player]").forEach(player => {
                player.volume = this.songVolume;
            });
            AudioFallback.setVolume(this.songVolume);

            try {
                window.localStorage.setItem(
                    CONFIG.storage.songVolume,
                    String(this.songVolume)
                );
            } catch (error) {
                console.warn("MD11 — SONG VOLUME NOT PERSISTED", error);
            }

            if (DOM.songVolumeValue) {
                DOM.songVolumeValue.textContent = `${numeric}%`;
            }
        },

        refreshSongUI() {
            const ready = Boolean(this.elements.birthdaySong) && state.songAvailable;

            if (DOM.songVolume) {
                DOM.songVolume.disabled = !this.elements.birthdaySong;
                DOM.songVolume.setAttribute("aria-disabled", String(!this.elements.birthdaySong));
            }

            if (DOM.songVolumeStatus) {
                DOM.songVolumeStatus.textContent = ready
                    ? "READY"
                    : "SIGNAL MUSICAL EN ATTENTE";
                DOM.songVolumeStatus.dataset.ready = String(ready);
            }

            if (DOM.songVolumeValue) {
                DOM.songVolumeValue.textContent = `${Math.round(this.songVolume * 100)}%`;
            }
        },

        report(name, message) {
            EventBus.emit("audioerror", { name, message });

            if (state.screen === "station") {
                notify(`AUDIO // ${name.toUpperCase()} : ${message}`, 2600);
            }
        },

        diagnostics() {
            return typeof structuredClone === "function"
                ? structuredClone(state.diagnostics.audio)
                : { ...state.diagnostics.audio };
        }
    };

    /* ============================================================
       JESSY IA ENGINE
       ------------------------------------------------------------
       JESSY IA is persistent. This engine remains alive after the
       intro and can react to screen/module/photo events later.
       ============================================================ */

    const JessyIA = {
        messages: Object.freeze({
            hubVerified: "Tu es enfin entrée.",
            hubPublic: "Tu peux regarder. Pas tout.",
            archiveOpen: "Ah… ça, c'est une archive du début du projet. Tu peux prendre ton temps pour celle-là.",
            archivePhoto: "Ah… cette trace, je la reconnais. Elle appartient vraiment à cette période.",
            archiveSecret: "Ah… ça, tu n'étais pas vraiment censée le trouver maintenant.",
            archiveReturn: "Tu es revenue ici ? Je commence à croire que quelque chose t'intrigue.",
            important: "Ah… celle-là est importante."
        }),

        set(message, options = {}) {
            const { duration = 0, notifyUser = false } = options;
            const target = DOM.stationAiMessage;

            if (target) {
                target.classList.remove("is-changing");
                void target.offsetWidth;
                target.textContent = message;
                target.classList.add("is-changing");
            }

            if (DOM.stationAiContext) {
                DOM.stationAiContext.textContent = `JESSY IA // ${String(message).toUpperCase()}`;
            }

            EventBus.emit("ai:say", { message });

            if (notifyUser) {
                notify(`JESSY IA // ${message}`, duration || 2400);
            }
        },

        contextual(message, options = {}) {
            this.set(message, options);
        },

        say(message, duration = 0) {
            this.set(message, { duration, notifyUser: false });
        },

        onArchiveOpen() {
            this.contextual(this.messages.archiveOpen);
        },

        onPhotoOpen(metadata = {}) {
            const isImportant = String(metadata.code || "").includes("31-05") ||
                String(metadata.code || "").includes("ORIGIN");

            this.contextual(isImportant ? this.messages.important : this.messages.archivePhoto);
        },

        onSecret() {
            this.contextual(this.messages.archiveSecret, { notifyUser: false });
        },

        onArchiveReturn() {
            this.contextual(this.messages.archiveReturn);
        }
    };

    /* ============================================================
       JESSY COGNITIVE CORE
       ------------------------------------------------------------
       Petit moteur local : intention + contexte + mémoire de session.
       Il reste volontairement déterministe et modifiable sans refonte.
       ============================================================ */

    const JessyCore = {
        memory: [],
        knowledge: [
            { keys:["31 mai","31 mai 2026","début","commencé","origine"], answer:"Le 31 mai 2026, Emmanuel a eu l’idée de créer une surprise qui ne serait pas seulement un message. Au départ, il n’y avait ni Station, ni Archives, ni moi : seulement une intention." },
            { keys:["mission double 11","md11","mission"], answer:"MD11 est une expérience construite autour du 11 novembre. Tu peux parcourir les Archives, les Missions, l’Album, les Vidéos, la Musique et la Transmission. Chaque module raconte une partie du chemin." },
            { keys:["18 ans","âge","age"], answer:"Aujourd’hui, tu franchis une nouvelle étape. J’espère que cette journée te donnera autant de raisons de sourire que cette mission en a rassemblé. 🎂" },
            { keys:["archive 001"], answer:"ARCHIVE 001 remonte au 31 mai 2026, au moment où l’idée est née. Les captures du 18 août montrent aussi les coulisses du site." },
            { keys:["archive","archives"], answer:"Les Archives gardent les traces de construction de MD11. Commence par ARCHIVE 001 : c’est le point d’origine. L’Album et les Vidéos sont rangés dans cet espace." },
            { keys:["album","photo","photos"], answer:"L’Album rassemble les photos sélectionnées pour toi. Tu peux avancer page par page, utiliser les miniatures et ouvrir les images pour lire les petites notes qui les accompagnent." },
            { keys:["vidéo","video","videos","vidéos"], answer:"Les fragments vidéo sont réunis dans leur propre espace. Une seule vidéo se lance à la fois pour que la lecture reste fluide." },
            { keys:["message","écrire","ecrire","ressenti","avis"], answer:"Quand tu auras parcouru les six modules de la Station, une dernière fenêtre te proposera de me laisser ton ressenti. Tu pourras écrire librement. 💌" },
            { keys:["musique","chanson","music"], answer:"Le module MUSIC est réservé à ton parcours. Il contient la musique préparée pour ton anniversaire. Installe-toi et prends le temps de l’écouter. 🎂" },
            { keys:["emmanuel","créateur","createur"], answer:"Emmanuel est la personne qui a imaginé et construit cette expérience. Il a commencé à y travailler le 31 mai 2026 et a voulu garder des traces du chemin parcouru." },
            { keys:["qui es-tu","qui es tu","jessy","jessy ia"], answer:"Je suis JESSY IA, le noyau conversationnel local de MD11. Je garde le contexte de cette session, reconnais les sujets des modules et réponds à partir des informations intégrées à la mission. Je ne suis pas un accès illimité à Internet." },
            { keys:["11 novembre","11.11","anniversaire"], answer:"Le 11 novembre 2026 est la date de destination de la mission. Tout ce que tu vois converge vers ce jour." },
            { keys:["pourquoi","raison"], answer:"Parce qu’il voulait que cette journée ne ressemble pas à une simple page d’anniversaire." }
        ],
        normalize(text="") { return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); },
        answer(input="") {
            const clean=this.normalize(input);
            if(!clean) return "Je t'écoute.";
            this.memory.push({role:"user",text:input});
            if(clean.includes("bonjour") || clean.includes("salut")) return "Bonjour. Tu peux me parler normalement. Je t'écoute.";
            if(clean.includes("merci")) return "Avec plaisir. Continue à fouiller.";
            for(const item of this.knowledge){ if(item.keys.some(key=>clean.includes(this.normalize(key)))) return item.answer; }
            if(clean.includes("secret") || clean.includes("cache")) return "Certaines choses sont volontairement hors index. Tu devras les découvrir plutôt que me demander de tout révéler.";
            if(clean.includes("aide") || clean.includes("faire")) return "Je peux t'expliquer la Station, les Archives, les souvenirs et l'état de la mission. Pose-moi une question précise.";
            return "Je n'ai pas encore cette information dans mon Cognitive Core. Mais je peux apprendre ce qui sera officiellement ajouté à la mission.";
        },
        push(role,text){
            if(!DOM.jessyChatLog) return;
            const el=document.createElement("div");
            el.className=`jessy-chat__message jessy-chat__message--${role}`;
            el.textContent=text;
            DOM.jessyChatLog.appendChild(el);
            DOM.jessyChatLog.scrollTop=DOM.jessyChatLog.scrollHeight;
        },
        ask(input){
            const text=input.trim();
            if(!text) return;
            this.push("user",text);
            const answer=this.answer(text);
            this.push("jessy",answer);
            JessyIA.set(answer);
            AudioEngine.play("click",0.12);
        },
        init(){
            if(!DOM.jessyChatLog) return;
            DOM.jessyChatLog.replaceChildren();
            this.push("jessy","Tu peux me poser une vraie question. Je répondrai avec ce que je connais de MD11.");
        }
    };

    /* ============================================================
       PROLOGUE ENGINE
       ============================================================ */

    const Prologue = {
        video: null,
        async start() {
            if (state.missionStarted) return;
            state.missionStarted = true;

            this.video = document.getElementById("entrySequenceVideo");
            const gate = document.getElementById("missionGate");
            const errorPanel = document.getElementById("entryVideoError");
            const continueButton = DOM.continueIndicator;

            if (!this.video) {
                this.showVideoError("VIDEO_ELEMENT_MISSING");
                return;
            }

            // The click is a genuine user gesture, so the browser can allow sound.
            AudioEngine.unlocked = true;
            try {
                this.video.pause();
                this.video.currentTime = 0;
                this.video.muted = false;
                this.video.volume = 1;
                this.video.controls = false;
                this.video.playsInline = true;

                gate?.classList.add("is-hidden");
                if (errorPanel) errorPanel.hidden = true;

                const playResult = this.video.play();
                if (playResult && typeof playResult.then === "function") {
                    await playResult;
                }

                this.video.onended = () => {
                    state.prologueComplete = true;
                    continueButton?.removeAttribute("hidden");
                    continueButton?.classList.add("is-visible");
                    continueButton?.setAttribute("aria-hidden", "false");
                };

                this.video.onerror = () => {
                    this.showVideoError("VIDEO_LOAD_OR_DECODE_ERROR");
                };

                this.video.onstalled = () => {
                    console.warn("MD11 ENTRY VIDEO STALLED", this.video?.currentSrc);
                };

                console.info("MD11 ENTRY VIDEO PLAYING", {
                    src: this.video.currentSrc || this.video.src,
                    muted: this.video.muted,
                    volume: this.video.volume
                });
            } catch (error) {
                console.error("MD11 ENTRY VIDEO START FAILED", {
                    name: error?.name,
                    message: error?.message,
                    src: this.video.currentSrc || this.video.src
                });
                this.showVideoError(error?.name || "VIDEO_PLAY_FAILED");
            }
        },

        showVideoError(code) {
            const errorPanel = document.getElementById("entryVideoError");
            const gate = document.getElementById("missionGate");
            if (gate) gate.classList.remove("is-hidden");
            if (errorPanel) {
                errorPanel.hidden = false;
                const previous = errorPanel.querySelector("[data-error-code]");
                if (previous) previous.remove();
                const codeLine = document.createElement("small");
                codeLine.dataset.errorCode = "true";
                codeLine.textContent = `Diagnostic : ${code}`;
                errorPanel.appendChild(codeLine);
            }
        },

        retry() {
            state.missionStarted = false;
            const errorPanel = document.getElementById("entryVideoError");
            if (errorPanel) errorPanel.hidden = true;
            this.start();
        },

        async continue() {
            if (!state.prologueComplete) return;
            AudioEngine.unlocked = true;

            try {
                this.video?.pause();
                this.video?.removeAttribute("src");
                this.video?.load();
            } catch (error) {
                console.debug("MD11 — video cleanup skipped", error);
            }

            DOM.continueIndicator?.classList.remove("is-visible");
            DOM.continueIndicator?.setAttribute("aria-hidden", "true");
            DOM.prologue?.classList.add("is-transitioning");

            await wait(CONFIG.timings.transitionBlack);
            setScreen("bootScreen");
            await Boot.start();
        }
    };

    /* ============================================================
       BOOT ENGINE
       ============================================================ */

    const Boot = {
        async start() {
            DOM.bootLines.forEach(line => line.classList.remove("is-visible"));

            if (DOM.bootProgressBar) {
                DOM.bootProgressBar.style.width = "0%";
            }

            for (let index = 0; index < DOM.bootLines.length; index += 1) {
                DOM.bootLines[index].classList.add("is-visible");
                DOM.bootLines[index].scrollIntoView({ block: "nearest", behavior: "instant" });
                AudioEngine.play("click", 0.13);
                JessyIA.say(index === 4 ? "EMOTIONAL CORE… je vois bien pourquoi cette ligne refuse de rester silencieuse." : index === 5 ? "JESSY IA ONLINE. Je t'attendais." : `MODULE ${index + 1} // INITIALISATION`, 900);

                const progress = ((index + 1) / DOM.bootLines.length) * 100;
                if (DOM.bootProgressBar) {
                    DOM.bootProgressBar.style.width = `${progress}%`;
                }

                await wait(CONFIG.timings.bootLine);
            }

            await wait(CONFIG.timings.bootFinish);
            state.bootComplete = true;
            setScreen("aiIntro");
            await JessyIntro.start();
        }
    };

    /* ============================================================
       JESSY INTRO
       ============================================================ */

    const JessyIntro = {
        async start() {
            const first = "Je t’attendais, Jessica. Bonne arrivée. Et joyeux anniversaire, Emmanuel.";
            const second = "La mission peut enfin commencer.";

            DOM.aiLineOne.textContent = "";
            DOM.aiLineTwo.textContent = "";

            await wait(CONFIG.timings.aiIntroDelay);
            await this.type(DOM.aiLineOne, first, 34);
            await wait(CONFIG.timings.aiSecondLineDelay);
            await this.type(DOM.aiLineTwo, second, 34);
            await wait(1200);

            state.aiIntroComplete = true;
            setScreen("identityScreen");
        },

        async type(element, text, speed = 20) {
            if (!element) return;

            element.textContent = "";

            for (const character of text) {
                element.textContent += character;
                if (character.trim()) TypingAudio.play();
                await wait(speed);
            }
        }
    };

    /* ============================================================
       ACCESS ENGINE
       ============================================================ */

    const Access = {
        selectJessica() {
            AudioEngine.unlock();
            AudioEngine.play("click", 0.3);

            state.identityPath = "jessica";
            setScreen("jessicaAccess");
            DOM.codeStep01?.classList.add("is-active");
            DOM.codeStep02?.classList.remove("is-active");
            DOM.accessCode?.focus();
        },

        selectVisitor() {
            AudioEngine.unlock();
            AudioEngine.play("click", 0.3);

            state.identityPath = "visitor";
            setScreen("visitorAccess");
            feedback(DOM.identityMessage, "ACCÈS PUBLIC INITIALISÉ.");
        },

        normalizeCode(value) {
            return String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^A-Z0-9]/gi, "")
                .toUpperCase();
        },

        validateFirstCode() {
            const input = this.normalizeCode(DOM.accessCode?.value);
            const expected = this.normalizeCode(CONFIG.codes.first);

            if (input !== expected) {
                AudioEngine.play("click", 0.22);
                feedback(DOM.accessFeedback, "CODE 01 REFUSÉ.", "error");
                DOM.accessCode?.select();
                return;
            }

            state.firstCodeUnlocked = true;
            AudioEngine.play("click", 0.4);
            feedback(DOM.accessFeedback, "CODE 01 ACCEPTÉ.", "success");

            if (DOM.accessCode) DOM.accessCode.disabled = true;
            DOM.codeStep01?.classList.remove("is-active");
            DOM.codeStep02?.classList.add("is-active");
            DOM.accessSecondInput?.focus();
            updateSync(1);
        },

        validateSecondCode() {
            const input = this.normalizeCode(DOM.accessSecondInput?.value);
            const accepted = CONFIG.codes.second.some(code => this.normalizeCode(code) === input);

            if (!accepted) {
                AudioEngine.play("click", 0.22);
                feedback(DOM.accessSecondFeedback, "CODE 02 REFUSÉ.", "error");
                DOM.accessSecondInput?.select();
                return;
            }

            state.secondCodeUnlocked = true;
            AudioEngine.play("click", 0.42);
            feedback(DOM.accessSecondFeedback, "ACCÈS AU SYSTÈME AUTORISÉ", "success");

            if (DOM.accessSecondInput) DOM.accessSecondInput.disabled = true;
            updateSync(2);

            window.setTimeout(() => Station.enter(true), CONFIG.timings.accessDelay);
        },

        enterVisitor() {
            AudioEngine.unlock();
            AudioEngine.play("whoosh", 0.4);
            Station.enter(false);
        }
    };

    /* ============================================================
       STATION / HUB
       ============================================================ */

    const Station = {
        enter(verified) {
            const songControls = document.querySelector(".song-volume");
            if (songControls) songControls.hidden = !verified;
            if (verified) {
                DOM.stationIdentity.textContent = "IDENTITY : VERIFIED";
                JessyIA.set("Tu es enfin entrée.");
            } else {
                DOM.stationIdentity.textContent = "IDENTITY : PUBLIC";
                JessyIA.set("Tu peux regarder. Pas tout.");
            }

            setScreen("station");
            updateSync(verified ? 2 : 0);
            if (verified && state.secondCodeUnlocked) AudioEngine.prepareSong();

            window.setTimeout(() => {
                if (verified) {
                    JessyIA.set("Je resterai avec toi pendant la suite.");
                } else {
                    JessyIA.set("Certaines portes savent qui elles attendent.");
                }
            }, CONFIG.timings.stationEntry);
        }
    };

    /* ============================================================
       MODULE ENGINE
       ============================================================ */

    const ModuleEngine = {
        open(module) {
            if (!module) return;
            AudioEngine.play("click", 0.28);
            const publicMode = state.identityPath !== "jessica" || !state.secondCodeUnlocked;
            const hints = {
                archives: "Les archives racontent comment MD11 a pris forme. L’album est rangé ici, pas sur l’écran d’accueil.",
                memories: publicMode ? "Les souvenirs personnels attendent derrière les deux codes." : "Prends ton temps. Chaque image a sa place dans cette histoire.",
                missions: "Voici les étapes de la mission et les traces qui les relient.",
                music: "Le fond sonore est prêt. La chanson d’anniversaire finale sera ajoutée quand Emmanuel l’aura générée.",
                classified: publicMode ? "Accès refusé. Ce dossier est réservé au parcours Jessica." : "Dossier classifié ouvert. Ces éléments font partie de la surprise privée.",
                transmission: publicMode ? "La transmission finale est réservée au parcours Jessica." : "Dernière étape : la transmission personnelle."
            };
            JessyIA.say(hints[module] || "J’analyse cette section.");
            const idx = {archives:"01", memories:"02", missions:"03", music:"04", classified:"05", transmission:"06"}[module] || "00";
            DOM.moduleWindowCode.textContent = `MODULE // ${idx}`;
            DOM.moduleWindowTitle.textContent = ({archives:"ARCHIVES", memories:"SOUVENIRS", missions:"MISSIONS", music:"MUSIC", classified:"CLASSIFIED", transmission:"TRANSMISSION"})[module] || "MODULE";
            if (module === "archives") { this.openArchiveHub(); return; }
            if (module === "music" && publicMode) {
                DOM.moduleContent.innerHTML = `<section class="md11-content-card"><p class="archive-section-label">IDENTITY CHECK</p><h3>Cette musique attend Jessica.</h3><p>La transmission musicale fait partie de la surprise personnelle.</p></section>`;
                this.openLayer(); return;
            }
            if (module === "memories" && !publicMode) { this.openAlbum(); return; }
            if (module === "classified" && !publicMode) { this.renderClassified(); return; }
            if (module === "music") { this.renderMusic(); return; }
            if (module === "missions") { this.renderMissions(); return; }
            if (module === "transmission" && !publicMode) { this.renderTransmission(); return; }
            if (module === "memories" || module === "classified" || module === "transmission") {
                DOM.moduleContent.innerHTML = `<section class="md11-content-card"><p class="archive-section-label">ACCESS CONTROL</p><h3>ACCÈS RESTREINT</h3><p>Cette section est disponible uniquement après validation des deux codes du parcours Jessica.</p></section>`;
            }
            this.openLayer();
        },

        openArchiveHub() {
            const publicMode = state.identityPath !== "jessica" || !state.secondCodeUnlocked;
            DOM.moduleContent.innerHTML = `<section class="md11-content-card archive-hub"><p class="archive-section-label">ARCHIVES // INDEX</p><h3>Les traces du projet</h3><p>Le 31 mai 2026, une idée est devenue une mission. Choisis une section pour parcourir son histoire.</p><div class="archive-hub__actions"><button class="md11-button" data-md11-action="origin">ARCHIVE 001 — ORIGINE</button><button class="md11-button" data-md11-action="album">ALBUM PHOTO ${publicMode ? "(ACCÈS JESSICA)" : ""}</button><button class="md11-button" data-md11-action="videos">VIDÉOS / SOUVENIRS ${publicMode ? "(ACCÈS JESSICA)" : ""}</button></div><div class="timeline-grid"><div><span>31 MAI 2026</span><strong>NAISSANCE DE L’IDÉE</strong></div><div><span>JUILLET 2026</span><strong>PREMIÈRES TRACES VISUELLES</strong></div><div><span>AOÛT 2026</span><strong>CONSTRUCTION DU MONDE</strong></div><div><span>SEPTEMBRE–OCTOBRE</span><strong>ASSEMBLAGE ET TESTS</strong></div><div><span>11 NOVEMBRE 2026</span><strong>TRANSMISSION</strong></div></div></section>`;
            this.openLayer();
            DOM.moduleContent.querySelectorAll("[data-md11-action]").forEach(btn => btn.addEventListener("click", () => {
                const action=btn.dataset.md11Action;
                if(action === "origin") this.openArchive001();
                else if(action === "album") { if(publicMode) this.showLocked(); else this.openAlbum(); }
                else if(action === "videos") { if(publicMode) this.showLocked(); else this.openVideos(); }
            }));
        },

        showLocked() {
            DOM.moduleContent.innerHTML = `<section class="md11-content-card"><p class="archive-section-label">IDENTITY CHECK</p><h3>Cette porte attend Jessica.</h3><p>Le contenu personnel est réservé au parcours qui valide les deux codes.</p><button class="md11-button" data-md11-action="back-archives">RETOUR AUX ARCHIVES</button></section>`;
            DOM.moduleContent.querySelector("[data-md11-action]")?.addEventListener("click",()=>this.openArchiveHub());
        },

        openAlbum() {
            const publicMode = state.identityPath !== "jessica" || !state.secondCodeUnlocked;
            if (publicMode) { this.showLocked(); this.openLayer(); return; }
            Promise.resolve(window.MD11_COLLECTION).then(manifest=>{
                const photos=Array.isArray(manifest.photos) ? manifest.photos : [];
                if (!photos.length) {
                    DOM.moduleContent.innerHTML='<section class="md11-content-card"><h3>Album indisponible</h3><p>Aucune photo n’est référencée dans la collection.</p><button class="md11-button" data-album="back">← RETOUR AUX ARCHIVES</button></section>';
                    DOM.moduleContent.querySelector('[data-album="back"]')?.addEventListener('click',()=>this.openArchiveHub());
                    this.openLayer();
                    return;
                }
                let page=0;
                const render=()=>{
                    const item=photos[page];
                    DOM.moduleContent.innerHTML=`<section class="birthday-album"><div class="album-floral-corner" aria-hidden="true">✿ ❀ 🌹</div><p class="album-kicker">COLLECTION PRIVÉE // SOUVENIRS</p><h3>Album de Jessica</h3><p class="album-intro">Des fragments de souvenirs, conservés avec soin.</p><div class="album-page"><div class="album-photo-frame"><img src="${item.src}" alt="${item.caption.replaceAll('"','&quot;')}" loading="lazy" decoding="async"></div><div class="album-photo-note"><span>${item.category}</span><h4>${item.caption}</h4><p>Un instant parmi d’autres, gardé dans les archives de MD11.</p></div><div class="album-page-count">PAGE ${String(page+1).padStart(2,'0')} / ${String(photos.length).padStart(2,'0')}</div></div><div class="album-controls"><button class="md11-button" data-album="prev" ${page===0?'disabled':''}>← PRÉCÉDENTE</button><span>${page+1} / ${photos.length}</span><button class="md11-button" data-album="next" ${page===photos.length-1?'disabled':''}>SUIVANTE →</button></div><div class="album-thumbnails">${photos.map((p,i)=>`<button data-album-page="${i}" class="album-thumb ${i===page?'is-current':''}" aria-label="Aller à la page ${i+1}"><img src="${p.src}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div><button class="md11-button album-back" data-album="back">← RETOUR AUX ARCHIVES</button></section>`;
                    DOM.moduleContent.querySelector('[data-album="prev"]')?.addEventListener('click',()=>{page=Math.max(0,page-1);render();});
                    DOM.moduleContent.querySelector('[data-album="next"]')?.addEventListener('click',()=>{page=Math.min(photos.length-1,page+1);render();});
                    DOM.moduleContent.querySelector('[data-album="back"]')?.addEventListener('click',()=>this.openArchiveHub());
                    DOM.moduleContent.querySelectorAll('[data-album-page]').forEach(b=>b.addEventListener('click',()=>{page=Number(b.dataset.albumPage);render();}));
                }; render(); this.openLayer();
            }).catch(error=>{console.error('MD11 — ALBUM MANIFEST LOAD FAILED',error);DOM.moduleContent.innerHTML=`<section class="md11-content-card"><h3>Album momentanément indisponible</h3><p>Le fichier de collection n’a pas pu être chargé. Vérifie que le site est ouvert depuis son adresse HTTPS ou via un serveur local, et non directement depuis un fichier ZIP.</p><small>DIAGNOSTIC : ${String(error?.message||error).replace(/[<>]/g,'')}</small><button class="md11-button" data-album="back">← RETOUR AUX ARCHIVES</button></section>`;DOM.moduleContent.querySelector('[data-album="back"]')?.addEventListener('click',()=>this.openArchiveHub());this.openLayer();});
        },

        openVideos() {
            const publicMode = state.identityPath !== "jessica" || !state.secondCodeUnlocked;
            if (publicMode) { this.showLocked(); this.openLayer(); return; }
            Promise.resolve(window.MD11_COLLECTION).then(manifest=>{
                DOM.moduleContent.innerHTML=`<section class="md11-content-card"><p class="archive-section-label">VIDEO ARCHIVE // PRIVATE</p><h3>Fragments en mouvement</h3><p>Une seule vidéo peut être lue à la fois. Les clips ne démarrent pas automatiquement.</p><div class="video-collection">${(manifest.videos||[]).map((v,i)=>`<article class="video-card"><video controls preload="none" playsinline src="${v.src}"></video><p>FRAGMENT ${String(i+1).padStart(2,'0')}</p><small>${v.caption}</small></article>`).join('')}</div><button class="md11-button" data-md11-action="back">← RETOUR AUX ARCHIVES</button></section>`;
                DOM.moduleContent.querySelectorAll('video').forEach(video=>video.addEventListener('play',()=>DOM.moduleContent.querySelectorAll('video').forEach(other=>{if(other!==video)other.pause();})));
                DOM.moduleContent.querySelector('[data-md11-action="back"]')?.addEventListener('click',()=>this.openArchiveHub());this.openLayer();
            }).catch(error=>{console.error("MD11 — VIDEO COLLECTION FAILED",error);DOM.moduleContent.innerHTML=`<section class="md11-content-card"><h3>Collection vidéo indisponible</h3><p>Le catalogue local n’a pas été initialisé. Recharge le site depuis son dossier complet.</p><small>${String(error?.message||error).replace(/[<>]/g,"")}</small></section>`;this.openLayer();});
        },

        renderMissions() {
            DOM.moduleContent.innerHTML=`<section class="md11-content-card"><p class="archive-section-label">MISSION LOG // 2026</p><h3>Une idée devenue expérience</h3><p>Je n’ai pas voulu inventer de fausses étapes : voici les dates de travail et les traces que j’ai réellement consignées.</p><div class="mission-list">
            <article><b>31 MAI 2026 — INITIALISATION</b><p>Je note l’idée de créer une surprise qui dépasse un simple message d’anniversaire.</p></article>
            <article><b>27 JUILLET & 17 AOÛT — ARCHIVES</b><p>J’ajoute des souvenirs visuels aux archives du projet.</p></article>
            <article><b>18 AOÛT — COULISSES</b><p>Je conserve deux captures de mon écran pendant que je travaille sur le site.</p></article>
            <article><b>26–27 AOÛT — REPRISE</b><p>Je reprends la construction et je précise la direction immersive de MD11.</p></article>
            <article><b>04–10 SEPTEMBRE — MOTEUR</b><p>Je poursuis le travail sur l’interface, la narration et les modules.</p></article>
            <article><b>17–24 SEPTEMBRE — CONSOLIDATION</b><p>Je verrouille des choix visuels et je continue l’intégration.</p></article>
            <article><b>30 OCTOBRE — ASSEMBLAGE FINAL</b><p>Je réunis les éléments, corrige les parcours et prépare la transmission.</p></article>
            <article><b>11 NOVEMBRE — DESTINATION</b><p>Le jour où je souhaite que tout prenne enfin son sens.</p></article>
            </div></section>`;this.openLayer();
        },

        renderMusic() {
            const img = 'assets/music-jessica-portrait.png';
            DOM.moduleContent.innerHTML=`<section class="music-room"><div class="music-portrait"><img src="${img}" alt="Portrait de Jessica, le visage partiellement caché par sa main"></div><div class="music-copy"><p class="archive-section-label">MUSIC TRANSMISSION</p><h3>Joyeux anniversaire Jessica</h3><p>Que cette journée soit aussi lumineuse que ton sourire. 🎂</p><audio controls autoplay preload="auto" data-md11-song-player src="audio/music/birthday-song.mp3"></audio><p class="music-status">TRANSMISSION MUSICALE // QUE L’AUBE TE SOURIT</p><p class="music-autoplay-note">Si la lecture ne démarre pas automatiquement, touche simplement Lecture.</p></div></section>`;this.openLayer();const birthdayPlayer=DOM.moduleContent.querySelector("[data-md11-song-player]");if(birthdayPlayer){birthdayPlayer.volume=state.songVolume??0.75;const playAttempt=birthdayPlayer.play();if(playAttempt?.catch)playAttempt.catch(()=>{birthdayPlayer.controls=true;});birthdayPlayer.addEventListener("ended",()=>{document.body.classList.add("md11-song-finished");},{once:true});}
        },

        renderClassified() {
            DOM.moduleContent.innerHTML=`<section class="md11-content-card classified-room"><p class="archive-section-label">CLASSIFIED // ACCESS GRANTED</p><h3>Les fragments réservés</h3><p>Ces éléments appartiennent au parcours personnel. Ils ne sont pas exposés depuis l’accès public.</p><div class="classified-grid"><article><b>PRIVATE PHOTO COLLECTION</b><p>Les portraits et souvenirs se trouvent dans l’Album.</p><button class="md11-button" data-go="album">OUVRIR L’ALBUM</button></article><article><b>VIDEO MEMORY BANK</b><p>Les fragments vidéo sont regroupés séparément pour être parcourus manuellement.</p><button class="md11-button" data-go="videos">OUVRIR LES VIDÉOS</button></article><article><b>FINAL TRANSMISSION</b><p>Le dernier message sera préparé avec la version chantée définitive.</p></article></div></section>`;
            DOM.moduleContent.querySelector('[data-go="album"]')?.addEventListener('click',()=>this.openAlbum());DOM.moduleContent.querySelector('[data-go="videos"]')?.addEventListener('click',()=>this.openVideos());this.openLayer();
        },

        renderTransmission() {
            DOM.moduleContent.innerHTML=`<section class="md11-content-card transmission-room"><p class="archive-section-label">FINAL TRANSMISSION // 11.11</p><h3>🎂🎉 Je t’attendais, Jessica.</h3><p>Bonne arrivée et joyeux anniversaire ! 🥳💙</p><p>Je voulais que tu puisses découvrir chaque détail à ton rythme. Cette journée est à toi.</p><button class="md11-button" data-go="archives">RETOUR AUX ARCHIVES</button></section>`;DOM.moduleContent.querySelector('[data-go="archives"]')?.addEventListener('click',()=>this.openArchiveHub());this.openLayer();
        },

        openArchive001() {
            const fragment = DOM.archiveTemplate?.content.cloneNode(true);
            if (!fragment) return;

            DOM.moduleWindowCode.textContent = "ARCHIVE // 001";
            DOM.moduleWindowTitle.textContent = "ORIGIN OF MD11";
            DOM.moduleContent.replaceChildren(fragment);
            this.openLayer();

            state.archive001Open = true;
            Archive001.init(DOM.moduleContent);
            AudioEngine.play("zoom", CONFIG.audio.zoom);
            JessyIA.onArchiveOpen();
            updateSync(Math.max(state.sync, 3));
        },

        openLayer() {
            DOM.moduleLayer.classList.add("is-open");
            DOM.moduleLayer.setAttribute("aria-hidden", "false");
            DOM.moduleWindow.setAttribute("aria-hidden", "false");
        },

        close() {
            DOM.moduleLayer.classList.remove("is-open");
            DOM.moduleLayer.setAttribute("aria-hidden", "true");
            DOM.moduleWindow.setAttribute("aria-hidden", "true");
            DOM.moduleContent.replaceChildren();
            state.archive001Open = false;
        }
    };

    /* ============================================================
       ARCHIVE 001
       ============================================================ */

    const Archive001 = {
        init(root) {
            const elapsed = $("#archiveElapsedDays", root);
            const reveal = $("#revealMemoryButton", root);
            const hidden = $("#hiddenMemory", root);
            const secret = $("#archiveSecret", root);
            const returnButton = $("#archiveReturn", root);
            const complete = $("#archiveComplete", root);

            this.updateElapsedDays(elapsed);
            this.bindImageDiagnostics(root);
            this.bindPhotos(root);

            reveal?.addEventListener("click", () => {
                if (state.secretFound) return;

                state.secretFound = true;
                hidden?.classList.add("is-revealed");
                hidden?.setAttribute("aria-hidden", "false");
                secret?.classList.add("is-revealed");

                updateSync(4);
                notify("UNREGISTERED MEMORY DETECTED");
                AudioEngine.play("click", CONFIG.audio.click);
                JessyIA.onSecret();
            });

            returnButton?.addEventListener("click", () => {
                state.archive001Complete = true;
                ModuleEngine.close();
                JessyIA.onArchiveReturn();
                notify("ARCHIVE // 001 COMPLETE");
            });

            complete?.classList.add("is-complete");
        },

        bindPhotos(root) {
            $$('[data-photo]', root).forEach(card => {
                card.addEventListener("click", () => {
                    const metadata = {
                        src: card.dataset.photo,
                        code: card.dataset.photoCode,
                        caption: card.dataset.photoCaption
                    };

                    PhotoViewer.open(metadata);
                });
            });
        },

        bindImageDiagnostics(root) {
            $$('img[data-asset-date]', root).forEach(image => {
                const key = image.dataset.assetDate || image.src;
                image.addEventListener("load", () => {
                    state.diagnostics.images[key] = "READY";
                });
                image.addEventListener("error", () => {
                    state.diagnostics.images[key] = "MISSING";
                    image.closest(".memory-fragment")?.classList.add("asset-missing");
                });
            });
        },

        updateElapsedDays(element) {
            if (!element) return;

            const start = new Date(CONFIG.projectStart);
            const now = new Date();
            const milliseconds = Math.max(0, now.getTime() - start.getTime());
            const days = Math.floor(milliseconds / 86400000);

            element.textContent = String(days).padStart(3, "0");
        }
    };

    /* ============================================================
       PHOTO VIEWER
       ============================================================ */

    const PhotoViewer = {
        open(metadata = {}) {
            if (!DOM.photoModal || !DOM.photoModalImage) return;

            DOM.photoModalImage.src = metadata.src || "";
            DOM.photoModalImage.alt = metadata.code || "Memory";
            DOM.photoModalCode.textContent = metadata.code || "MEMORY // 000";
            const privateView = state.identityPath === "jessica" && state.secondCodeUnlocked;
            DOM.photoModalCaption.textContent = privateView ? (metadata.caption || "") : "";

            DOM.photoModal.classList.add("is-open");
            DOM.photoModal.setAttribute("aria-hidden", "false");
            AudioEngine.play("zoom", 0.3);
            JessyIA.onPhotoOpen(metadata);
        },

        close() {
            DOM.photoModal?.classList.remove("is-open");
            DOM.photoModal?.setAttribute("aria-hidden", "true");
        }
    };

    /* ============================================================
       DIAGNOSTICS
       ============================================================ */

    const Diagnostics = {
        run() {
            const report = {
                screen: state.screen,
                audio: { ...state.diagnostics.audio },
                images: { ...state.diagnostics.images },
                codes: {
                    first: Access.normalizeCode(CONFIG.codes.first),
                    second: CONFIG.codes.second.map(Access.normalizeCode)
                },
                song: {
                    available: state.songAvailable,
                    volume: state.songVolume
                }
            };

            console.groupCollapsed("MD11 — DIAGNOSTICS");
            console.table(report.audio);
            console.table(report.images);
            console.log(report);
            console.groupEnd();

            return report;
        }
    };

    /* ============================================================
       EVENTS
       ============================================================ */

    function bindEvents() {
        DOM.startButton?.addEventListener("click", () => {
            Prologue.start();
        });

        document.getElementById("entryVideoRetry")?.addEventListener("click", () => {
            Prologue.retry();
        });

        document.getElementById("entryVideoSkip")?.addEventListener("click", () => {
            const video = document.getElementById("entrySequenceVideo");
            if (video) video.pause();
            state.prologueComplete = true;
            DOM.continueIndicator?.removeAttribute("hidden");
            DOM.continueIndicator?.classList.add("is-visible");
            DOM.continueIndicator?.setAttribute("aria-hidden", "false");
            const panel = document.getElementById("entryVideoError");
            if (panel) panel.hidden = true;
        });

        DOM.continueIndicator?.addEventListener("click", () => {
            Prologue.continue();
        });

        DOM.jessicaPathButton?.addEventListener("click", () => {
            Access.selectJessica();
        });

        DOM.visitorPathButton?.addEventListener("click", () => {
            Access.selectVisitor();
        });

        // Use input rather than keydown: this also supports mobile keyboards and pasted text,
        // and avoids playing the same click twice for one character.
        const bindTypingSound = input => {
            if (!input) return;
            input.addEventListener("input", event => {
                if (event.inputType && event.inputType.startsWith("insert") && event.data) {
                    for (const character of event.data) {
                        if (!character.trim()) continue;
                        TypingAudio.play();
                    }
                }
            });
        };
        bindTypingSound(DOM.accessCode);
        bindTypingSound(DOM.accessSecondInput);
        bindTypingSound(DOM.jessyChatInput);
        DOM.accessBackButton = document.getElementById("accessBackButton");
        DOM.accessSecondBackButton = document.getElementById("accessSecondBackButton");
        DOM.accessBackButton?.addEventListener("click", () => { AudioEngine.play("click", 0.25); setScreen("identityScreen"); });
        DOM.accessSecondBackButton?.addEventListener("click", () => { AudioEngine.play("click", 0.25); state.firstCodeUnlocked=false; DOM.accessCode.disabled=false; DOM.accessCode.value=""; DOM.accessSecondInput.value=""; DOM.codeStep01.classList.add("is-active"); DOM.codeStep02.classList.remove("is-active"); DOM.accessSecondInput.disabled=false; DOM.accessCode.focus(); });

        DOM.accessForm?.addEventListener("submit", event => {
            event.preventDefault();
            Access.validateFirstCode();
        });

        DOM.accessSecondForm?.addEventListener("submit", event => {
            event.preventDefault();
            Access.validateSecondCode();
        });

        DOM.visitorContinueButton?.addEventListener("click", () => {
            Access.enterVisitor();
        });

        $$(".station-module").forEach(button => {
            button.addEventListener("click", () => {
                ModuleEngine.open(button.dataset.module);
            });
        });

        DOM.moduleCloseButton?.addEventListener("click", () => ModuleEngine.close());
        DOM.moduleBackdrop?.addEventListener("click", () => ModuleEngine.close());
        DOM.photoModalClose?.addEventListener("click", () => PhotoViewer.close());
        DOM.photoModalBackdrop?.addEventListener("click", () => PhotoViewer.close());

        DOM.songVolume?.addEventListener("input", event => {
            AudioEngine.setSongVolume(event.target.value);
        });

        DOM.jessyChatForm?.addEventListener("submit", event => {
            event.preventDefault();
            AudioEngine.unlock();
            JessyCore.ask(DOM.jessyChatInput?.value || "");
            if (DOM.jessyChatInput) DOM.jessyChatInput.value = "";
            DOM.jessyChatInput?.focus();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                PhotoViewer.close();
                ModuleEngine.close();
            }
        });

        window.addEventListener("error", event => {
            console.error("MD11 — RUNTIME ERROR", event.error || event.message);
        });

        window.addEventListener("unhandledrejection", event => {
            console.error("MD11 — ASYNC ERROR", event.reason);
        });

        EventBus.on("screenchange", event => {
            document.body.dataset.md11Screen = event.detail.screen;
        });
    }

    /* ============================================================
       BOOTSTRAP
       ============================================================ */

    function init() {
        if (!assertCriticalDOM()) return;

        AudioEngine.init();
        JessyCore.init();
        bindEvents();
        setScreen("prologue");
        updateSync(0);

        console.log("MD11 — RUNTIME READY");
        console.log("MD11 — CODE 02 accepts both AIDA235 and AÏDA235.");
        Diagnostics.run();
    }

    document.addEventListener("DOMContentLoaded", init, { once: true });

    window.MD11 = Object.freeze({
        config: CONFIG,
        state,
        audio: AudioEngine,
        ai: JessyIA,
        cognitiveCore: JessyCore,
        diagnostics: Diagnostics,
        screens: { set: setScreen },
        station: Station,
        modules: ModuleEngine,
        archive001: Archive001
    });
})();
