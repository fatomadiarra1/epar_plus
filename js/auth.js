/* =====================================================================
   ÉPARGNE PLUS — Login page controller (sécurisé)
   ---------------------------------------------------------------------
   CORRECTIONS :
   [1] Login async (PBKDF2) — on attend la résolution de la promesse
   [2] Affichage du message rate-limit à l'utilisateur
   [3] Politique de mot de passe appliquée à la création du compte
   [4] Page de login n'expose plus les statistiques financières réelles
   [5] Création admin uniquement si vraiment premier lancement
       (vérification côté données, pas seulement côté UI)
   ===================================================================== */
(function () {

  /* Redirection si déjà connecté */
  const existing = Auth.session();
  if (existing) {
    location.href = existing.role === "admin" ? "admin.html" : "user.html";
    return;
  }

  /* Thème */
  const slot = document.getElementById("themeSlot");
  if (slot) slot.appendChild(buildThemeToggle());

  const setupCard = document.getElementById("setupCard");
  const loginCard  = document.getElementById("loginCard");

  /* =====================================================================
     PREMIER LANCEMENT — formulaire de configuration
     ===================================================================== */
  if (isFirstLaunch()) {
    setupCard.style.display = "";
    loginCard.style.display  = "none";

    /* Afficher/masquer mot de passe */
    [["s_password","toggleSetupPwd"],["s_password2","toggleSetupPwd2"]].forEach(([fId,bId]) => {
      const field = document.getElementById(fId);
      const btn   = document.getElementById(bId);
      btn.addEventListener("click", () => {
        const show = field.type === "password";
        field.type = show ? "text" : "password";
        btn.textContent = show ? "🙈" : "👁️";
      });
    });

    const setupForm = document.getElementById("setupForm");
    const setupBtn  = document.getElementById("setupBtn");

    /* Indicateur de force du mot de passe */
    const pwdInput = document.getElementById("s_password");
    let   pwdStrengthEl = document.createElement("small");
    pwdStrengthEl.style.cssText = "display:block;margin-top:4px;font-size:.78rem";
    pwdInput.parentElement.after(pwdStrengthEl);

    pwdInput.addEventListener("input", () => {
      const err = PWD_POLICY.test(pwdInput.value);
      if (!pwdInput.value) { pwdStrengthEl.textContent = ""; return; }
      pwdStrengthEl.textContent = err || "✓ Mot de passe valide";
      pwdStrengthEl.style.color = err ? "var(--danger)" : "var(--success)";
    });

    setupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const lastName  = document.getElementById("s_lastName").value.trim();
      const firstName = document.getElementById("s_firstName").value.trim();
      const login     = sanitizeLogin(document.getElementById("s_login").value.trim());
      const password  = document.getElementById("s_password").value;
      const password2 = document.getElementById("s_password2").value;

      if (!lastName || !firstName || !login) {
        toast("Veuillez remplir tous les champs", "warn"); return;
      }
      if (!login) {
        toast("Identifiant invalide (lettres, chiffres, _ et - uniquement)", "warn"); return;
      }
      const pwdErr = PWD_POLICY.test(password);
      if (pwdErr) { toast(pwdErr, "warn"); return; }
      if (password !== password2) {
        toast("Les mots de passe ne correspondent pas", "error"); return;
      }

      setupBtn.disabled    = true;
      setupBtn.textContent = "Configuration en cours…";

      try {
        const pwdHash = await Crypto.hashPassword(password);
        initializeDB({ firstName, lastName, login, pwdHash });
        toast("Compte administrateur créé avec succès !", "success");

        /* Connexion automatique */
        const session = await Auth.login(login, password);
        if (session && !session.error) {
          setTimeout(() => { location.href = "admin.html"; }, 800);
        } else {
          setupCard.style.display  = "none";
          loginCard.style.display  = "";
          setupBtn.disabled        = false;
          setupBtn.textContent     = "LANCER L'APPLICATION →";
        }
      } catch (err) {
        console.error("Erreur setup :", err);
        toast("Erreur lors de la configuration", "error");
        setupBtn.disabled    = false;
        setupBtn.textContent = "LANCER L'APPLICATION →";
      }
    });

    return;
  }

  /* =====================================================================
     FLUX NORMAL — formulaire de connexion
     ===================================================================== */
  setupCard.style.display = "none";
  loginCard.style.display  = "";

  /* La page d'accueil n'expose PLUS les stats financières réelles.
     On affiche uniquement un compteur générique pour ne pas divulguer
     le total de l'épargne à des visiteurs non authentifiés. */
  const heroAmount  = document.getElementById("heroAmount");
  const heroMembers = document.getElementById("heroMembers");
  if (heroAmount)  heroAmount.textContent  = "— FCFA";
  if (heroMembers) heroMembers.textContent = "— membres actifs";

  /* Barres décoratives (sans données réelles) */
  const bars = document.getElementById("heroBars");
  if (bars) {
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("span");
      s.style.height         = (20 + Math.random() * 80) + "%";
      s.style.animationDelay = (i * 0.06) + "s";
      bars.appendChild(s);
    }
  }

  /* Afficher/masquer mot de passe */
  const pwd    = document.getElementById("password");
  const toggle = document.getElementById("togglePwd");
  toggle.addEventListener("click", () => {
    const show  = pwd.type === "password";
    pwd.type    = show ? "text" : "password";
    toggle.textContent = show ? "🙈" : "👁️";
  });

  /* Se souvenir de moi — stocke uniquement l'identifiant (pas le mdp) */
  const loginInput = document.getElementById("login");
  const remembered = localStorage.getItem("epp_remember");
  if (remembered) {
    loginInput.value = remembered;
    document.getElementById("remember").checked = true;
  }

  /* Mot de passe oublié */
  document.getElementById("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    modal({
      title       : "Mot de passe oublié",
      body        : "Pour réinitialiser votre mot de passe, veuillez contacter l'administrateur de votre groupe d'épargne.",
      confirmText : "J'ai compris",
      cancelText  : "Fermer",
    });
  });

  /* Soumission du formulaire */
  const form = document.getElementById("loginForm");
  const btn  = document.getElementById("loginBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const login    = loginInput.value.trim();
    const password = pwd.value;

    if (!login || !password) {
      toast("Veuillez remplir tous les champs", "warn"); return;
    }

    /* Vérification rate-limit côté client (doublon de la vérif serveur) */
    const block = RateLimit.check(login);
    if (block) {
      toast(block, "error"); return;
    }

    btn.disabled    = true;
    btn.textContent = "Connexion…";

    try {
      const session = await Auth.login(login, password);

      if (!session || session.error) {
        btn.disabled    = false;
        btn.textContent = "SE CONNECTER →";
        const msg = session?.error || "Identifiant ou mot de passe incorrect";
        toast(msg, "error");
        form.classList.remove("shake");
        void form.offsetWidth;
        form.classList.add("shake");
        return;
      }

      if (document.getElementById("remember").checked) {
        localStorage.setItem("epp_remember", login);
      } else {
        localStorage.removeItem("epp_remember");
      }

      toast(`Bienvenue ${session.name} !`, "success");
      setTimeout(() => {
        location.href = session.role === "admin" ? "admin.html" : "user.html";
      }, 600);

    } catch (err) {
      console.error("Erreur login :", err);
      btn.disabled    = false;
      btn.textContent = "SE CONNECTER →";
      toast("Erreur lors de la connexion", "error");
    }
  });

})();
