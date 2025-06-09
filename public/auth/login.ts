// public/auth/login.ts

document.addEventListener('DOMContentLoaded', (): void => {
  const btn = document.getElementById('google-signin') as HTMLButtonElement;
  const loading = document.getElementById('loading') as HTMLElement;
  const errorDiv = document.getElementById('error') as HTMLElement;

  if (!btn || !loading || !errorDiv) {
    console.error('Required DOM elements not found');
    return;
  }

  btn.addEventListener('click', (): void => {
    try {
      btn.style.display = 'none';
      loading.style.display = 'block';
      errorDiv.style.display = 'none';

      // 1) Base Supabase URL
      const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';

      // 2) Where we want to end up after Supabase has exchanged the code
      const callback = `${window.location.origin}/auth/callback.html`;

      // 3) Build the authorize URL (code flow → gets refresh_token)
      const authUrl = 
        `${SUPA_URL}/auth/v1/authorize` +
        `?provider=google` +
        `&redirect_to=${encodeURIComponent(callback)}` +
        `&access_type=offline` +      // request refresh token
        `&prompt=consent` +           // force consent screen
        `&scopes=${encodeURIComponent('email profile https://www.googleapis.com/auth/gmail.readonly')}`;

      console.log('Redirecting to:', authUrl);

      // 4) Fire!
      window.location.href = authUrl;
    } catch (error) {
      console.error('Login error:', error);
      showError(error instanceof Error ? error.message : 'Failed to initiate login');
      
      btn.style.display = 'flex';
      loading.style.display = 'none';
    }
  });

  function showError(message: string): void {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
});