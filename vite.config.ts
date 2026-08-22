import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

/* ── En-têtes de sécurité injectés par le serveur de dev ──────────────── */
const SECURITY_HEADERS: Record<string, string> = {
  /* Empêche le chargement de ressources non autorisées */
  "Content-Security-Policy": [
    "default-src 'self'",
    /* Scripts : self + inline nécessaire pour Vite HMR */
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    /* Styles : self + inline (Tailwind injecte des styles) */
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    /* Polices Google Fonts */
    "font-src 'self' https://fonts.gstatic.com",
    /* Images : self + data URIs (avatars base64) + nominatim pour géo */
    "img-src 'self' data: blob: https://nominatim.openstreetmap.org",
    /* XHR/fetch : self + Supabase + Nominatim + esm.sh (Edge Functions) */
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org",
    /* Frames : aucune (pas d'iframes dans l'app) */
    "frame-src 'none'",
    /* Workers (WebRTC) */
    "worker-src 'self' blob:",
    /* Objets embarqués : aucun */
    "object-src 'none'",
    /* Base URI */
    "base-uri 'self'",
    /* Form action : self uniquement */
    "form-action 'self'",
  ].join("; "),

  /* Protection clickjacking */
  "X-Frame-Options": "DENY",

  /* Empêche le MIME-sniffing */
  "X-Content-Type-Options": "nosniff",

  /* Force HTTPS (HSTS) */
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",

  /* Referrer minimal */
  "Referrer-Policy": "strict-origin-when-cross-origin",

  /* Permissions API : désactive les fonctionnalités non utilisées */
  "Permissions-Policy": [
    "camera=(self)",          // Requis pour WebRTC vidéo
    "microphone=(self)",      // Requis pour WebRTC audio
    "geolocation=(self)",     // Requis pour détection localité
    "payment=()",             // Non utilisé
    "usb=()",                 // Non utilisé
    "magnetometer=()",        // Non utilisé
    "accelerometer=()",       // Non utilisé
  ].join(", "),

  /* Protection XSS navigateur (legacy) */
  "X-XSS-Protection": "1; mode=block",
};

export default defineConfig({
  base: "./",
  plugins: [
    react({
      // Babel transforms uniquement sur les fichiers JSX/TSX — évite le traitement inutile des .ts purs
      include: "**/*.{jsx,tsx}",
    }),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  /* ── Pre-bundling agressif des dépendances fréquentes ── */
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@supabase/supabase-js",
      "react-router-dom",
      "date-fns",
      "lucide-react",
      "sonner",
      "clsx",
      "tailwind-merge",
    ],
  },
  build: {
    /* ── Code-splitting : chunks manuels par domaine ─────── */
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor React core — chunk prioritaire (prefetch immédiat)
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // Router
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run")) {
            return "vendor-router";
          }
          // Supabase — chargé au démarrage mais volumineux, isolé
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          // Recharts — chargé uniquement sur les pages analytics
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) {
            return "vendor-charts";
          }
          // XLSX — chargé uniquement à l'export
          if (id.includes("node_modules/xlsx") || id.includes("node_modules/exceljs")) {
            return "vendor-xlsx";
          }
          // Emoji picker — chargé uniquement dans Discussion
          if (id.includes("node_modules/emoji-picker-react") || id.includes("node_modules/emojibase")) {
            return "vendor-emoji";
          }
          // Radix UI — UI partagée mais volumineuse, isolée
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          // Framer Motion
          if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Reste des node_modules → chunk vendor-misc
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
    /* ── Optimisations build ────────────────────────────── */
    target: "esnext",           // syntaxe moderne, moins de polyfills
    minify: "esbuild",          // plus rapide que terser, résultat quasi-identique
    cssMinify: true,
    chunkSizeWarningLimit: 600, // kB — alerte si un chunk dépasse
    sourcemap: false,           // désactivé en production
  },
  /* Serveur de dev avec en-têtes de sécurité */
  server: {
    headers: SECURITY_HEADERS,
  },
  /* Preview (build local) avec les mêmes en-têtes */
  preview: {
    headers: SECURITY_HEADERS,
  },
});
