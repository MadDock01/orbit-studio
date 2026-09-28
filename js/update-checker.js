/**
 * CompX Orbit Studio — Intelligent Auto-Update Checker
 * Automatically checks for extension updates and notifies the user in-app.
 */
(function (window) {
  "use strict";

  const CONFIG = {
    currentVersion: "2.6.0",
    slug: "orbit-studio",
    apiEndpoint: "https://compxorbit.com/api/extension/update-check",
    checkIntervalMs: 6 * 60 * 60 * 1000, // Check every 6 hours
    dismissCooldownMs: 24 * 60 * 60 * 1000, // 24 hours dismissal cooldown
  };

  class OrbitUpdateChecker {
    constructor() {
      this.csInterface = window.__adobe_cep__ ? new CSInterface() : null;
      this.updateData = null;
    }

    async checkForUpdates(force = false) {
      try {
        const lastCheck = parseInt(localStorage.getItem("compx_last_update_check") || "0", 10);
        const dismissedUntil = parseInt(localStorage.getItem("compx_update_dismissed_until") || "0", 10);
        const now = Date.now();

        if (!force) {
          if (now < dismissedUntil) return;
          if (now - lastCheck < CONFIG.checkIntervalMs) return;
        }

        localStorage.setItem("compx_last_update_check", now.toString());

        let hostApp = "AEFT";
        if (this.csInterface) {
          try {
            const hostInfo = this.csInterface.getHostEnvironment();
            hostApp = hostInfo.appId || "AEFT";
          } catch (e) {}
        }

        const res = await fetch(
          `${CONFIG.apiEndpoint}?slug=${CONFIG.slug}&version=${CONFIG.currentVersion}&hostApp=${hostApp}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!res.ok) return;
        const data = await res.json();

        if (data && data.hasUpdate) {
          this.updateData = data;
          this.showUpdateBanner(data);
        }
      } catch (err) {
        console.warn("[OrbitUpdateChecker] Check failed:", err);
      }
    }

    showUpdateBanner(data) {
      // Remove any existing banner
      const existing = document.getElementById("orbit-update-banner");
      if (existing) existing.remove();

      const banner = document.createElement("div");
      banner.id = "orbit-update-banner";
      banner.style.cssText = `
        position: fixed;
        top: 8px;
        left: 8px;
        right: 8px;
        z-index: 999999;
        background: linear-gradient(135deg, rgba(7, 19, 11, 0.95), rgba(15, 35, 20, 0.98));
        border: 1px solid rgba(69, 198, 109, 0.5);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(69, 198, 109, 0.2);
        border-radius: 10px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        backdrop-filter: blur(8px);
        animation: orbitSlideDown 0.3s ease-out;
      `;

      // Inject keyframes animation
      if (!document.getElementById("orbit-update-style")) {
        const style = document.createElement("style");
        style.id = "orbit-update-style";
        style.innerHTML = `
          @keyframes orbitSlideDown {
            from { transform: translateY(-30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span style="font-size: 14px;">🚀</span>
          <div style="min-width: 0;">
            <div style="font-weight: 800; color: #45c66d; letter-spacing: 0.3px;">
              Update Available: v${data.latestVersion}
            </div>
            <div style="color: #aab0bd; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              Faster rendering, R2 downloads & stability updates.
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button id="orbit-btn-update" style="
            background: #45c66d;
            color: #041008;
            font-weight: 800;
            font-size: 10px;
            border: none;
            border-radius: 6px;
            padding: 5px 10px;
            cursor: pointer;
            transition: all 0.2s;
          ">Update Now ⬇</button>
          <button id="orbit-btn-dismiss" style="
            background: transparent;
            color: #717682;
            font-size: 12px;
            border: none;
            padding: 4px;
            cursor: pointer;
          ">✕</button>
        </div>
      `;

      document.body.prepend(banner);

      document.getElementById("orbit-btn-update")?.addEventListener("click", () => {
        const targetUrl = data.downloadUrl || data.dashboardUrl || "https://compxorbit.com/dashboard";
        if (window.cep && cep.util && cep.util.openURLInDefaultBrowser) {
          cep.util.openURLInDefaultBrowser(targetUrl);
        } else {
          window.open(targetUrl, "_blank");
        }
      });

      document.getElementById("orbit-btn-dismiss")?.addEventListener("click", () => {
        localStorage.setItem("compx_update_dismissed_until", (Date.now() + CONFIG.dismissCooldownMs).toString());
        banner.remove();
      });
    }
  }

  // Auto initialize on DOM ready
  window.OrbitUpdateChecker = new OrbitUpdateChecker();
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => window.OrbitUpdateChecker.checkForUpdates(), 2000);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => window.OrbitUpdateChecker.checkForUpdates(), 2000);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
