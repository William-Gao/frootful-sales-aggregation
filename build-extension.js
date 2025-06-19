import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files and directories to include in the extension package
const extensionFiles = [
  // Core extension files
  'manifest.json',
  'PRIVACY_POLICY.md',
  'README.md',
  
  // Built extension scripts (from dist folder)
  'dist/background/',
  'dist/content/',
  'dist/popup/',
  'dist/sidebar/',
  'dist/onboarding/',
  
  // Static assets
  'icons/',
  
  // HTML files for extension
  'popup/popup.html',
  'popup/popup.css',
  'sidebar/sidebar.html', 
  'sidebar/sidebar.css',
  'onboarding/welcome.html',
  'onboarding/welcome.css',
  
  // Content relay script (not built by Vite)
  'content/contentRelay.js'
];

// Files and directories to exclude (SPA/backend code)
const excludePatterns = [
  'src/',
  'supabase/',
  'public/',
  'node_modules/',
  'dist/assets/',
  'dist/index.html',
  'dist/*.js', // Main SPA files
  'dist/*.css', // Main SPA styles
  '.env',
  '.git/',
  '.bolt/',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig*.json',
  'tailwind.config.js',
  'postcss.config.js',
  'eslint.config.js',
  'build-extension.js',
  '*.md' // Exclude other markdown files except the ones we specifically include
];

async function buildExtension() {
  console.log('🚀 Building Chrome Extension package...');
  
  // Ensure dist folder exists (should be built already)
  if (!fs.existsSync('dist')) {
    console.error('❌ dist folder not found. Please run "npm run build" first.');
    process.exit(1);
  }
  
  // Create extension-build directory
  const buildDir = 'extension-build';
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(buildDir, { recursive: true });
  
  console.log('📁 Copying extension files...');
  
  // Copy files to build directory
  for (const file of extensionFiles) {
    const srcPath = path.resolve(file);
    const destPath = path.join(buildDir, file);
    
    if (fs.existsSync(srcPath)) {
      // Create destination directory if it doesn't exist
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copy file or directory
      if (fs.statSync(srcPath).isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      console.log(`✅ Copied: ${file}`);
    } else {
      console.log(`⚠️  Not found (skipping): ${file}`);
    }
  }
  
  // Create ZIP file
  console.log('📦 Creating ZIP package...');
  const zipPath = 'frootful-extension.zip';
  
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  output.on('close', () => {
    console.log(`🎉 Extension package created: ${zipPath}`);
    console.log(`📊 Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log('📋 Package contents:');
    console.log('  ✅ Extension core files (manifest, scripts, HTML, CSS)');
    console.log('  ✅ Icons and assets');
    console.log('  ✅ Privacy policy');
    console.log('  ❌ SPA source code (excluded)');
    console.log('  ❌ Backend/Supabase code (excluded)');
    console.log('  ❌ Node modules (excluded)');
    console.log('');
    console.log('🚀 Ready for Chrome Web Store submission!');
    
    // Clean up build directory
    fs.rmSync(buildDir, { recursive: true, force: true });
  });
  
  archive.on('error', (err) => {
    console.error('❌ Error creating ZIP:', err);
    process.exit(1);
  });
  
  archive.pipe(output);
  archive.directory(buildDir, false);
  archive.finalize();
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Run the build
buildExtension().catch(console.error);