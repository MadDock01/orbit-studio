(function () {
  "use strict";

  var ORBIT_WEBSITE = "https://www.compxorbit.com";

  function openOrbitWebsite(event) {
    if (event) event.preventDefault();

    try {
      if (window.cep && window.cep.util &&
          typeof window.cep.util.openURLInDefaultBrowser === "function") {
        window.cep.util.openURLInDefaultBrowser(ORBIT_WEBSITE);
        return;
      }

      if (typeof CSInterface === "function") {
        var cs = new CSInterface();
        if (cs && typeof cs.openURLInDefaultBrowser === "function") {
          cs.openURLInDefaultBrowser(ORBIT_WEBSITE);
          return;
        }
      }
    } catch (error) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("CompX Orbit website could not be opened through CEP.", error);
      }
    }

    window.open(ORBIT_WEBSITE, "_blank");
  }

  function wireOrbitWebsiteLink() {
    var link = document.getElementById("cxOrbitWebsiteLink");
    if (link) link.addEventListener("click", openOrbitWebsite);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireOrbitWebsiteLink);
  } else {
    wireOrbitWebsiteLink();
  }
}());