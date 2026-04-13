import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stave — Engine-agnostic live coding editor",
  description:
    "Engine-agnostic live coding editor — any engine, any viz, any synth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('stave:editorTheme') || 'dark';
                  var resolved = t === 'light' ? 'light'
                    : t === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
                    : 'dark';
                  document.documentElement.setAttribute('data-stave-theme', resolved);
                } catch (e) {}
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes spin { to { transform: rotate(360deg) } }
              @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
              #stave-preloader {
                position: fixed; inset: 0; z-index: 9999;
                background: var(--bg-app);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
                transition: opacity 0.3s ease-out;
              }
              #stave-preloader.hidden { opacity: 0; pointer-events: none; }
              #stave-preloader h1 {
                font-size: 32px; font-weight: 700; color: var(--accent-strong);
                margin: 0; letter-spacing: -0.5px;
              }
              #stave-preloader .status {
                color: var(--text-secondary); font-size: 13px; margin-top: 12px;
                animation: pulse 2s ease-in-out infinite;
              }
              #stave-preloader .spinner {
                margin-top: 24px; width: 36px; height: 36px;
                border: 3px solid var(--border-subtle);
                border-top-color: var(--accent-strong); border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }
              #stave-preloader .steps {
                margin-top: 32px; display: flex; flex-direction: column;
                gap: 6px; color: var(--text-muted); font-size: 11px;
              }
              #stave-preloader .steps .done { color: var(--text-tertiary); }
              #stave-preloader .steps .active { color: var(--text-secondary); }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var steps = ['Connecting to dev server', 'Compiling modules', 'Loading Monaco editor', 'Initializing audio engine'];
                var el, stepEls;
                var currentStep = 0;
                function init() {
                  el = document.getElementById('stave-preloader');
                  stepEls = el ? el.querySelectorAll('.step') : [];
                  if (stepEls.length) advanceStep();
                }
                function advanceStep() {
                  if (currentStep >= stepEls.length) return;
                  stepEls[currentStep].classList.add('active');
                  if (currentStep > 0) {
                    stepEls[currentStep - 1].classList.remove('active');
                    stepEls[currentStep - 1].classList.add('done');
                    stepEls[currentStep - 1].textContent = '✓ ' + steps[currentStep - 1];
                  }
                  currentStep++;
                  if (currentStep < stepEls.length) setTimeout(advanceStep, 1500 + Math.random() * 1000);
                  else setTimeout(function() {
                    stepEls[stepEls.length - 1].classList.remove('active');
                    stepEls[stepEls.length - 1].classList.add('done');
                    stepEls[stepEls.length - 1].textContent = '✓ ' + steps[steps.length - 1];
                  }, 2000);
                }
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                else init();
              })();
            `,
          }}
        />
        {/* SuperSonic loaded dynamically in SonicPiEngine — no script tag needed */}
      </head>
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column", margin: 0, background: "var(--bg-app)" }}>
        <div id="stave-preloader">
          <h1>Stave</h1>
          <div className="status">Warming up the editor…</div>
          <div className="spinner" />
          <div className="steps">
            <div className="step">○ Connecting to dev server</div>
            <div className="step">○ Compiling modules</div>
            <div className="step">○ Loading Monaco editor</div>
            <div className="step">○ Initializing audio engine</div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
