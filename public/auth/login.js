document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('google-signin');
  btn.addEventListener('click', () => {
    // 1) Base Supabase URL
    const SUPA_URL = 'https://zkglvdfppodwlgzhfgqs.supabase.co';

    // 2) Where we want to end up after Supabase has exchanged the code
    const callback = `${window.location.origin}/auth/callback.html`;
    const encoded = encodeURIComponent(callback);

    // 3) Build the authorize URL (code flow → gets refresh_token)
    const authUrl =
      `${SUPA_URL}/auth/v1/authorize` +
      `?provider=google` +
      `&redirect_to=${encoded}` +
      `&access_type=offline` +      // request refresh token
      `&prompt=consent` +           // force consent screen
      `&scopes=email profile https://www.googleapis.com/auth/gmail.readonly`;

    // 4) Fire!
    window.location.href = authUrl;
  });
});