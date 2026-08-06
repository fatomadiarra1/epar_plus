/* =====================================================================
   ÉPARGNE PLUS — Login page controller
   ===================================================================== */
(function () {
  /* If already logged in, redirect to the right dashboard */
  const existing = Auth.session();
  if (existing) { location.href = existing.role === "admin" ? "admin.html" : "user.html"; return; }

  /* Theme toggle in corner */
  const slot = document.getElementById("themeSlot");
  if (slot) slot.appendChild(buildThemeToggle());

  const setupCard = document.getElementById("setupCard");
  const loginCard = document.getElementById("loginCard");

  /* =====================================================================
     FIRST LAUNCH — Setup form
     ===================================================================== */
  if (isFirstLaunch()) {
    setupCard.style.display = "";
    loginCard.style.display = "none";

    /* Toggle password visibility (setup) */
    [["s_password", "toggleSetupPwd"], ["s_password2", "toggleSetupPwd2"]].forEach(([fId, bId]) => {
      const field = document.getElementById(fId);
      const btn = document.getElementById(bId);
      btn.addEventListener("click", () => {
        const show = field.type === "password";
        field.type = show ? "text" : "password";
        btn.textContent = show ? "\uD83D\uDE48" : "\uD83D\uDC41\uFE0F";
      });
    });

    const setupForm = document.getElementById("setupForm");
    const setupBtn = document.getElementById("setupBtn");

    setupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const lastName  = document.getElementById("s_lastName").value.trim();
      const firstName = document.getElementById("s_firstName").value.trim();
      const login     = document.getElementById("s_login").value.trim();
      const password  = document.getElementById("s_password").value;
      const password2 = document.getElementById("s_password2").value;

      if (!lastName || !firstName || !login || !password) {
        toast("Veuillez remplir tous les champs", "warn"); return;
      }
      if (password.length < 4) {
        toast("Le mot de passe doit contenir au moins 4 caractères", "warn"); return;
      }
      if (password !== password2) {
        toast("Les mots de passe ne correspondent pas", "error"); return;
      }

      setupBtn.disabled = true;
      setupBtn.textContent = "Configuration en cours…";

      setTimeout(() => {
        initializeDB({ firstName, lastName, login, password });

        toast("Compte administrateur créé avec succès !", "success");

        /* Auto-login the admin */
        const session = Auth.login(login, password);
        if (session) {
          setTimeout(() => { location.href = "admin.html"; }, 800);
        } else {
          /* Fallback: show the login card */
          setupCard.style.display = "none";
          loginCard.style.display = "";
          setupBtn.disabled = false;
          setupBtn.textContent = "LANCER L'APPLICATION \u2192";
        }
      }, 500);
    });

    return; /* Stop here — login card listeners are not needed on first launch */
  }

  /* =====================================================================
     NORMAL FLOW — Login form
     ===================================================================== */
  setupCard.style.display = "none";
  loginCard.style.display = "";

  /* Hero live numbers */
  const stats = globalStats();
  const hero = document.getElementById("heroAmount");
  if (hero) animateCounter(hero, stats.totalSaved, { money: true, duration: 1400 });
  const hm = document.getElementById("heroMembers");
  if (hm) hm.textContent = `${stats.members} membres actifs`;
  const bars = document.getElementById("heroBars");
  if (bars) {
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("span");
      s.style.height = (20 + Math.random() * 80) + "%";
      s.style.animationDelay = (i * 0.06) + "s";
      bars.appendChild(s);
    }
  }

  /* Show / hide password */
  const pwd = document.getElementById("password");
  const toggle = document.getElementById("togglePwd");
  toggle.addEventListener("click", () => {
    const show = pwd.type === "password";
    pwd.type = show ? "text" : "password";
    toggle.textContent = show ? "\uD83D\uDE48" : "\uD83D\uDC41\uFE0F";
  });

  /* Remember me — prefill last login */
  const loginInput = document.getElementById("login");
  const remembered = localStorage.getItem("epp_remember");
  if (remembered) { loginInput.value = remembered; document.getElementById("remember").checked = true; }

  /* Forgot password */
  document.getElementById("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    modal({
      title: "Mot de passe oublié",
      body: "Pour réinitialiser votre mot de passe, veuillez contacter l'administrateur de votre groupe d'épargne.",
      confirmText: "J'ai compris", cancelText: "Fermer",
    });
  });

  /* Submit */
  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const login = loginInput.value.trim();
    const password = pwd.value;
    if (!login || !password) { toast("Veuillez remplir tous les champs", "warn"); return; }

    btn.disabled = true; btn.textContent = "Connexion…";

    setTimeout(() => {
      const session = Auth.login(login, password);
      if (!session) {
        btn.disabled = false; btn.textContent = "SE CONNECTER \u2192";
        toast("Identifiant ou mot de passe incorrect", "error");
        form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
        return;
      }
      if (document.getElementById("remember").checked) localStorage.setItem("epp_remember", login);
      else localStorage.removeItem("epp_remember");

      toast(`Bienvenue ${session.name} !`, "success");
      setTimeout(() => { location.href = session.role === "admin" ? "admin.html" : "user.html"; }, 600);
    }, 550);
  });
})();
