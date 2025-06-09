// public/auth/login.js

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
      `&redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback.html')}` +
      `&access_type=offline` +      // request refresh token
      `&prompt=consent` +           // force consent screen
      `&scopes=email profile https://www.googleapis.com/auth/gmail.readonly`;

    // 4) Fire!
    window.location.href = authUrl;
  });
});


///// OLD???""""

// // Import from the local supabaseClient
// import { getSupabaseClient } from './supabaseClient.js';

// document.addEventListener('DOMContentLoaded', async () => {
//   const googleSigninBtn = document.getElementById('google-signin');
//   const loading = document.getElementById('loading');
//   const errorDiv = document.getElementById('error');

//   // Get extension ID from URL parameters
//   const urlParams = new URLSearchParams(window.location.search);
//   const extensionId = urlParams.get('extensionId');
//   console.log('This is window location: ', window.location.search);
//   // if (!extensionId) {
//   //   showError('Invalid request - missing extension ID');
//   //   return;
//   // }

//   googleSigninBtn.addEventListener('click', async () => {
//     try {
//       googleSigninBtn.style.display = 'none';
//       loading.style.display = 'block';
//       errorDiv.style.display = 'none';

//       console.log('Initializing Supabase...');
      
//       // Initialize Supabase
//       const supabase = await getSupabaseClient();
      
//       console.log('Supabase initialized, starting OAuth flow...');

//       // Sign in with Google using Supabase Auth
//       const { data, error } = await supabase.auth.signInWithOAuth({
//         provider: 'google',
//         options: {
//           redirectTo: `http://localhost:5173/auth/callback.html`,
//           queryParams: {
//             access_type: 'offline',
//             prompt: 'consent',
//           },
//           scopes: 'email profile https://www.googleapis.com/auth/gmail.readonly'
//         }
//       });

//       if (error) {
//         console.error('OAuth error:', error);
//         throw error;
//       }

//       console.log('OAuth initiated successfully');
//       // The redirect will happen automatically
//     } catch (error) {
//       console.error('Sign-in error:', error);
//       showError(error.message || 'Failed to sign in with Google');
      
//       googleSigninBtn.style.display = 'flex';
//       loading.style.display = 'none';
//     }
//   });

//   function showError(message) {
//     errorDiv.textContent = message;
//     errorDiv.style.display = 'block';
//   }
// });