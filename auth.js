// User authentication
const Auth = {
  modal: null,
  form: null,
  mode: 'login',

  init() {
    this.modal = document.getElementById('authModal');
    this.form = document.getElementById('authForm');
    this.attachEvents();
    this.updateUI();
  },

  attachEvents() {
    document.getElementById('authBtn')?.addEventListener('click', () => this.open());
    document.querySelectorAll('[data-close-modal]').forEach(b => {
      b.addEventListener('click', () => this.close());
    });
    document.querySelectorAll('[data-auth-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        this.mode = tab.dataset.authTab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const title = document.getElementById('authTitle');
        const submit = document.getElementById('authSubmit');
        if (this.mode === 'login') {
          title.textContent = t('signIn');
          submit.textContent = t('signIn');
        } else {
          title.textContent = t('signUp');
          submit.textContent = t('signUp');
        }
      });
    });
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('deleteDataBtn')?.addEventListener('click', () => {
      if (confirm(document.documentElement.lang === 'ar' ? 'حذف جميع البيانات المحلية؟' : 'Delete all local data?')) {
        Storage.clearHistory();
        Storage.setAuth(null);
        this.updateUI();
        showToast(t('cleared'));
      }
    });
  },

  open() {
    const auth = Storage.getAuth();
    if (auth) {
      // Show account info/logout
      document.getElementById('logoutBtn').style.display = '';
    } else {
      this.modal.style.display = 'flex';
    }
  },

  close() {
    this.modal.style.display = 'none';
    document.getElementById('authError').style.display = 'none';
    this.form?.reset();
  },

  async handleSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmit');

    errorEl.style.display = 'none';
    submitBtn.disabled = true;

    try {
      const endpoint = this.mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'authFailed');
      }
      Storage.setAuth({ token: data.token, userId: data.userId, email: data.email });
      this.close();
      this.updateUI();
      showToast(this.mode === 'login' ? t('loginSuccess') : t('signupSuccess'));
    } catch (err) {
      errorEl.textContent = err.message === 'Email already exists' ? t('emailExists') : t('invalidCreds');
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  },

  logout() {
    Storage.setAuth(null);
    this.updateUI();
    showToast(t('logoutSuccess'));
  },

  updateUI() {
    const auth = Storage.getAuth();
    const logoutBtn = document.getElementById('logoutBtn');
    if (auth) {
      document.getElementById('authBtn').style.opacity = '1';
      if (logoutBtn) logoutBtn.style.display = '';
    } else {
      document.getElementById('authBtn').style.opacity = '';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  },

  isLoggedIn() {
    return !!Storage.getAuth();
  }
};
