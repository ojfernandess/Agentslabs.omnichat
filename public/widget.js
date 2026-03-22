/**
 * Widget de Live Chat — alinhado à documentação Chatwoot
 * https://www.chatwoot.com/docs/product/channels/live-chat/sdk/setup
 *
 * Suporta:
 * - position: "left" | "right"
 * - type: "standard" | "expanded_bubble"
 * - launcherTitle: texto no bubble expandido
 * - welcomeTitle, welcomeDescription, widgetColor
 *
 * Pode sobrescrever via window.agentslabsWidgetSettings antes do script.
 *
 * Uso: <script src="..." data-inbox-token="..." data-api-url="..."></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].hasAttribute && scripts[i].hasAttribute("data-inbox-token")) {
        script = scripts[i];
        break;
      }
    }
  }
  if (!script) {
    console.warn("[Widget] Script não encontrado. Adicione data-inbox-token ao elemento script.");
    return;
  }

  const token = script.getAttribute("data-inbox-token");
  const apiBase = script.getAttribute("data-api-url");
  if (!token || !apiBase) {
    console.warn("[Widget] data-inbox-token e data-api-url são obrigatórios");
    return;
  }

  const configUrl = apiBase.replace(/\/$/, "") + "/get-widget-config?token=" + encodeURIComponent(token);

  function mergeWithOverrides(apiConfig) {
    const overrides = (typeof window !== "undefined" && window.agentslabsWidgetSettings) || {};
    return {
      position: overrides.position ?? apiConfig.position ?? "right",
      type: overrides.type ?? apiConfig.type ?? "standard",
      launcherTitle: overrides.launcherTitle ?? apiConfig.launcher_title ?? apiConfig.launcherTitle ?? "Fale conosco no chat",
      welcomeTitle: overrides.welcomeTitle ?? apiConfig.welcome_title ?? "Olá, tudo bem?",
      welcomeDescription: overrides.welcomeDescription ?? apiConfig.welcome_description ?? apiConfig.welcome_message ?? "Como posso ajudar?",
      widgetColor: overrides.widgetColor ?? apiConfig.widget_color ?? apiConfig.primary_color ?? "#7C3AED",
      siteName: overrides.siteName ?? apiConfig.site_name ?? "Chat",
      avatarUrl: overrides.avatarUrl ?? apiConfig.avatar_url ?? "",
    };
  }

  var defaultConfig = {
    position: "right",
    type: "standard",
    launcherTitle: "Fale conosco no chat",
    widgetColor: "#7C3AED",
    prechat: null
  };

  (function injectAnimations() {
    if (document.getElementById("agentslabs-widget-styles")) return;
    var style = document.createElement("style");
    style.id = "agentslabs-widget-styles";
    style.textContent =
      "@keyframes agentslabs-slideUp{" +
      "from{opacity:0;transform:translateY(24px) scale(0.96)}" +
      "to{opacity:1;transform:translateY(0) scale(1)}" +
      "}" +
      "@keyframes agentslabs-fadeIn{" +
      "from{opacity:0}" +
      "to{opacity:1}" +
      "}";
    document.head.appendChild(style);
  })();

  fetch(configUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("Config HTTP " + r.status);
      return r.json();
    })
    .then(function (apiConfig) {
      var cfg = mergeWithOverrides(apiConfig);
      cfg.prechat = apiConfig.prechat || null;
      initWidget(cfg);
    })
    .catch(function (err) {
      console.warn("[Widget] Falha ao carregar config:", err.message || err);
      var cfg = Object.assign({}, defaultConfig, (typeof window !== "undefined" && window.agentslabsWidgetSettings) || {});
      initWidget(cfg);
    });

  function initWidget(cfg) {
    var position = cfg.position || "right";
    var type = cfg.type || "standard";
    var color = cfg.widgetColor || "#7C3AED";
    var launcherTitle = cfg.launcherTitle || "Fale conosco no chat";
    var avatarUrl = cfg.avatarUrl || "";

    var isRight = position === "right";

    var container = document.createElement("div");
    container.id = "agentslabs-widget-root";
    container.setAttribute("aria-label", launcherTitle);
    container.style.cssText =
      "position:fixed;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;font-size:14px;";

    container.style[isRight ? "right" : "left"] = "20px";
    container.style.bottom = "20px";

    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.title = launcherTitle;
    launcher.setAttribute("aria-label", launcherTitle);

    if (type === "expanded_bubble") {
      launcher.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:6px 20px;height:48px;border-radius:24px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);color:#fff;font-size:14px;font-weight:500;transition:transform 0.2s;overflow:visible;";
      launcher.style.backgroundColor = color;
      launcher.innerHTML = avatarUrl
        ? '<span style="width:36px;height:36px;min-width:36px;min-height:36px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 0.5px rgba(255,255,255,0.25);background:#fff"><img src="' + escapeHtml(avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'&#128172;\';this.parentElement.style.fontSize=\'20px\';this.parentElement.style.background=\'transparent\';this.parentElement.style.boxShadow=\'none\'"></span><span style="white-space:nowrap">' + escapeHtml(launcherTitle) + "</span>"
        : '<span style="font-size:20px;flex-shrink:0">&#128172;</span><span style="white-space:nowrap">' + escapeHtml(launcherTitle) + "</span>";
    } else {
      launcher.style.cssText =
        "width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;transition:transform 0.2s;overflow:hidden;padding:3px;box-sizing:border-box;";
      launcher.style.backgroundColor = color;
      launcher.innerHTML = avatarUrl
        ? '<span style="width:100%;height:100%;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 0.5px rgba(255,255,255,0.2);background:#fff"><img src="' + escapeHtml(avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="var p=this.parentElement;p.innerHTML=\'&#128172;\';p.style.fontSize=\'24px\';p.style.background=\'transparent\';p.style.boxShadow=\'none\'"></span>'
        : "&#128172;";
    }

    launcher.addEventListener("mouseenter", function () {
      launcher.style.transform = "scale(1.05)";
    });
    launcher.addEventListener("mouseleave", function () {
      launcher.style.transform = "scale(1)";
    });
    launcher.addEventListener("mousedown", function () {
      launcher.style.transform = "scale(0.92)";
    });
    launcher.addEventListener("mouseup", function () {
      launcher.style.transform = "scale(1)";
    });
    launcher.addEventListener("click", function () {
      if (toggleCloseIfOpen()) return;
      var prechat = cfg.prechat;
      var hasEnabledFields = prechat && prechat.fields && Array.isArray(prechat.fields) &&
        prechat.fields.some(function (f) { return f.enabled !== false; });
      if (prechat && prechat.enabled && hasEnabledFields) {
        var saved = getSavedVisitorData(token);
        if (saved && Object.keys(saved).length > 0) {
          openChat(token, script, saved, cfg);
        } else {
          showPrechatForm(prechat, token, script, color, cfg);
        }
      } else {
        openChat(token, script, undefined, cfg);
      }
    });

    container.appendChild(launcher);
    document.body.appendChild(container);
  }

  function getStorageKey(t, suffix) {
    return "agentslabs_" + (suffix || "visitor") + "_" + (t || "").replace(/[^a-zA-Z0-9-]/g, "_");
  }

  function getSavedVisitorData(t) {
    try {
      var raw = localStorage.getItem(getStorageKey(t, "visitor"));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveVisitorData(t, data) {
    try {
      localStorage.setItem(getStorageKey(t, "visitor"), JSON.stringify(data));
    } catch (e) {}
  }

  function getOrCreateIdentifier(t) {
    try {
      var key = getStorageKey(t, "identifier");
      var id = localStorage.getItem(key);
      if (!id) {
        id = "v_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) { return "v_" + Date.now(); }
  }

  function getSavedConversationId(t) {
    try {
      return localStorage.getItem(getStorageKey(t, "conversation")) || null;
    } catch (e) { return null; }
  }

  function saveConversationId(t, id) {
    try {
      if (id) localStorage.setItem(getStorageKey(t, "conversation"), id);
      else localStorage.removeItem(getStorageKey(t, "conversation"));
    } catch (e) {}
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "agentslabs_conversation" && d.token && d.conversation_id) {
      saveConversationId(d.token, d.conversation_id);
    }
  });

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function openChat(token, scriptEl, prechatData, cfg) {
    var m = scriptEl.src.match(/^(https?:\/\/[^/]+)/);
    var appBase = m ? m[1] : window.location.origin;
    var apiUrl = scriptEl.getAttribute("data-api-url") || "";
    var chatUrl = appBase + "/chat?token=" + encodeURIComponent(token) + "&api_url=" + encodeURIComponent(apiUrl);
    var identifier = getOrCreateIdentifier(token);
    chatUrl += "&identifier=" + encodeURIComponent(identifier);
    var savedConvId = getSavedConversationId(token);
    if (savedConvId) chatUrl += "&conversation_id=" + encodeURIComponent(savedConvId);
    if (prechatData && typeof prechatData === "object" && Object.keys(prechatData).length) {
      chatUrl += "&prechat_data=" + encodeURIComponent(JSON.stringify(prechatData));
    }
    showChatPanel(chatUrl, cfg || {});
  }

  function toggleCloseIfOpen() {
    var prechatOverlay = document.getElementById("agentslabs-prechat-overlay");
    if (prechatOverlay) {
      closePrechatWithEffect(prechatOverlay);
      return true;
    }
    var panel = document.getElementById("agentslabs-chat-panel");
    var overlay = document.getElementById("agentslabs-chat-overlay");
    if (panel && panel.style.display !== "none") {
      closePanelWithEffect(panel, overlay);
      return true;
    }
    return false;
  }

  function closePanel(panel, overlay) {
    panel.style.display = "none";
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function closePanelWithEffect(panel, overlay) {
    panel.style.transition = "transform 0.25s ease-out, opacity 0.2s ease-out";
    panel.style.transform = "translateY(100%) scale(0.95)";
    panel.style.opacity = "0";
    if (overlay) {
      overlay.style.transition = "opacity 0.2s ease-out";
      overlay.style.opacity = "0";
    }
    setTimeout(function () {
      panel.style.display = "none";
      panel.style.transform = "";
      panel.style.opacity = "";
      panel.style.transition = "";
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 250);
  }

  function closePrechatWithEffect(prechatOverlay) {
    var box = prechatOverlay.firstElementChild;
    if (box) {
      box.style.transition = "transform 0.25s ease-out, opacity 0.2s ease-out";
      box.style.transform = "translateY(100%) scale(0.95)";
      box.style.opacity = "0";
    }
    prechatOverlay.style.transition = "opacity 0.2s ease-out";
    prechatOverlay.style.opacity = "0";
    setTimeout(function () {
      if (prechatOverlay.parentNode) prechatOverlay.parentNode.removeChild(prechatOverlay);
    }, 250);
  }

  function showChatPanel(chatUrl, cfg) {
    var launcher = document.querySelector("#agentslabs-widget-root button");
    var existing = document.getElementById("agentslabs-chat-panel");
    var existingOverlay = document.getElementById("agentslabs-chat-overlay");
    if (existing) {
      existing.style.display = "flex";
      existing.style.animation = "agentslabs-slideUp 0.3s ease-out";
      var iframe = existing.querySelector("iframe");
      if (iframe) iframe.src = chatUrl;
      if (!existingOverlay) {
        var overlay = document.createElement("div");
        overlay.id = "agentslabs-chat-overlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483644;background:rgba(0,0,0,0.3);animation:agentslabs-fadeIn 0.25s ease-out;";
        overlay.onclick = function () { closePanelWithEffect(existing, overlay); };
        document.body.insertBefore(overlay, existing);
      }
      return;
    }
    var position = (cfg && cfg.position) || "right";
    var isRight = position === "right";
    var launcherHeight = 56;
    var launcherMargin = 20;
    var panelBottom = launcherHeight + launcherMargin + 8;
    var panel = document.createElement("div");
    panel.id = "agentslabs-chat-panel";
    panel.setAttribute("aria-label", "Janela de chat");
    panel.style.cssText =
      "position:fixed;bottom:" + panelBottom + "px;" + (isRight ? "right:" : "left:") + launcherMargin + "px;" +
      "width:380px;max-width:calc(100vw - 40px);height:520px;max-height:min( calc(100vh - " + (panelBottom + 24) + "px), 580px );" +
      "z-index:2147483645;box-shadow:0 -4px 24px rgba(0,0,0,0.15);" +
      "background:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;" +
      "border-radius:12px 12px 0 0;animation:agentslabs-slideUp 0.3s ease-out;";

    var header = document.createElement("div");
    header.style.cssText =
      "flex-shrink:0;height:48px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 16px;";
    header.innerHTML = '<span style="font-weight:600;font-size:15px">Chat</span>' +
      '<button type="button" id="agentslabs-panel-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#6b7280;padding:4px">×</button>';

    var iframeWrap = document.createElement("div");
    iframeWrap.style.cssText = "flex:1;min-height:0;overflow:hidden;";
    var iframe = document.createElement("iframe");
    iframe.src = chatUrl;
    iframe.title = "Chat";
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
    iframeWrap.appendChild(iframe);
    panel.appendChild(header);
    panel.appendChild(iframeWrap);

    var overlay = document.createElement("div");
    overlay.id = "agentslabs-chat-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483644;background:rgba(0,0,0,0.3);animation:agentslabs-fadeIn 0.25s ease-out;";
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    overlay.onclick = function () { closePanelWithEffect(panel, overlay); };
    header.querySelector("#agentslabs-panel-close").onclick = function () { closePanelWithEffect(panel, overlay); };
  }

  function showPrechatForm(prechat, token, scriptEl, color, cfg) {
    var position = (cfg && cfg.position) || "right";
    var isRight = position === "right";
    var launcherHeight = 56;
    var launcherMargin = 20;
    var panelBottom = launcherHeight + launcherMargin + 8;

    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.3);font-family:system-ui,sans-serif;animation:agentslabs-fadeIn 0.25s ease-out;";
    overlay.id = "agentslabs-prechat-overlay";

    var box = document.createElement("div");
    box.style.cssText =
      "position:fixed;bottom:" + panelBottom + "px;" + (isRight ? "right:" : "left:") + launcherMargin + "px;" +
      "width:380px;max-width:calc(100vw - 40px);max-height:min(calc(100vh - " + (panelBottom + 24) + "px), 480px);" +
      "background:#fff;border-radius:12px 12px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,0.15);" +
      "overflow-y:auto;overflow-x:hidden;box-sizing:border-box;animation:agentslabs-slideUp 0.3s ease-out;";

    var msg = (prechat.message || "Preencha as informações abaixo para iniciar.").replace(/</g, "&lt;");
    var savedData = getSavedVisitorData(token) || {};
    var fieldsHtml = "";
    var fields = prechat.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.enabled === false) continue;
      var required = f.required ? " required" : "";
      var inputType = f.type === "email" ? "email" : f.type === "number" ? "number" : "text";
      var label = escapeHtml(f.label || f.key);
      var ph = escapeHtml(f.placeholder || "");
      var savedVal = savedData[f.key] ? escapeHtml(String(savedData[f.key])) : "";
      var valueAttr = savedVal ? ' value="' + savedVal + '"' : "";
      fieldsHtml +=
        '<div style="margin-bottom:12px">' +
        '<label style="display:block;font-size:13px;font-weight:500;margin-bottom:4px;color:#374151">' +
        label +
        (f.required ? " *" : "") +
        "</label>" +
        '<input type="' +
        inputType +
        '" name="' +
        escapeHtml(f.key) +
        '" placeholder="' +
        ph +
        '"' + valueAttr +
        ' style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box" ' +
        required +
        ">" +
        "</div>";
    }

    var submitBtnStyle = "width:100%;padding:12px;background:" + color + ";color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px";
    var closeBtnStyle = "position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af";
    box.innerHTML = "<div style=\"padding:24px;min-width:0;box-sizing:border-box\">" +
      "<p style=\"margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.5\">" + msg + "</p>" +
      "<form id=\"agentslabs-prechat-form\">" + fieldsHtml +
      "<button type=\"submit\" style=\"" + submitBtnStyle + "\">Iniciar conversa</button></form>" +
      "<button type=\"button\" id=\"agentslabs-prechat-close\" style=\"" + closeBtnStyle + "\">X</button>" +
      "</div>";

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var close = function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };

    overlay.querySelector("#agentslabs-prechat-close").onclick = function () { closePrechatWithEffect(overlay); };
    overlay.onclick = function (e) {
      if (e.target === overlay) closePrechatWithEffect(overlay);
    };

    overlay.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      var form = e.target;
      var data = {};
      for (var j = 0; j < form.elements.length; j++) {
        var el = form.elements[j];
        if (el.name && el.type !== "submit") data[el.name] = el.value;
      }
      if (Object.keys(data).length > 0) saveVisitorData(token, data);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var m = scriptEl.src.match(/^(https?:\/\/[^/]+)/);
      var appBase = m ? m[1] : window.location.origin;
      var apiUrl = scriptEl.getAttribute("data-api-url") || "";
      var chatUrl = appBase + "/chat?token=" + encodeURIComponent(token) + "&api_url=" + encodeURIComponent(apiUrl);
      if (Object.keys(data).length) {
        chatUrl += "&prechat_data=" + encodeURIComponent(JSON.stringify(data));
      }
      showChatPanel(chatUrl, cfg || {});
    };
  }
})();
