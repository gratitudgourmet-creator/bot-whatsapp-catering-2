
    let allChats = [];
    let allCustomers = [];
    let allProviders = [];
    let allRecipes = [];
    let purchaseOrders = [];
    let purchaseReceipts = [];
    let pendingRecipeEdits = [];
    let erpData = {
      dashboard: {},
      events: [],
      quotes: [],
      purchases: [],
    };
    let currentUser = null;
    let panelRoles = [];
    let permissionCatalog = [];
    let tabCatalog = [];
    let panelUsers = [];
    let auditLog = [];
    let logisticsEvents = [];
    let logisticsCategories = [];
    let activeLogisticsEvent = null;
    let logisticsSaveTimer = null;
    let pendingQuoteImport = null;
    const operationalCategoryDefaults = [
      ["alimentos", "Alimentos"],
      ["vajilla", "Vajilla"],
      ["utensilios", "Utensilios"],
      ["bebidas", "Bebidas"],
      ["manteleria", "Manteleria"],
      ["mobiliario", "Mobiliario"],
      ["personal", "Personal"],
      ["transporte", "Transporte"],
      ["montaje", "Montaje"],
      ["desmontaje", "Desmontaje"],
      ["documentacion", "Documentacion"],
      ["extras", "Extras / varios"],
    ].map(([id, label]) => ({ id, label }));
    let stateRefreshTimer = null;
    let activeFilter = "all";
    let purchaseOptions = {
      providers: [],
      products: [],
      events: [],
      paymentMethods: [],
      fundsSources: [],
    };
    let purchasePeriodFilter = {
      preset: "last30",
      from: "",
      to: "",
    };
    let purchaseOrderAdvisorLastText = "";
    let recipeProducts = [];
    let costSettings = { laborHourlyCost: 0 };
    let purchaseItemCounter = 0;
    let recipeItemCounter = 0;
    let recipeProcessCounter = 0;
    let budgetRecipeCounter = 0;
    let erpQuoteLineCounter = 0;
    let venueMap = null;
    let venueMarker = null;
    const activeModuleSections = {};
    const MODULE_HOMES = {
      erp: {
        title: "ERP",
        subtitle: "Resumen ejecutivo, alertas y estado general del negocio.",
        items: [
          { label: "Lectura rápida", description: "KPIs, compras recientes, deudas y próximos movimientos.", anchor: "erp-executive-summary-section" },
          { label: "Alertas", description: "Puntos que requieren atención administrativa u operativa.", anchor: "erp-alerts-section" },
        ],
      },
      commercial: {
        title: "Comercial",
        subtitle: "Oportunidades, pipeline, presupuestos, clientes y lugares.",
        items: [
          { label: "Oportunidades", description: "Consultas entrantes y seguimiento comercial.", anchor: "commercial-opportunities-section" },
          { label: "Pipeline", description: "Eventos por etapa comercial.", anchor: "commercial-pipeline-section" },
          { label: "Presupuestos", description: "Presupuestos asociados a eventos.", anchor: "commercial-quotes-section" },
          { label: "Clientes", description: "Clientes vinculados al circuito comercial.", anchor: "commercial-customers-section" },
          { label: "Lugares", description: "Venues, direcciones, referencias y mapas.", anchor: "commercial-venues-section" },
        ],
      },
      events: {
        title: "Eventos",
        subtitle: "Control integral de cada evento: comercial, operativo, financiero y cierre.",
        items: [
          { label: "Control integral", description: "Eventos activos con venta, costos, compras, checklist y acciones.", anchor: "events-control-section" },
          { label: "Estados y cierres", description: "Historial, perdidos, cancelados, conformidades y autorizaciones.", anchor: "event-status-section" },
          { label: "Presupuestos asociados", description: "Versiones de presupuesto vinculadas a eventos.", anchor: "events-quotes-section" },
          { label: "Crear evento", description: "Abrir carga de evento nuevo.", action: "showBlankErpEventForm" },
        ],
      },
      purchases: {
        title: "Compras",
        subtitle: "Compras reales, órdenes, inventario y variaciones de insumos.",
        items: [
          { label: "Compras", description: "Planilla de compras, importación Sheets y carga manual.", anchor: "purchase-sheet-section" },
          { label: "Órdenes de compra", description: "Pedidos por evento, recepción y diferencias.", anchor: "purchase-orders-section" },
          { label: "Inventario", description: "Stock generado por recepciones aceptadas.", anchor: "purchase-inventory-section" },
          { label: "Insumos con variación", description: "Cambios fuertes de precio e impacto en recetas.", anchor: "purchase-variations-section" },
        ],
      },
      finance: {
        title: "Finanzas",
        subtitle: "Cobros, deudas, reintegros y órdenes de pago.",
        items: [
          { label: "Resumen financiero", description: "Ventas, cobranzas, deudas y saldo proyectado.", anchor: "finance-summary-section" },
          { label: "Cobros por evento", description: "Estado de cobro y facturación por evento.", anchor: "finance-events-section" },
          { label: "Deudas proveedores", description: "Cuenta corriente pendiente por proveedor.", action: "showProviderDebtWindow" },
          { label: "Reintegros", description: "Dinero puesto por Joaquin, German u otros.", action: "showReimbursementWindow" },
          { label: "Órdenes de pago", description: "Solicitudes formales y aprobaciones.", view: "payment_orders" },
        ],
      },
      hr: {
        title: "Personal/RRHH",
        subtitle: "Legajos, asistencia, horas y sueldos.",
        items: [
          { label: "Legajos", description: "Datos del personal, rol, teléfono y disponibilidad.", anchor: "hr-staff-section" },
          { label: "Asistencia y horarios", description: "Turnos, horas reales y novedades por evento.", anchor: "hr-shifts-section" },
          { label: "Sueldos y horas", description: "Liquidaciones, adicionales, descuentos y pagos.", anchor: "hr-payroll-section" },
        ],
      },
      sanitation: {
        title: "Bromatología",
        subtitle: "Documentación sanitaria, vencimientos, decomisos y aprobaciones.",
        items: [
          { label: "Nuevo registro", description: "Cargar documento, etiqueta, vencimiento o decomiso.", anchor: "sanitation-form-section" },
          { label: "Registros y aprobaciones", description: "Revisar, aprobar o rechazar controles.", anchor: "sanitation-records-section" },
        ],
      },
      payment_orders: {
        title: "Órdenes de pago",
        subtitle: "Pagos formales con estado, aprobación y comprobante.",
        items: [
          { label: "Nueva orden", description: "Crear solicitud de pago a proveedor, persona o reintegro.", anchor: "payment-order-form-section" },
          { label: "Historial y aprobaciones", description: "Ver órdenes pendientes, aprobadas y pagadas.", anchor: "payment-order-list-section" },
        ],
      },
      customers: {
        title: "Clientes",
        subtitle: "Base de clientes, preferencias y restricciones.",
        items: [
          { label: "Listado", description: "Buscar y seleccionar clientes.", anchor: "customer-list-section" },
          { label: "Ficha de cliente", description: "Alta y edición de datos del cliente.", anchor: "customer-form-section" },
        ],
      },
      providers: {
        title: "Proveedores",
        subtitle: "Datos fiscales, bancarios y contacto de proveedores.",
        items: [
          { label: "Listado", description: "Buscar y seleccionar proveedores.", anchor: "provider-list-section" },
          { label: "Ficha bancaria/fiscal", description: "Editar razón social, CUIT, banco, CBU y alias.", anchor: "provider-form-section" },
        ],
      },
      recipes: {
        title: "Recetas",
        subtitle: "Recetas, procedimientos, costos y libro de cocina.",
        items: [
          { label: "Listado", description: "Ver recetas cargadas y abrir ficha técnica.", anchor: "recipe-list-section" },
          { label: "Cargar receta", description: "Crear o editar receta con ingredientes y procesos.", action: "showRecipeForm" },
          { label: "Presupuestar recetas", description: "Armar costo desde recetas cargadas.", action: "showBudgetBuilder" },
          { label: "Costos generales", description: "Personal, insumos sugeridos y listas operativas.", action: "showCostSettingsForm" },
        ],
      },
      logistics_event: {
        title: "Logística Evento",
        subtitle: "Operación de eventos confirmados sin datos financieros.",
        items: [
          { label: "Eventos confirmados", description: "Checklist operativo y ficha logística.", anchor: "logistics-event-list-section" },
        ],
      },
      security: {
        title: "Seguridad",
        subtitle: "Usuarios, roles, permisos y auditoría.",
        items: [
          { label: "Usuarios", description: "Crear o editar usuarios del sistema.", anchor: "security-users-section" },
          { label: "Roles y permisos", description: "Controlar accesos por rol.", anchor: "security-roles-section" },
          { label: "Panel admin", description: "Mapa de vistas, funciones y estadísticas.", anchor: "security-admin-control-section" },
          { label: "Historial", description: "Auditoría filtrable de acciones.", anchor: "security-audit-section" },
        ],
      },
    };
    const MODULE_SECTION_GROUPS = {
      erp: {
        "erp-executive-summary-section": ["erp-executive-summary-section"],
        "erp-alerts-section": ["erp-alerts-section"],
      },
      commercial: {
        "commercial-opportunities-section": ["commercial-metrics-section", "commercial-opportunities-section", "commercial-board-section"],
        "commercial-pipeline-section": ["commercial-pipeline-section"],
        "commercial-quotes-section": ["commercial-quotes-section"],
        "commercial-customers-section": ["commercial-customers-section"],
        "commercial-venues-section": ["commercial-venues-section"],
      },
      events: {
        "events-control-section": ["events-control-section"],
        "event-status-section": ["event-status-section"],
        "events-quotes-section": ["events-quotes-section"],
      },
      purchases: {
        "purchase-sheet-section": ["purchase-sheet-section"],
        "purchase-orders-section": ["purchase-orders-section"],
        "purchase-inventory-section": ["purchase-inventory-section"],
        "purchase-variations-section": ["purchase-variations-section"],
      },
      finance: {
        "finance-summary-section": ["finance-summary-section"],
        "finance-events-section": ["finance-summary-section"],
      },
      hr: {
        "hr-staff-section": ["hr-main-section"],
        "hr-shifts-section": ["hr-main-section"],
        "hr-payroll-section": ["hr-main-section"],
      },
      sanitation: {
        "sanitation-form-section": ["sanitation-main-section"],
        "sanitation-records-section": ["sanitation-main-section"],
      },
      payment_orders: {
        "payment-order-form-section": ["payment-order-main-section"],
        "payment-order-list-section": ["payment-order-main-section"],
      },
      customers: {
        "customer-list-section": ["customer-list-section"],
        "customer-form-section": ["customer-form-section"],
      },
      providers: {
        "provider-list-section": ["provider-list-section"],
        "provider-form-section": ["provider-form-section"],
      },
      recipes: {
        "recipe-list-section": ["recipe-list-section"],
      },
      logistics_event: {
        "logistics-event-list-section": ["logistics-event-list-section"],
      },
      security: {
        "security-users-section": ["security-users-section"],
        "security-roles-section": ["security-users-section"],
        "security-admin-control-section": ["security-admin-control-section"],
        "security-audit-section": ["security-audit-section"],
      },
    };
    const MODULE_DEFAULT_SECTIONS = {
      erp: "erp-executive-summary-section",
      commercial: "commercial-opportunities-section",
      events: "events-control-section",
      purchases: "purchase-sheet-section",
      finance: "finance-summary-section",
      hr: "hr-staff-section",
      sanitation: "sanitation-records-section",
      payment_orders: "payment-order-list-section",
      customers: "customer-list-section",
      providers: "provider-list-section",
      recipes: "recipe-list-section",
      logistics_event: "logistics-event-list-section",
      security: "security-users-section",
    };

    const rows = document.getElementById("rows");
    const search = document.getElementById("search");
    const updated = document.getElementById("updated");
    const notice = document.getElementById("notice");

    ensureGlobalErpFormModal();
    ensureModuleHomes();
    prepareModuleSections();

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        activeFilter = button.dataset.filter;
        renderRows();
      });
    });

    document.getElementById("commercial-filter").addEventListener("change", (event) => {
      activeFilter = event.target.value;
      renderRows();
    });

    document.querySelectorAll(".workspace-tab").forEach((button) => {
      button.addEventListener("click", () => navigateWorkspaceItem(button));
    });

    document.querySelectorAll(".workspace-subitem").forEach((button) => {
      button.addEventListener("click", () => navigateWorkspaceItem(button));
    });

    search.addEventListener("input", renderRows);
    document.getElementById("customer-search").addEventListener("input", renderCustomers);
    document.getElementById("provider-search").addEventListener("input", renderProviders);
    document.getElementById("recipe-search").addEventListener("input", renderRecipes);
    document.getElementById("login-form").addEventListener("submit", loginPanel);
    document.getElementById("manual-form").addEventListener("submit", createManualBudget);
    document.getElementById("edit-form").addEventListener("submit", updateBudget);
    document.getElementById("purchase-form").addEventListener("submit", createPurchase);
    document.getElementById("purchase-form").addEventListener("input", savePurchaseDraft);
    document.getElementById("purchase-form").addEventListener("change", savePurchaseDraft);
    document.getElementById("customer-form").addEventListener("submit", saveCustomer);
    document.getElementById("provider-form").addEventListener("submit", saveProvider);
    document.getElementById("recipe-form").addEventListener("submit", saveRecipe);
    document.getElementById("recipe-form").addEventListener("input", updateRecipeTotals);
    document.getElementById("recipe-form").elements.yieldUnit.addEventListener("change", updateRecipeTotals);
    document.getElementById("cost-settings-form").addEventListener("submit", saveCostSettings);
    document.getElementById("erp-event-form").addEventListener("submit", saveErpEvent);
    document.getElementById("erp-quote-form").addEventListener("submit", saveErpQuote);
    document.getElementById("erp-quote-form").addEventListener("input", updateErpQuotePreview);
    document.getElementById("erp-quote-form").addEventListener("change", updateErpQuotePreview);
    document.getElementById("global-search").addEventListener("input", renderGlobalSearch);
    document.getElementById("role-filter").addEventListener("change", renderErp);
    document.getElementById("invoice-photo")?.addEventListener("change", previewInvoicePhoto);
    setupAutocomplete("purchase-provider", "purchase-provider-suggestions", () => purchaseOptions.providers || []);

    async function bootstrapPanel() {
      const response = await fetch("/api/me");
      const result = await response.json();
      panelRoles = result.roles || [];

      if (!result.authenticated) {
        showLoginScreen();
        return;
      }

      currentUser = result.user;
      hideLoginScreen();
      renderCurrentUser();
      await loadInitialData();
    }

    async function loadInitialData() {
      const tasks = [];
      if (canAccessTab("commercial")) tasks.push(loadState());
      if (canAccessTab("purchases") || canAccessTab("finance")) tasks.push(loadPurchaseOptions());
      if (canAccessTab("customers")) tasks.push(loadCustomers());
      if (canAccessTab("recipes")) tasks.push(loadRecipes());
      if (["erp", "commercial", "events", "purchases", "finance", "hr", "sanitation", "payment_orders"].some((view) => canAccessTab(view))) tasks.push(loadErp());
      if (canAccessTab("logistics_event")) tasks.push(loadLogisticsEvents());
      await Promise.all(tasks);
      if (stateRefreshTimer) clearInterval(stateRefreshTimer);
      if (canAccessTab("commercial")) {
        stateRefreshTimer = setInterval(loadState, 5000);
      }
    }

    function showLoginScreen() {
      document.getElementById("login-screen").classList.add("open");
      document.getElementById("session-user").textContent = "Sin sesion";
    }

    function hideLoginScreen() {
      document.getElementById("login-screen").classList.remove("open");
    }

    function renderCurrentUser() {
      document.getElementById("session-user").textContent = currentUser
        ? `${currentUser.displayName || currentUser.username} | ${currentUser.roleLabel || currentUser.role}`
        : "Sin sesion";
      applyPermissionVisibility();
    }

    async function loginPanel(event) {
      event.preventDefault();
      const form = event.target;
      const errorBox = document.getElementById("login-error");
      errorBox.style.display = "none";

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.error || "No se pudo iniciar sesion.");

        currentUser = result.user;
        panelRoles = result.roles || panelRoles;
        form.reset();
        hideLoginScreen();
        renderCurrentUser();
        await loadInitialData();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.style.display = "block";
      }
    }

    async function logoutPanel() {
      await fetch("/api/logout", { method: "POST" });
      currentUser = null;
      if (stateRefreshTimer) clearInterval(stateRefreshTimer);
      showLoginScreen();
    }

    function can(permission) {
      if (!currentUser) return false;
      const permissions = currentUser.permissions || [];
      return permissions.includes("*") || permissions.includes(permission) || permission === "view";
    }

    function canSeeRecipeCosts() {
      return can("*") || currentUser?.role !== "cocina";
    }

    function ensureModuleHomes() {
      Object.entries(MODULE_HOMES).forEach(([view, config]) => {
        const container = document.getElementById(`view-${view}`);
        if (!container || container.querySelector(`:scope > .module-home`)) return;
        const home = document.createElement("section");
        home.id = `${view}-home-section`;
        home.className = "module-home active";
        home.innerHTML = `
          <div class="module-home-card">
            <div class="module-home-head">
              <div>
                <h2>${escapeHtml(config.title || view)}</h2>
                <p class="subtitle">${escapeHtml(config.subtitle || "")}</p>
              </div>
              <button class="filter" type="button" data-module-home-refresh="${escapeAttribute(view)}">Actualizar</button>
            </div>
            <div class="module-home-grid">
              ${(config.items || []).map((item) => `
                <button class="module-home-action" type="button" data-view="${escapeAttribute(item.view || view)}" data-anchor="${escapeAttribute(item.anchor || "")}" data-action="${escapeAttribute(item.action || "")}">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span>${escapeHtml(item.description || "")}</span>
                </button>
              `).join("")}
            </div>
          </div>
        `;
        const firstDetail = Array.from(container.children).find((child) => child.classList?.contains("detail"));
        container.insertBefore(home, firstDetail || container.firstChild);
      });

      document.querySelectorAll(".module-home-action").forEach((button) => {
        button.addEventListener("click", () => navigateWorkspaceItem(button));
      });
      document.querySelectorAll("[data-module-home-refresh]").forEach((button) => {
        button.addEventListener("click", () => refreshWorkspaceView(button.dataset.moduleHomeRefresh));
      });
    }

    function prepareModuleSections() {
      Object.entries(MODULE_SECTION_GROUPS).forEach(([view, groups]) => {
        Object.values(groups).flat().forEach((sectionId) => {
          const section = document.getElementById(sectionId);
          if (section) section.classList.add("module-section");
        });
      });
    }

    function refreshWorkspaceView(view) {
      if (view === "customers") return loadCustomers();
      if (view === "providers") return loadProviders();
      if (view === "recipes") return loadRecipes();
      if (view === "logistics_event") return loadLogisticsEvents();
      if (view === "security") return loadSecurityPanel();
      if (["erp", "commercial", "purchases", "finance", "hr", "sanitation", "payment_orders"].includes(view)) return loadErp();
      return Promise.resolve();
    }

    function showModuleHome(view) {
      const container = document.getElementById(`view-${view}`);
      if (!container) return;
      activeModuleSections[view] = "";
      container.querySelectorAll(":scope > .module-home").forEach((section) => section.classList.add("active"));
      container.querySelectorAll(".module-section").forEach((section) => section.classList.remove("active"));
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function showModuleSection(view, anchor) {
      const container = document.getElementById(`view-${view}`);
      if (!container || !anchor) return;
      activeModuleSections[view] = anchor;
      const visibleIds = new Set((MODULE_SECTION_GROUPS[view] || {})[anchor] || [anchor]);
      container.querySelectorAll(":scope > .module-home").forEach((section) => section.classList.remove("active"));
      container.querySelectorAll(".module-section").forEach((section) => {
        section.classList.toggle("active", visibleIds.has(section.id));
      });
      const target = document.getElementById(anchor);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("section-focus");
        setTimeout(() => target.classList.remove("section-focus"), 1200);
      }
    }

    function applyPermissionVisibility() {
      document.querySelectorAll("[data-permission]").forEach((element) => {
        element.classList.toggle("hidden", !can(element.dataset.permission));
      });
      applyTabVisibility();
      applyRecipeCostVisibility();
    }

    function applyRecipeCostVisibility() {
      const showCosts = canSeeRecipeCosts();
      document.getElementById("recipe-budget-button")?.classList.toggle("hidden", !showCosts);
      document.getElementById("recipe-cost-settings-button")?.classList.toggle("hidden", !showCosts);
      document.getElementById("recipe-cost-summary")?.classList.toggle("hidden", !showCosts);
      document.querySelectorAll(".recipe-cost-field").forEach((element) => {
        element.classList.toggle("hidden", !showCosts);
        const inputs = element.matches("input, select, textarea")
          ? [element]
          : Array.from(element.querySelectorAll("input, select, textarea"));
        inputs.forEach((input) => {
          input.disabled = !showCosts;
          if (!showCosts) input.required = false;
        });
      });
    }

    function applyTabVisibility() {
      const visibleTabs = new Set(currentUser?.tabs?.length ? currentUser.tabs : ["erp", "commercial"]);
      document.querySelectorAll(".workspace-tab").forEach((button) => {
        button.classList.toggle("hidden", !visibleTabs.has(button.dataset.view) || !canAccessTab(button.dataset.view));
      });
      document.querySelectorAll(".workspace-subitem").forEach((button) => {
        const view = button.dataset.view;
        button.classList.toggle("hidden", !visibleTabs.has(view) || !canAccessTab(view));
      });
      document.querySelectorAll(".module-home-action").forEach((button) => {
        const view = button.dataset.view;
        button.classList.toggle("hidden", !visibleTabs.has(view) || !canAccessTab(view));
      });
      document.querySelectorAll(".workspace-menu").forEach((menu) => {
        const tab = menu.querySelector(".workspace-tab");
        const hasVisibleSubitem = !!menu.querySelector(".workspace-subitem:not(.hidden)");
        menu.classList.toggle("hidden", !tab || (tab.classList.contains("hidden") && !hasVisibleSubitem));
      });

      const activeButton = document.querySelector(".workspace-tab.active:not(.hidden)");
      if (!activeButton) {
        const firstVisible = document.querySelector(".workspace-tab:not(.hidden)");
        if (firstVisible) showWorkspaceView(firstVisible.dataset.view);
      }
    }

    function canAccessTab(tabId) {
      if (!currentUser) return false;
      const permissions = currentUser.permissions || [];
      if (permissions.includes("*")) return true;
      const tab = (tabCatalog || []).find((item) => item.id === tabId) || getFallbackTabDefinition(tabId);
      return (tab.requiredAny || ["view"]).some((permission) => permission === "view" || permissions.includes(permission));
    }

    function getFallbackTabDefinition(tabId) {
      return {
        erp: { requiredAny: ["view"] },
        commercial: { requiredAny: ["events:read", "events:write", "quotes:write", "customers:write"] },
        events: { requiredAny: ["events:read", "events:write"] },
        purchases: { requiredAny: ["purchases:write"] },
        finance: { requiredAny: ["finance:read", "finance:write"] },
        hr: { requiredAny: ["hr:read", "hr:write", "payroll:read", "payroll:write"] },
        sanitation: { requiredAny: ["sanitation:read", "sanitation:write", "sanitation:approve"] },
        payment_orders: { requiredAny: ["payment_orders:read", "payment_orders:write", "payment_orders:approve"] },
        customers: { requiredAny: ["customers:write"] },
        providers: { requiredAny: ["providers:write"] },
        recipes: { requiredAny: ["recipes:read", "recipes:write"] },
        logistics_event: { requiredAny: ["logistics:read", "logistics:write"] },
        security: { requiredAny: ["users:write"] },
      }[tabId] || { requiredAny: ["view"] };
    }

    async function loadState() {
      try {
        const response = await fetch("/api/state");
        if (response.status === 401) {
          currentUser = null;
          showLoginScreen();
          return;
        }
        const state = await response.json();

        if (!state.ok) {
          throw new Error(state.error || "No se pudo cargar el panel.");
        }

        allChats = state.chats || [];
        renderMetrics(state.metrics || {});
        renderRows();
        updated.textContent = `Actualizado ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        rows.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      }
    }

    async function loadPurchaseOptions() {
      const response = await fetch("/api/purchase-options");
      const result = await response.json();

      if (!result.ok) {
        showNotice(result.error || "No se pudieron cargar las listas de compras.", "error");
        return;
      }

      purchaseOptions = result;
      renderPurchaseOptions();
    }

    function renderPurchaseOptions() {
      fillSelect("purchase-event", purchaseOptions.events || [], "Seleccionar evento");
      fillSelect("purchase-payment-method", purchaseOptions.paymentMethods || [], "Sin definir");
      fillSelect("purchase-funds-source", purchaseOptions.fundsSources || [], "Sin definir");
      const tablewareOptions = document.getElementById("tableware-product-options");
      if (tablewareOptions) {
        tablewareOptions.innerHTML = (purchaseOptions.products || [])
          .map((item) => `<option value="${escapeAttribute(item)}"></option>`)
          .join("");
      }
    }

    function fillSelect(id, items, placeholder) {
      const select = document.getElementById(id);
      if (!select) return;

      select.innerHTML = [
        `<option value="">${escapeHtml(placeholder)}</option>`,
        ...items.map((item) => `<option>${escapeHtml(item)}</option>`),
      ].join("");
    }

    function navigateWorkspaceItem(element) {
      if (!element) return;
      const view = element.dataset.view;
      const isPrimaryTab = element.classList.contains("workspace-tab");
      showWorkspaceView(view, {
        anchor: element.dataset.anchor || (isPrimaryTab ? MODULE_DEFAULT_SECTIONS[view] || "" : ""),
        action: element.dataset.action || "",
      });
    }

    function showWorkspaceView(view, options = {}) {
      if (!canAccessTab(view)) {
        const firstVisible = document.querySelector(".workspace-tab:not(.hidden)");
        if (firstVisible && firstVisible.dataset.view !== view) {
          showWorkspaceView(firstVisible.dataset.view);
        }
        return;
      }
      const navigationOptions = {
        ...options,
        anchor: options.anchor || (!options.action ? MODULE_DEFAULT_SECTIONS[view] || "" : ""),
      };
      document.querySelectorAll(".workspace-tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view);
      });
      document.querySelectorAll(".workspace-subitem").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view && (button.dataset.anchor || "") === (navigationOptions.anchor || "") && (button.dataset.action || "") === (navigationOptions.action || ""));
      });
      document.querySelectorAll(".workspace-view").forEach((section) => {
        section.classList.toggle("open", section.id === `view-${view}`);
      });

      let loadTask = Promise.resolve();
      if (view === "customers") loadTask = loadCustomers();
      if (view === "providers") loadTask = loadProviders();
      if (view === "recipes") loadTask = loadRecipes();
      if (["erp", "commercial", "purchases", "finance", "hr", "sanitation", "payment_orders"].includes(view)) loadTask = loadErp();
      if (view === "logistics_event") loadTask = loadLogisticsEvents();
      if (view === "security") loadTask = loadSecurityPanel();
      Promise.resolve(loadTask).finally(() => {
        setTimeout(() => runWorkspaceSubNavigation(view, navigationOptions), 80);
      });
    }

    function runWorkspaceSubNavigation(view, options = {}) {
      if (options.action && typeof window[options.action] === "function") {
        showModuleSection(view, MODULE_DEFAULT_SECTIONS[view] || "");
        window[options.action]();
        return;
      }
      if (options.anchor) {
        showModuleSection(view, options.anchor);
        return;
      }
      showModuleHome(view);
    }

    function scrollToWorkspaceAnchor(anchor) {
      const target = document.getElementById(anchor);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("section-focus");
      setTimeout(() => target.classList.remove("section-focus"), 1400);
    }

    async function loadErp() {
      const response = await fetch("/api/erp");
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo cargar el ERP.", "error");
        return;
      }

      erpData = result;
      currentUser = result.me || currentUser;
      panelRoles = result.roles || panelRoles;
      allRecipes = result.recipes || allRecipes;
      allCustomers = result.customers || allCustomers;
      allProviders = result.providers || allProviders;
      purchaseOrders = result.purchaseOrders || purchaseOrders || [];
      purchaseReceipts = result.purchaseReceipts || purchaseReceipts || [];
      renderCurrentUser();
      renderErp();
    }

    function renderErp() {
      const dashboard = erpData.dashboard || {};
      setText("erp-kpi-upcoming", dashboard.upcomingEvents || 0);
      setText("erp-kpi-open-quotes", dashboard.openQuotes || 0);
      setText("erp-kpi-revenue", formatCurrency(dashboard.estimatedRevenue || 0));
      setText("erp-kpi-done", dashboard.completedEvents || 0);
      setText("erp-kpi-margin", `${formatCurrency(dashboard.estimatedMargin || 0)} (${formatPercent(dashboard.estimatedMarginPercent || 0)})`);
      if (canAccessTab("erp")) {
        renderErpAlerts(dashboard.alerts || []);
        renderExecutiveSummary(dashboard);
        renderGlobalSearch();
      }
      if (canAccessTab("purchases")) {
        renderPurchaseDashboard();
        renderProductAlerts();
      }
      if (canAccessTab("finance")) renderFinanceDashboard();
      if (canAccessTab("hr")) renderHrDashboard();
      if (canAccessTab("sanitation")) renderSanitationDashboard();
      if (canAccessTab("payment_orders")) renderPaymentOrdersDashboard();
      if (canAccessTab("commercial")) {
        renderPipeline();
        renderVenueList();
        renderErpQuotes();
        renderCommercialCustomers();
      }
      if (canAccessTab("events")) {
        renderEventStatusDashboard(dashboard);
        renderErpEvents();
        renderErpQuotes();
      }
      renderErpQuoteEventOptions();
      renderErpCustomerOptions();
      renderErpVenueOptions();
      if (!document.getElementById("erp-form-modal")?.classList.contains("open")) {
        renderOperationalOptionInputs();
      }

      if (!document.querySelector("#erp-quote-lines .erp-quote-line")) {
        resetErpQuoteForm();
      }
      prepareModuleSections();
      restoreActiveModuleSectionForOpenView();
    }

    function restoreActiveModuleSectionForOpenView() {
      const openView = document.querySelector(".workspace-view.open");
      if (!openView) return;
      const view = openView.id.replace("view-", "");
      const anchor = activeModuleSections[view];
      if (anchor) {
        showModuleSection(view, anchor);
      } else {
        showModuleHome(view);
      }
    }

    function setText(id, value) {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    }

    function renderExecutiveSummary(dashboard = {}) {
      const container = document.getElementById("erp-executive-summary");
      if (!container) return;
      const purchases = dashboard.purchases || {};
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (erpData.events || [])
        .filter((event) => event.eventDate && event.eventDate >= today && ["confirmed", "production"].includes(event.status))
        .sort(compareEventsByDate)
        .slice(0, 5);
      const pendingClose = (erpData.events || [])
        .filter((event) => event.logisticsStatus === "pending_admin_close")
        .sort(compareEventsByDate);
      const unpaid = (erpData.purchases || [])
        .filter((purchase) => getPurchasePending(purchase) > 0)
        .sort((a, b) => getPurchasePending(b) - getPurchasePending(a))
        .slice(0, 5);
      const recentPurchases = (erpData.purchases || [])
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .slice(0, 5);
      container.innerHTML = `
        <div class="executive-hero">
          <div>
            <span>Lectura ejecutiva</span>
            <strong>${formatCurrency(dashboard.estimatedRevenue || 0)}</strong>
            <small>Venta aceptada · margen estimado ${formatCurrency(dashboard.estimatedMargin || 0)} (${formatPercent(dashboard.estimatedMarginPercent || 0)})</small>
          </div>
          <div class="executive-actions">
            <button class="approve" type="button" onclick="showWorkspaceView('events', { anchor: 'events-control-section' })">Ver eventos</button>
            <button class="filter" type="button" onclick="showProviderDebtWindow()">Deudas</button>
            <button class="filter" type="button" onclick="showWorkspaceView('security', { anchor: 'security-admin-control-section' })" data-permission="users:write">Panel admin</button>
          </div>
        </div>
        <div class="event-finance executive-metrics" style="margin-bottom:12px;">
          <div class="event-number"><span>Confirmados</span><strong>${escapeHtml(dashboard.confirmedEvents || 0)}</strong></div>
          <div class="event-number"><span>Proximos</span><strong>${escapeHtml(upcoming.length)}</strong></div>
          <div class="event-number warn"><span>Compras pendientes</span><strong>${formatCurrency(dashboard.pendingPurchaseAmount || 0)}</strong></div>
          <div class="event-number"><span>Total compras</span><strong>${formatCurrency(purchases.totalAmount || 0)}</strong></div>
          <div class="event-number highlight"><span>Cierres por autorizar</span><strong>${escapeHtml(pendingClose.length)}</strong></div>
        </div>
        <div class="admin-summary-grid">
          ${renderAdminSummaryList("Proximos eventos", upcoming, (event) => `
            <button class="summary-row" type="button" onclick="showEventOverview('${escapeAttribute(event.id)}')">
              <strong>${escapeHtml(event.name || "Sin nombre")}</strong>
              <span>${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")} · ${escapeHtml(event.clientName || "Sin cliente")} · ${escapeHtml(event.venue || "Sin lugar")}</span>
            </button>
          `)}
          ${renderAdminSummaryList("Cierres pendientes", pendingClose, (event) => `
            <button class="summary-row" type="button" onclick="showEventOverview('${escapeAttribute(event.id)}')">
              <strong>${escapeHtml(event.name || "Sin nombre")}</strong>
              <span>${hasCloseWithoutConformityRequest(event) ? "Logistica solicito cierre sin conformidad" : "Logistica solicito cierre"} · requiere autorizacion admin</span>
            </button>
          `)}
          ${renderAdminSummaryList("Mayores deudas", unpaid, (purchase) => `
            <button class="summary-row" type="button" onclick="showProviderDebt('${escapeAttribute(purchase.provider || "Sin proveedor")}')">
              <strong>${escapeHtml(purchase.provider || "Sin proveedor")} · ${formatCurrency(getPurchasePending(purchase))}</strong>
              <span>${escapeHtml(purchase.description || "Compra")} · ${escapeHtml(purchase.eventName || "Sin evento")}</span>
            </button>
          `)}
          ${renderAdminSummaryList("Compras recientes", recentPurchases, (purchase) => `
            <button class="summary-row" type="button" onclick="editPurchase('${escapeAttribute(purchase.id)}')">
              <strong>${escapeHtml(purchase.provider || "Sin proveedor")} · ${formatCurrency(getPurchaseTotal(purchase))}</strong>
              <span>${escapeHtml(formatShortDate(purchase.date) || purchase.date || "")} · ${escapeHtml(purchase.description || "")}</span>
            </button>
          `)}
        </div>
      `;
    }

    function renderAdminSummaryList(title, items, renderer) {
      return `
        <section class="admin-summary-card">
          <h3>${escapeHtml(title)}</h3>
          ${items.length ? items.map(renderer).join("") : `<div class="empty compact-empty">Sin datos para mostrar.</div>`}
        </section>
      `;
    }

    function renderEventStatusDashboard(dashboard = {}) {
      const container = document.getElementById("event-status-dashboard");
      if (!container) return;
      const events = erpData.events || [];
      const statusGroups = [
        ["lead", "Consulta"],
        ["quoted", "Presupuestado"],
        ["confirmed", "Confirmado"],
        ["production", "Produccion"],
        ["done", "Realizado"],
        ["lost", "Perdido"],
        ["cancelled", "Cancelado"],
      ];
      const counts = dashboard.statusCounts || {};
      const sortedEvents = events
        .slice()
        .sort((a, b) => String(b.eventDate || "").localeCompare(String(a.eventDate || "")));
      container.innerHTML = `
        <div class="event-finance">
          <button class="event-number status-tile" type="button" onclick="filterEventStatusRows('all')">
            <span>Todos</span>
            <strong>${escapeHtml(events.length || 0)}</strong>
          </button>
          ${statusGroups.map(([status, label]) => `
            <button class="event-number status-tile" type="button" onclick="filterEventStatusRows('${escapeAttribute(status)}')">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(counts[status] || 0)}</strong>
            </button>
          `).join("")}
          <button class="event-number status-tile" type="button" onclick="filterEventStatusRows('missing_conformity')">
            <span>Sin conformidad</span>
            <strong>${escapeHtml(dashboard.conformityPending || 0)}</strong>
          </button>
        </div>
        <div class="purchase-table-wrap event-status-table-wrap" style="margin-top:12px;">
          <table class="purchase-table event-status-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Conformidad</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="event-status-rows">
              ${renderEventStatusRows(sortedEvents)}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderEventStatusRows(events) {
      if (!events.length) {
        return `<tr><td colspan="6"><div class="empty compact-empty">Sin eventos para mostrar.</div></td></tr>`;
      }
      return events.map((event) => `
        <tr data-status="${escapeAttribute(event.status || "")}" data-conformity="${getEventConformityState(event)}">
          <td>${escapeHtml(event.name || "Sin nombre")}</td>
          <td>${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")}</td>
          <td>${escapeHtml(event.clientName || "Sin cliente")}</td>
          <td><span class="badge ${event.status === "done" ? "confirmed" : event.status === "lost" || event.status === "cancelled" ? "lost" : "missing_info"}">${escapeHtml(getErpEventStatusLabel(event.status))}</span></td>
          <td>${renderEventConformityBadge(event)}</td>
          <td>
            <button class="menu-dot" type="button" onclick="showEventActions('${escapeAttribute(event.id)}')">...</button>
          </td>
        </tr>
      `).join("");
    }

    function eventRequiresConformity(event = {}) {
      return ["confirmed", "production", "done"].includes(event.status);
    }

    function getEventConformityState(event = {}) {
      if (!eventRequiresConformity(event)) return "not_required";
      if (event.conformityWaiver?.approved) return "waived";
      return event.clientConformity?.fileName ? "uploaded" : "missing";
    }

    function renderEventConformityBadge(event = {}) {
      const state = getEventConformityState(event);
      if (state === "not_required") return `<span class="badge referred">No aplica</span>`;
      if (state === "waived") return `<span class="badge ready_to_quote">Autorizado sin PDF</span>`;
      if (state === "uploaded") return `<span class="badge confirmed">PDF cargado</span>`;
      return `<span class="badge missing_info">Pendiente</span>`;
    }

    function filterEventStatusRows(status) {
      const rows = Array.from(document.querySelectorAll("#event-status-rows tr"));
      rows.forEach((row) => {
        if (!row.dataset.status) return;
        const visible = status === "all"
          ? true
          : status === "missing_conformity"
          ? row.dataset.conformity === "missing"
          : row.dataset.status === status;
        row.classList.toggle("hidden", !visible);
      });
    }

    function renderErpAlerts(alerts) {
      const container = document.getElementById("erp-alerts");
      if (!container) return;
      if (!alerts.length) {
        container.innerHTML = `<div class="empty">Sin alertas criticas. El sistema esta ordenado.</div>`;
        return;
      }

      container.innerHTML = `<div class="alert-grid">${alerts.map((alert) => `
        <div class="erp-alert ${escapeAttribute(alert.type || "")}" onclick="showErpAlertDetail('${escapeAttribute(alert.title || "")}')">
          <div class="alert-mark">!</div>
          <div>
            <div class="primary">${escapeHtml(alert.title)}</div>
            <div class="secondary">${escapeHtml(alert.detail)}</div>
          </div>
          <div class="alert-action">...</div>
        </div>
      `).join("")}</div>`;
    }

    function renderSecurityShell() {
      fillPanelRoleSelect();
      if (can("users:write")) {
        loadSecurityPanel();
        renderAdminControlSummary();
      }
    }

    function fillPanelRoleSelect() {
      const select = document.getElementById("panel-user-role");
      if (!select) return;
      select.innerHTML = panelRoles
        .map((role) => `<option value="${escapeAttribute(role.id)}">${escapeHtml(role.label)}</option>`)
        .join("");
    }

    async function loadSecurityPanel() {
      if (!can("users:write")) return;
      try {
        await Promise.all([loadPanelUsers(), loadPanelRoles(), loadAuditLog()]);
      } catch (error) {
        showNotice(error.message, "error");
      }
    }

    async function loadPanelUsers() {
      const response = await fetch("/api/users");
      const result = await readJsonResponse(response);
      if (!result.ok) throw new Error(result.error || "No se pudieron cargar usuarios.");
      panelUsers = result.users || [];
      panelRoles = result.roles || panelRoles;
      fillPanelRoleSelect();
      renderPanelUsers();
    }

    async function loadPanelRoles() {
      const response = await fetch("/api/roles");
      const result = await readJsonResponse(response);
      if (!result.ok) throw new Error(result.error || "No se pudieron cargar permisos.");
      panelRoles = result.roles || panelRoles;
      permissionCatalog = result.permissions || [];
      tabCatalog = result.tabs || [];
      fillPanelRoleSelect();
      renderRolePermissions();
      renderAdminControlSummary();
    }

    function renderAdminControlSummary() {
      const container = document.getElementById("admin-control-summary");
      if (!container) return;
      const views = tabCatalog.length ? tabCatalog : [
        { id: "erp", label: "ERP" },
        { id: "commercial", label: "Comercial" },
        { id: "events", label: "Eventos" },
        { id: "purchases", label: "Compras" },
        { id: "finance", label: "Finanzas" },
        { id: "hr", label: "Personal/RRHH" },
        { id: "sanitation", label: "Bromatologia" },
        { id: "payment_orders", label: "Ordenes de pago" },
        { id: "customers", label: "Clientes" },
        { id: "providers", label: "Proveedores" },
        { id: "recipes", label: "Recetas" },
        { id: "logistics_event", label: "Logistica Evento" },
        { id: "security", label: "Seguridad" },
      ];
      const metrics = [
        ["Eventos", erpData.events?.length || 0],
        ["Compras", erpData.purchases?.length || 0],
        ["Clientes", erpData.customers?.length || allCustomers.length || 0],
        ["Proveedores", allProviders.length || erpData.providers?.length || 0],
        ["Recetas", erpData.recipes?.length || 0],
        ["Usuarios", panelUsers.length || 0],
      ];
      container.innerHTML = `
        <section class="admin-summary-card admin-control-hero">
          <h3>Acciones rápidas</h3>
          <div class="admin-control-actions">
            <button class="approve" type="button" onclick="showModuleSection('security', 'security-roles-section')">Editar permisos</button>
            <button class="filter" type="button" onclick="showModuleSection('security', 'security-users-section')">Usuarios</button>
            <button class="filter" type="button" onclick="showModuleSection('security', 'security-audit-section')">Historial</button>
            <button class="filter" type="button" onclick="showCostSettingsForm()">Opciones operativas</button>
          </div>
        </section>
        ${renderAdminSummaryList("Vistas del sistema", views, (view) => `
          <button class="summary-row" type="button" onclick="showWorkspaceView('${escapeAttribute(view.id)}')"><strong>${escapeHtml(view.label || view.id)}</strong><span>${escapeHtml(view.id)}</span></button>
        `)}
        ${renderAdminSummaryList("Funciones / permisos", permissionCatalog, (permission) => `
          <button class="summary-row" type="button" onclick="showModuleSection('security', 'security-roles-section'); document.getElementById('role-permissions-list')?.scrollIntoView({behavior:'smooth'});"><strong>${escapeHtml(permission.label || permission.id)}</strong><span>${escapeHtml(permission.group || "General")} · ${escapeHtml(permission.id)}</span></button>
        `)}
        <section class="admin-summary-card">
          <h3>Opciones editables</h3>
          <button class="summary-row" type="button" onclick="showCostSettingsForm()">
            <strong>Servicios, momentos, bebidas e insumos sugeridos</strong>
            <span>Abre la configuracion operativa del sistema</span>
          </button>
          <button class="summary-row" type="button" onclick="showQuickVenueForm()">
            <strong>Lugares / venues</strong>
            <span>Alta y edicion de ubicaciones, mapas y referencias</span>
          </button>
          <button class="summary-row" type="button" onclick="showProviderManagerWindow()">
            <strong>Proveedores</strong>
            <span>Datos fiscales, bancarios y contacto</span>
          </button>
        </section>
        ${renderAdminSummaryList("Roles", panelRoles, (role) => `
          <button class="summary-row" type="button" onclick="showModuleSection('security', 'security-roles-section'); focusRolePermissionCard('${escapeAttribute(role.id)}');">
            <strong>${escapeHtml(role.label || role.id)}</strong>
            <span>${escapeHtml((role.tabs || []).length)} vistas · ${escapeHtml((role.permissions || []).join(", ") || "Sin permisos")}</span>
          </button>
        `)}
        ${renderAdminSummaryList("Estadisticas", metrics, (metric) => `
          <div class="summary-row"><strong>${escapeHtml(metric[0])}</strong><span>${escapeHtml(metric[1])}</span></div>
        `)}
      `;
    }

    async function loadAuditLog() {
      const response = await fetch("/api/audit-log?limit=160");
      const result = await readJsonResponse(response);
      if (!result.ok) throw new Error(result.error || "No se pudo cargar el historial.");
      auditLog = result.audit || [];
      const filter = document.getElementById("audit-user-filter");
      if (filter) filter.dataset.ready = "";
      renderAuditLog();
    }

    function renderPanelUsers() {
      const list = document.getElementById("user-list");
      if (!list) return;
      if (!panelUsers.length) {
        list.innerHTML = `<div class="empty">Sin usuarios cargados.</div>`;
        return;
      }
      list.innerHTML = panelUsers.map((user) => `
        <div class="user-row">
          <strong>${escapeHtml(user.displayName || user.username)}</strong>
          <div class="secondary">${escapeHtml(user.username)} | ${escapeHtml(user.roleLabel || user.role)}</div>
          <div class="actions" style="margin-top:8px;">
            <button class="filter" type="button" onclick="editPanelUser('${escapeAttribute(user.id)}')">Editar</button>
          </div>
        </div>
      `).join("");
    }

    function renderRolePermissions() {
      const list = document.getElementById("role-permissions-list");
      if (!list) return;
      if (!panelRoles.length || !permissionCatalog.length) {
        list.innerHTML = `<div class="empty">Sin permisos para mostrar.</div>`;
        return;
      }

      list.innerHTML = panelRoles.map((role) => {
        const isAdmin = role.id === "admin";
        const rolePermissions = new Set(role.permissions || []);
        const roleTabs = new Set(role.tabs || []);
        return `
          <div class="user-row role-permission-card" data-role-id="${escapeAttribute(role.id)}">
            <strong>${escapeHtml(role.label)}</strong>
            <div class="secondary">${isAdmin ? "Acceso total protegido" : "Seleccione funciones disponibles para este rol"}</div>
            <div class="secondary" style="margin-top:8px;">Funciones</div>
            <div class="permission-grid">
              ${permissionCatalog.map((permission) => {
                const checked = isAdmin || rolePermissions.has("*") || rolePermissions.has(permission.id);
                return `
                  <label class="permission-check permission-option">
                    <input type="checkbox" value="${escapeAttribute(permission.id)}" ${checked ? "checked" : ""} ${isAdmin ? "disabled" : ""}>
                    <span>${escapeHtml(permission.label)}</span>
                    <small>${escapeHtml(permission.group)}</small>
                  </label>
                `;
              }).join("")}
            </div>
            <div class="secondary" style="margin-top:12px;">Pestañas visibles</div>
            <div class="permission-grid">
              ${tabCatalog.map((tab) => {
                const requiredForAdmin = isAdmin && tab.id === "security";
                const allowed = isAdmin || rolePermissions.has("*") || (tab.requiredAny || []).some((permission) => permission === "view" || rolePermissions.has(permission));
                const checked = requiredForAdmin || (allowed && roleTabs.has(tab.id));
                return `
                  <label class="permission-check tab-option ${allowed ? "" : "muted-option"}">
                    <input type="checkbox" value="${escapeAttribute(tab.id)}" ${checked ? "checked" : ""} ${requiredForAdmin || !allowed ? "disabled" : ""}>
                    <span>${escapeHtml(tab.label)}</span>
                    <small>${requiredForAdmin ? "Siempre visible para administrar" : allowed ? "Disponible para el rol" : "Requiere habilitar funcion"}</small>
                  </label>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("");
    }

    function focusRolePermissionCard(roleId) {
      const card = document.querySelector(`.role-permission-card[data-role-id="${cssEscape(roleId)}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("section-focus");
      setTimeout(() => card.classList.remove("section-focus"), 1400);
    }

    function cssEscape(value) {
      if (window.CSS?.escape) return CSS.escape(String(value || ""));
      return String(value || "").replace(/["\\]/g, "\\$&");
    }

    function stripHtml(html) {
      const div = document.createElement("div");
      div.innerHTML = String(html || "");
      return div.textContent || div.innerText || "";
    }

    async function saveRolePermissions(event) {
      event.preventDefault();
      const roles = Array.from(document.querySelectorAll(".role-permission-card")).map((card) => ({
        id: card.dataset.roleId,
        permissions: Array.from(card.querySelectorAll(".permission-option input[type='checkbox']:checked")).map((input) => input.value),
        tabs: Array.from(card.querySelectorAll(".tab-option input[type='checkbox']:checked")).map((input) => input.value),
      }));
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudieron guardar permisos.", "error");
        return;
      }
      panelRoles = result.roles || panelRoles;
      permissionCatalog = result.permissions || permissionCatalog;
      renderRolePermissions();
      await refreshCurrentUser();
      await loadAuditLog();
      showNotice("Permisos guardados.", "success");
    }

    async function refreshCurrentUser() {
      const response = await fetch("/api/me");
      const result = await readJsonResponse(response);
      if (result.ok && result.authenticated) {
        currentUser = result.user;
        panelRoles = result.roles || panelRoles;
        renderCurrentUser();
      }
    }

    function renderAuditLog() {
      const list = document.getElementById("audit-list");
      if (!list) return;
      const filter = document.getElementById("audit-user-filter");
      if (filter && !filter.dataset.ready) {
        const users = Array.from(new Set(auditLog.map((item) => item.userName || "Sistema").filter(Boolean))).sort();
        filter.innerHTML = `<option value="">Todos los usuarios</option>${users.map((user) => `<option value="${escapeAttribute(user)}">${escapeHtml(user)}</option>`).join("")}`;
        filter.dataset.ready = "true";
      }
      const selectedUser = filter?.value || "";
      const visibleAudit = selectedUser ? auditLog.filter((item) => (item.userName || "Sistema") === selectedUser) : auditLog;
      if (!visibleAudit.length) {
        list.innerHTML = `<div class="empty">Todavia no hay movimientos registrados.</div>`;
        return;
      }
      list.innerHTML = visibleAudit.map((item) => `
        <div class="audit-row">
          <strong>${escapeHtml(getAuditActionLabel(item.action))} | ${escapeHtml(item.label || item.entityType || "")}</strong>
          <div class="secondary">${escapeHtml(item.userName || "Sistema")} | ${escapeHtml(item.userRole || "")} | ${escapeHtml(formatDate(item.at) || item.at || "")}</div>
          <div class="secondary">${escapeHtml(getAuditEntityLabel(item.entityType))}${item.entityId ? ` | ${escapeHtml(item.entityId)}` : ""}</div>
        </div>
      `).join("");
    }

    function getAuditActionLabel(action) {
      return {
        login: "Ingreso",
        logout: "Salida",
        create: "Creacion",
        update: "Edicion",
        delete: "Eliminacion",
        payment: "Pago",
        import: "Importacion",
        sync: "Sincronizacion",
        upsert: "Actualizacion",
        upload: "Carga de archivo",
      }[action] || action || "Movimiento";
    }

    function getAuditEntityLabel(type) {
      return {
        event: "Evento",
        quote: "Presupuesto",
        purchase: "Compra",
        provider: "Proveedor",
        customer: "Cliente",
        venue: "Lugar",
        recipe: "Receta",
        user: "Usuario",
        session: "Sesion",
      }[type] || type || "Registro";
    }

    function editPanelUser(id) {
      const user = panelUsers.find((item) => item.id === id);
      if (!user) return;
      const form = document.getElementById("user-form");
      setFormValue(form, "id", user.id || "");
      setFormValue(form, "displayName", user.displayName || "");
      setFormValue(form, "username", user.username || "");
      setFormValue(form, "role", user.role || "comercial");
      setFormValue(form, "password", "");
    }

    function resetPanelUserForm() {
      document.getElementById("user-form").reset();
      document.getElementById("user-form").elements.id.value = "";
    }

    async function savePanelUser(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el usuario.", "error");
        return;
      }
      panelUsers = result.users || panelUsers;
      resetPanelUserForm();
      renderPanelUsers();
      await loadAuditLog();
      showNotice("Usuario guardado.", "success");
    }

    function downloadErpXlsx() {
      window.location.href = "/api/export.xlsx";
    }

    function showErpEventForm() {
      ensureGlobalErpFormModal();
      document.getElementById("erp-form-modal-title").textContent = "Crear evento";
      document.getElementById("erp-event-card").classList.remove("hidden");
      document.getElementById("erp-quote-card").classList.add("hidden");
      if (!document.querySelector("#event-menu-items .menu-line")) renderEventMenuLines();
      if (!document.querySelector("#event-stock-items .stock-line")) renderEventStockLines();
      if (!document.querySelector("#event-operational-checklist .event-operational-category")) renderEventOperationalChecklist();
      document.getElementById("erp-form-modal").classList.add("open");
    }

    function showBlankErpEventForm() {
      resetErpEventForm();
      showErpEventForm();
    }

    function showErpQuoteForm() {
      ensureGlobalErpFormModal();
      document.getElementById("erp-form-modal-title").textContent = "Presupuesto rentable";
      document.getElementById("erp-event-card").classList.add("hidden");
      document.getElementById("erp-quote-card").classList.remove("hidden");
      document.getElementById("erp-form-modal").classList.add("open");
    }

    function ensureGlobalErpFormModal() {
      const modal = document.getElementById("erp-form-modal");
      if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
      }
    }

    function hideErpForms() {
      document.getElementById("erp-form-modal").classList.remove("open");
    }

    function closeErpForms(event) {
      if (event.target.id === "erp-form-modal") {
        hideErpForms();
      }
    }

    function showErpAlertDetail(title) {
      const alert = (erpData.dashboard?.alerts || []).find((item) => item.title === title);
      const body = document.getElementById("alert-detail-body");
      document.getElementById("alert-detail-title").textContent = alert?.title || title || "Alerta";
      document.getElementById("alert-detail-subtitle").textContent = alert?.detail || "";

      if (title.includes("Compras pendientes")) {
        const purchases = (erpData.purchases || []).filter((purchase) => purchase.paymentStatus !== "Pagado");
        body.innerHTML = `
          ${field("Que pasa", "Hay compras cargadas que todavia figuran pendientes de pago.")}
          ${field("Como solucionarlo", "Revisar el pago, actualizar la planilla si ya se pago, o cargar el medio/origen de fondos en la compra siguiente.")}
          ${renderAlertList(purchases.map((purchase) => `${purchase.provider} | ${purchase.description} | ${formatCurrency(purchase.totalAmount)} | ${purchase.eventName || "Sin evento"}`))}
          <div class="actions"><button class="approve" onclick="showPurchaseForm(); hideAlertDetail();">Cargar compra</button></div>
        `;
      } else if (title.includes("Recetas sin precio")) {
        const recipes = (erpData.recipes || allRecipes || []).filter((recipe) =>
          (recipe.items || []).some((item) => item.type !== "recipe" && !recipeProducts[normalizeSearch(item.name)])
        );
        body.innerHTML = `
          ${field("Que pasa", "Hay recetas con insumos que todavia no tienen ultimo precio de compra guardado.")}
          ${field("Como solucionarlo", "Cargar una compra con esos productos o editar la receta para revisar el nombre del insumo.")}
          ${renderAlertList((recipes.length ? recipes : (erpData.recipes || allRecipes || [])).slice(0, 8).map((recipe) => recipe.name))}
          <div class="actions"><button class="approve" onclick="showPurchaseForm(); hideAlertDetail();">Cargar precio por compra</button><button class="filter" onclick="showWorkspaceView('recipes'); hideAlertDetail();">Ver recetas</button></div>
        `;
      } else if (title.includes("Insumos con variacion")) {
        const alerts = getSortedProductAlerts();
        body.innerHTML = `
          ${field("Que pasa", "Uno o mas insumos cambiaron fuerte de precio y pueden modificar el costo real de recetas y presupuestos.")}
          ${field("Como solucionarlo", "Revisar los productos afectados y actualizar presupuestos si el margen quedo bajo.")}
          <input id="product-alert-search" class="search" placeholder="Buscar insumo, proveedor o receta" oninput="renderProductAlertDetailRows()">
          <div id="product-alert-detail-list">${renderProductAlertRows(alerts)}</div>
        `;
      } else {
        body.innerHTML = `
          ${field("Resumen", alert?.detail || "Alerta del centro de control.")}
          ${field("Accion sugerida", "Revisar los registros relacionados y actualizar estado, precio o seguimiento segun corresponda.")}
        `;
      }

      document.getElementById("alert-detail").classList.add("open");
    }

    function renderAlertList(items) {
      if (!items.length) return `<div class="empty">No hay registros para mostrar.</div>`;
      return items.map((item) => `<div class="field"><div>${escapeHtml(item)}</div></div>`).join("");
    }

    function getSortedProductAlerts() {
      return [...(erpData.productAlerts || [])].sort((a, b) =>
        Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0))
      );
    }

    function renderProductAlertRows(items) {
      if (!items.length) return `<div class="empty">No hay insumos para mostrar.</div>`;
      return `
        <div class="alert-list-scroll">
          ${items.map((item) => `
            <div class="alert-row">
              <div>
                <strong>${escapeHtml(item.name || "Insumo sin nombre")}</strong>
                <div class="secondary">${escapeHtml(item.provider || "Sin proveedor")} | ${escapeHtml(item.lastPurchaseDate || "Sin fecha")}</div>
                <div class="secondary">${escapeHtml((item.affectedRecipes || []).slice(0, 4).join(", ") || "Sin recetas afectadas")}${(item.affectedRecipes || []).length > 4 ? ` +${(item.affectedRecipes || []).length - 4}` : ""}</div>
              </div>
              <strong>${formatPercent(item.changePercent || 0)}</strong>
              <span>${formatCurrency(item.previousUnitCost || 0)} -> ${formatCurrency(item.unitCost || 0)}</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderProductAlertDetailRows() {
      const term = normalizeSearch(document.getElementById("product-alert-search")?.value || "");
      const alerts = getSortedProductAlerts().filter((item) => {
        const haystack = `${item.name || ""} ${item.provider || ""} ${(item.affectedRecipes || []).join(" ")}`;
        return !term || normalizeSearch(haystack).includes(term);
      });
      const container = document.getElementById("product-alert-detail-list");
      if (container) container.innerHTML = renderProductAlertRows(alerts);
    }

    function hideAlertDetail() {
      document.getElementById("alert-detail").classList.remove("open");
    }

    function closeAlertDetail(event) {
      if (event.target.id === "alert-detail") {
        hideAlertDetail();
      }
    }

    function renderPurchaseOrderBoard() {
      const orders = purchaseOrders || erpData.purchaseOrders || [];
      return `
        <section class="purchase-order-result-card" style="margin-bottom:12px;">
          <div class="toolbar-actions" style="justify-content:space-between;">
            <div>
              <h3 style="margin:0;">Ordenes de compra</h3>
              <p class="subtitle" style="margin:4px 0 0;">Ordenes adjuntas a eventos, editables y agrupadas por proveedor sugerido.</p>
            </div>
            <button class="filter" type="button" onclick="showPurchaseOrderForm()">Nueva orden</button>
          </div>
          ${orders.length ? `
            <div class="purchase-order-list" style="margin-top:10px;">
              ${orders.slice(0, 8).map((order) => `
                <div class="purchase-order-list-row" onclick="showPurchaseOrderForm('${escapeAttribute(order.id)}')">
                  <div>
                    <strong>${escapeHtml(order.title || "Orden de compra")}</strong>
                    <div class="secondary">${escapeHtml(order.eventName || "Sin evento")} · ${escapeHtml(order.menuType || "Sin tipo")} · ${escapeHtml(order.items?.length || 0)} producto(s)</div>
                    <div class="secondary">Recepcion: ${escapeHtml(order.receiptSummary?.label || getPurchaseReceiptStatusLabel("pending"))}${order.receiptSummary?.hasUnresolvedDifferences ? " · Diferencias pendientes" : ""}${order.receiptSummary?.convertedPurchaseId ? " · Compra creada" : ""}</div>
                  </div>
                  <div>${escapeHtml(getPurchaseOrderStatusLabel(order.status))}</div>
                  <div class="actions" onclick="event.stopPropagation()">
                    <button class="filter" type="button" onclick="showPurchaseOrderForm('${escapeAttribute(order.id)}')">Editar</button>
                    <button class="approve" type="button" onclick="showPurchaseReceiptForm('${escapeAttribute(order.id)}')">Recibir</button>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty compact-empty" style="margin-top:10px;">Todavia no hay ordenes de compra guardadas.</div>`}
        </section>
      `;
    }

    function renderInventoryBoard() {
      const inventory = erpData.inventory || [];
      return `
        <section class="purchase-order-result-card" style="margin-bottom:12px;">
          <div class="toolbar-actions" style="justify-content:space-between;">
            <div>
              <h3 style="margin:0;">Inventario</h3>
              <p class="subtitle" style="margin:4px 0 0;">Stock generado desde recepciones aceptadas y convertidas.</p>
            </div>
            <span class="badge">${escapeHtml(inventory.length)} item(s)</span>
          </div>
          ${inventory.length ? `
            <div class="purchase-order-list" style="margin-top:10px;max-height:220px;">
              ${inventory.slice(0, 12).map((item) => `
                <div class="purchase-order-list-row">
                  <strong>${escapeHtml(item.productName || "Producto")}</strong>
                  <div>${escapeHtml(item.itemTypeLabel || getReceiptItemTypeLabel(item.itemType))}</div>
                  <div>${escapeHtml(formatSmartNumber(item.quantity || 0))} ${escapeHtml(item.unit || "")}</div>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty compact-empty" style="margin-top:10px;">Todavia no hay stock generado desde recepciones.</div>`}
        </section>
      `;
    }

    function getPurchaseOrderStatusLabel(status) {
      return {
        draft: "Borrador",
        sent: "Enviada",
        fulfilled: "Comprada",
        cancelled: "Cancelada",
      }[status] || "Borrador";
    }

    function getPurchaseReceiptStatusLabel(status) {
      return {
        pending: "Sin recibir",
        partial: "Parcial",
        complete: "Completa",
        with_differences: "Con diferencias",
      }[status] || "Sin recibir";
    }

    function renderPurchaseDashboard() {
      const container = document.getElementById("purchase-dashboard");
      if (!container) return;
      const allPurchases = erpData.purchases || [];
      const visiblePurchases = getVisiblePurchasesByPeriod();
      const summary = buildPurchaseSummary(visiblePurchases);
      const period = getPurchasePeriodRange();

      if (!allPurchases.length) {
        container.innerHTML = `
          <div class="empty">Todavia no hay compras cargadas desde el sistema.</div>
        `;
        renderPurchaseSecondaryBoards();
        return;
      }

      container.innerHTML = `
        <section class="purchase-period-bar">
          <div class="purchase-period-field">
            <label>Periodo</label>
            <select id="purchase-period-preset">
              <option value="last30" ${purchasePeriodFilter.preset === "last30" ? "selected" : ""}>Ultimos 30 dias</option>
              <option value="today" ${purchasePeriodFilter.preset === "today" ? "selected" : ""}>Hoy</option>
              <option value="last7" ${purchasePeriodFilter.preset === "last7" ? "selected" : ""}>Ultimos 7 dias</option>
              <option value="currentMonth" ${purchasePeriodFilter.preset === "currentMonth" ? "selected" : ""}>Mes actual</option>
              <option value="last90" ${purchasePeriodFilter.preset === "last90" ? "selected" : ""}>Ultimos 90 dias</option>
              <option value="all" ${purchasePeriodFilter.preset === "all" ? "selected" : ""}>Todo el historial</option>
              <option value="custom" ${purchasePeriodFilter.preset === "custom" ? "selected" : ""}>Personalizado</option>
            </select>
          </div>
          <div class="purchase-period-field">
            <label>Desde</label>
            <input id="purchase-period-from" type="date" value="${escapeAttribute(period.from || "")}" ${purchasePeriodFilter.preset === "custom" ? "" : "disabled"}>
          </div>
          <div class="purchase-period-field">
            <label>Hasta</label>
            <input id="purchase-period-to" type="date" value="${escapeAttribute(period.to || "")}" ${purchasePeriodFilter.preset === "custom" ? "" : "disabled"}>
          </div>
          <div class="purchase-period-summary">${escapeHtml(period.label)} · ${visiblePurchases.length} de ${allPurchases.length} compra(s)</div>
        </section>
        <section class="purchase-kpis">
          <div class="purchase-kpi"><span>Total compras</span><strong>${formatCurrency(summary.totalAmount || 0)}</strong></div>
          <div class="purchase-kpi"><span>Pagado</span><strong>${formatCurrency(summary.paidAmount || 0)}</strong></div>
          <div class="purchase-kpi"><span>Pendiente</span><strong>${formatCurrency(summary.pendingAmount || 0)}</strong></div>
          <div class="purchase-kpi"><span>Ticket promedio</span><strong>${formatCurrency(summary.averageTicket || 0)}</strong></div>
          <div class="purchase-kpi"><span>Proveedores</span><strong>${escapeHtml(summary.providersCount || 0)}</strong></div>
        </section>
        <section class="purchase-panels">
          ${renderPurchaseRank("Por proveedor", "byProvider", summary.byProvider || [])}
          ${renderPurchaseRank("Por evento", "byEvent", summary.byEvent || [])}
          ${renderPurchaseRank("Por medio de pago", "byPaymentMethod", summary.byPaymentMethod || [])}
        </section>
        <div class="toolbar-actions" style="margin-top:4px;">
          <input id="purchase-dashboard-search" class="search" placeholder="Filtrar compras por proveedor, producto, evento o pago">
          <select id="purchase-dashboard-status">
            <option value="">Todos los pagos</option>
            <option value="Pagado">Pagado</option>
            <option value="Parcial">Parcial</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>
        <div id="purchase-table-wrap"></div>
      `;

      document.getElementById("purchase-period-preset").addEventListener("change", (event) => {
        const previousPeriod = getPurchasePeriodRange();
        purchasePeriodFilter.preset = event.target.value;
        if (purchasePeriodFilter.preset === "custom") {
          purchasePeriodFilter.from = purchasePeriodFilter.from || previousPeriod.from || toDateValue(addDays(new Date(), -29));
          purchasePeriodFilter.to = purchasePeriodFilter.to || previousPeriod.to || toDateValue(new Date());
        }
        renderPurchaseDashboard();
      });
      document.getElementById("purchase-period-from").addEventListener("change", (event) => {
        purchasePeriodFilter.from = event.target.value;
        purchasePeriodFilter.preset = "custom";
        renderPurchaseDashboard();
      });
      document.getElementById("purchase-period-to").addEventListener("change", (event) => {
        purchasePeriodFilter.to = event.target.value;
        purchasePeriodFilter.preset = "custom";
        renderPurchaseDashboard();
      });
      document.getElementById("purchase-dashboard-search").addEventListener("input", renderPurchaseTable);
      document.getElementById("purchase-dashboard-status").addEventListener("change", renderPurchaseTable);
      renderPurchaseTable();
      renderPurchaseSecondaryBoards();
    }

    function renderPurchaseSecondaryBoards() {
      const orderContainer = document.getElementById("purchase-orders-dashboard");
      const inventoryContainer = document.getElementById("purchase-inventory-dashboard");
      if (orderContainer) orderContainer.innerHTML = renderPurchaseOrderBoard();
      if (inventoryContainer) inventoryContainer.innerHTML = renderInventoryBoard();
    }

    function getVisiblePurchasesByPeriod() {
      const period = getPurchasePeriodRange();
      return (erpData.purchases || []).filter((purchase) => isPurchaseInsidePeriod(purchase, period));
    }

    function getPurchasePeriodRange() {
      const today = new Date();
      const preset = purchasePeriodFilter.preset || "last30";

      if (preset === "all") {
        return { from: "", to: "", label: "Todo el historial" };
      }

      if (preset === "custom") {
        return {
          from: purchasePeriodFilter.from || "",
          to: purchasePeriodFilter.to || "",
          label: formatPeriodLabel(purchasePeriodFilter.from, purchasePeriodFilter.to, "Periodo personalizado"),
        };
      }

      if (preset === "today") {
        const value = toDateValue(today);
        return { from: value, to: value, label: "Hoy" };
      }

      if (preset === "last7") {
        return {
          from: toDateValue(addDays(today, -6)),
          to: toDateValue(today),
          label: "Ultimos 7 dias",
        };
      }

      if (preset === "currentMonth") {
        return {
          from: toDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
          to: toDateValue(today),
          label: "Mes actual",
        };
      }

      if (preset === "last90") {
        return {
          from: toDateValue(addDays(today, -89)),
          to: toDateValue(today),
          label: "Ultimos 90 dias",
        };
      }

      return {
        from: toDateValue(addDays(today, -29)),
        to: toDateValue(today),
        label: "Ultimos 30 dias",
      };
    }

    function isPurchaseInsidePeriod(purchase, period) {
      if (!period.from && !period.to) return true;

      const value = normalizePurchaseDate(purchase.date);
      if (!value) return false;
      if (period.from && value < period.from) return false;
      if (period.to && value > period.to) return false;
      return true;
    }

    function buildPurchaseSummary(purchases) {
      const summary = {
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        averageTicket: 0,
        providersCount: 0,
        byProvider: [],
        byEvent: [],
        byPaymentMethod: [],
      };
      const providers = new Set();
      const providerTotals = {};
      const eventTotals = {};
      const paymentTotals = {};

      purchases.forEach((purchase) => {
        const total = getPurchaseTotal(purchase);
        const paid = Number(purchase.paidAmount || (purchase.paymentStatus === "Pagado" ? total : 0));
        const pending = getPurchasePending(purchase);
        summary.totalAmount += total;
        summary.paidAmount += paid;
        summary.pendingAmount += pending;

        const provider = purchase.provider || "Sin proveedor";
        providers.add(provider);
        addPurchaseGroupTotal(providerTotals, provider, total);
        addPurchaseGroupTotal(eventTotals, purchase.eventName || "Sin evento", total);
        addPurchaseGroupTotal(paymentTotals, purchase.paymentMethod || "Sin definir", total);
      });

      summary.providersCount = providers.size;
      summary.averageTicket = purchases.length ? summary.totalAmount / purchases.length : 0;
      summary.byProvider = sortPurchaseGroups(providerTotals);
      summary.byEvent = sortPurchaseGroups(eventTotals);
      summary.byPaymentMethod = sortPurchaseGroups(paymentTotals);
      return summary;
    }

    function getPurchasePending(purchase) {
      if (purchase.pendingAmount !== undefined) return Number(purchase.pendingAmount || 0);
      return purchase.paymentStatus === "Pagado" ? 0 : getPurchaseTotal(purchase);
    }

    function buildProviderDebts(purchases = erpData.purchases || []) {
      const groups = {};
      purchases.forEach((purchase) => {
        const pending = getPurchasePending(purchase);
        if (pending <= 0) return;
        const total = getPurchaseTotal(purchase);
        const paid = Number(purchase.paidAmount || 0);
        const provider = purchase.provider || "Sin proveedor";
        if (!groups[provider]) {
          groups[provider] = { provider, totalAmount: 0, paidAmount: 0, totalDebt: 0, purchaseCount: 0, purchases: [] };
        }
        groups[provider].totalAmount += total;
        groups[provider].paidAmount += paid;
        groups[provider].totalDebt += pending;
        groups[provider].purchaseCount += 1;
        groups[provider].purchases.push(purchase);
      });

      return Object.values(groups)
        .map((group) => ({
          ...group,
          totalAmount: roundClientMoney(group.totalAmount),
          paidAmount: roundClientMoney(group.paidAmount),
          totalDebt: roundClientMoney(group.totalDebt),
        }))
        .sort((a, b) => b.totalDebt - a.totalDebt);
    }

    function isPersonalFundsSource(value) {
      const key = normalizeSearch(value || "");
      return key.includes("joaquin") || key.includes("joaqu") || key.includes("german") || key.includes("germa");
    }

    function buildReimbursementGroups(purchases = erpData.purchases || []) {
      const groups = {};
      purchases.forEach((purchase) => {
        if (!isPersonalFundsSource(purchase.fundsSource)) return;
        const paidByPerson = Number(purchase.paidAmount || (purchase.paymentStatus === "Pagado" ? getPurchaseTotal(purchase) : 0));
        if (paidByPerson <= 0) return;
        const reimbursed = Math.min(Number(purchase.reimbursementPaidAmount || 0), paidByPerson);
        const pending = purchase.reimbursementPendingAmount !== undefined
          ? Number(purchase.reimbursementPendingAmount || 0)
          : Math.max(0, paidByPerson - reimbursed);
        const payer = purchase.fundsSource || "Sin definir";
        if (!groups[payer]) {
          groups[payer] = { payer, totalPaid: 0, reimbursedAmount: 0, pendingAmount: 0, purchaseCount: 0, purchases: [] };
        }
        groups[payer].totalPaid += paidByPerson;
        groups[payer].reimbursedAmount += reimbursed;
        groups[payer].pendingAmount += pending;
        groups[payer].purchaseCount += 1;
        groups[payer].purchases.push({ ...purchase, paidByPerson, reimbursementPaidAmount: reimbursed, reimbursementPendingAmount: pending });
      });

      return Object.values(groups)
        .map((group) => ({
          ...group,
          totalPaid: roundClientMoney(group.totalPaid),
          reimbursedAmount: roundClientMoney(group.reimbursedAmount),
          pendingAmount: roundClientMoney(group.pendingAmount),
        }))
        .sort((a, b) => b.pendingAmount - a.pendingAmount);
    }

    function roundClientMoney(value) {
      return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }

    function renderProviderDebtBoard(purchases) {
      const debts = buildProviderDebts(purchases);
      const totalDebt = debts.reduce((sum, item) => sum + Number(item.totalDebt || 0), 0);
      return `
        <section class="debt-board">
          <div class="debt-board-head">
            <div>
              <h3 style="margin:0;">Cuenta corriente de proveedores</h3>
              <p class="subtitle" style="margin:4px 0 0;">Compras pendientes agrupadas por proveedor.</p>
            </div>
            <strong>${formatCurrency(totalDebt)}</strong>
          </div>
          <input id="provider-debt-search" class="search" placeholder="Buscar proveedor" oninput="renderProviderDebtRows()">
          <div class="debt-list">
            <div id="provider-debt-list">${renderProviderDebtRowsHtml(debts)}</div>
          </div>
        </section>
        <section class="debt-board" style="margin-top:14px;">
          <div class="debt-board-head">
            <div>
              <h3 style="margin:0;">Historial de pagos a proveedores</h3>
              <p class="subtitle" style="margin:4px 0 0;">Pagos registrados con medio, origen y comprobante si fue cargado.</p>
            </div>
          </div>
          ${renderPaymentHistory(purchases, "provider")}
        </section>
      `;
    }

    function showProviderDebtWindow() {
      document.getElementById("purchase-rank-title").textContent = "Deudas con proveedores";
      document.getElementById("purchase-rank-subtitle").textContent = "Cuenta corriente por proveedor";
      document.getElementById("purchase-rank-body").innerHTML = renderProviderDebtBoard(erpData.purchases || []);
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function renderReimbursementBoard(groups = buildReimbursementGroups()) {
      const totalPending = groups.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0);
      return `
        <section class="debt-board">
          <div class="debt-board-head">
            <div>
              <h3 style="margin:0;">Reintegros a personas</h3>
              <p class="subtitle" style="margin:4px 0 0;">Compras pagadas con plata personal y pendientes de devolver.</p>
            </div>
            <strong>${formatCurrency(totalPending)}</strong>
          </div>
          <div class="debt-list">
            ${groups.length ? groups.map((group) => `
              <article class="debt-row">
                <div>
                  <div class="primary">${escapeHtml(group.payer)}</div>
                  <div class="secondary">${escapeHtml(group.purchaseCount)} compra(s) pagadas · devuelto ${formatCurrency(group.reimbursedAmount || 0)}</div>
                </div>
                <div class="debt-amount">${formatCurrency(group.pendingAmount || 0)}</div>
                <button class="filter" type="button" onclick="showReimbursementDetail('${escapeAttribute(group.payer)}')">Ver / reintegrar</button>
              </article>
            `).join("") : `<div class="empty">No hay reintegros pendientes. Para usarlo, cargue la compra como pagada y ponga Origen de fondos = Joaquin o German.</div>`}
          </div>
        </section>
        <section class="debt-board" style="margin-top:14px;">
          <div class="debt-board-head">
            <div>
              <h3 style="margin:0;">Historial de reintegros</h3>
              <p class="subtitle" style="margin:4px 0 0;">Reintegros realizados con medio, origen y comprobante si fue cargado.</p>
            </div>
          </div>
          ${renderPaymentHistory(erpData.purchases || [], "reimbursement")}
        </section>
      `;
    }

    function showReimbursementWindow() {
      document.getElementById("purchase-rank-title").textContent = "Reintegros";
      document.getElementById("purchase-rank-subtitle").textContent = "Plata personal usada para compras";
      document.getElementById("purchase-rank-body").innerHTML = renderReimbursementBoard(buildReimbursementGroups());
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function renderFinanceDashboard() {
      const container = document.getElementById("finance-dashboard");
      if (!container) return;
      const finance = erpData.financeDashboard || buildClientFinanceDashboard();
      const summary = finance.summary || {};
      container.innerHTML = `
        <section id="finance-summary-cards" class="rank-modal-summary" style="margin-bottom:14px;">
          <div><span>Ventas/eventos</span><strong>${formatCurrency(summary.salesTotal || 0)}</strong></div>
          <div><span>Cobrado</span><strong>${formatCurrency(summary.collectedTotal || 0)}</strong></div>
          <div><span>Por cobrar</span><strong>${formatCurrency(summary.pendingCollectionTotal || 0)}</strong></div>
          <div><span>Vencido</span><strong>${formatCurrency(summary.overdueCollectionTotal || 0)}</strong></div>
          <div><span>Deuda proveedores</span><strong>${formatCurrency(summary.supplierDebt || 0)}</strong></div>
          <div><span>Reintegros pendientes</span><strong>${formatCurrency(summary.reimbursementPendingTotal || 0)}</strong></div>
          <div><span>Saldo proyectado</span><strong>${formatCurrency(summary.projectedBalance || 0)}</strong></div>
        </section>
        ${renderFinanceEvents(finance.events || [])}
        <div style="margin-top:16px;">${renderReimbursementBoard(finance.reimbursements || buildReimbursementGroups())}</div>
        <div style="margin-top:16px;">${renderProviderDebtBoard(erpData.purchases || [])}</div>
      `;
    }

    function buildClientFinanceDashboard() {
      const events = (erpData.events || []).map((event) => {
        const saleTotal = Number(event.quoteTotal || event.servicePriceTotal || 0);
        const collectedAmount = Number(event.collectedAmount || 0);
        const pendingCollectionAmount = Math.max(0, saleTotal - collectedAmount);
        return {
          ...event,
          saleTotal,
          collectedAmount,
          pendingCollectionAmount,
          invoiceRequirement: event.invoiceRequirement || "invoice_required",
          invoiceStatus: isNoInvoiceEvent(event) ? "not_applicable" : event.invoiceStatus || "not_invoiced",
          invoiceStatusLabel: getInvoiceSummaryLabel(event),
          collectionStatus: event.collectionStatus || (pendingCollectionAmount <= 0 && saleTotal > 0 ? "paid" : collectedAmount > 0 ? "partial" : "pending"),
          collectionStatusLabel: getFinanceCollectionStatusLabel(event.collectionStatus || (pendingCollectionAmount <= 0 && saleTotal > 0 ? "paid" : collectedAmount > 0 ? "partial" : "pending")),
        };
      });
      const supplierDebt = (erpData.purchases || []).reduce((sum, purchase) => sum + getPurchasePending(purchase), 0);
      const reimbursements = buildReimbursementGroups();
      const reimbursementPendingTotal = reimbursements.reduce((sum, group) => sum + Number(group.pendingAmount || 0), 0);
      const reimbursementPaidTotal = reimbursements.reduce((sum, group) => sum + Number(group.reimbursedAmount || 0), 0);
      const salesTotal = events.reduce((sum, event) => sum + Number(event.saleTotal || 0), 0);
      const collectedTotal = events.reduce((sum, event) => sum + Number(event.collectedAmount || 0), 0);
      const pendingCollectionTotal = events.reduce((sum, event) => sum + Number(event.pendingCollectionAmount || 0), 0);
      return {
        summary: {
          salesTotal,
          collectedTotal,
          pendingCollectionTotal,
          overdueCollectionTotal: 0,
          supplierDebt,
          reimbursementPendingTotal,
          reimbursementPaidTotal,
          projectedBalance: collectedTotal + pendingCollectionTotal - supplierDebt - reimbursementPendingTotal,
        },
        events,
        reimbursements,
      };
    }

    function renderFinanceEvents(events = []) {
      if (!events.length) {
        return `<section id="finance-events-section" class="debt-board"><h3 style="margin:0;">Cobros por evento</h3><div class="empty">No hay eventos con venta cargada.</div></section>`;
      }
      return `
        <section id="finance-events-section" class="debt-board">
          <div class="debt-board-head">
            <div>
              <h3 style="margin:0;">Cobros por evento</h3>
              <p class="subtitle" style="margin:4px 0 0;">Estado de cobros realizados, parciales y pendientes.</p>
            </div>
            <strong>${escapeHtml(events.length)} evento(s)</strong>
          </div>
          <div class="debt-list">
            ${events.map((event) => `
              <article class="debt-row">
                <div>
                  <div class="primary">${escapeHtml(event.name || "Evento")}</div>
                  <div class="secondary">${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")} · ${escapeHtml(event.clientName || "Sin cliente")} · ${escapeHtml(event.statusLabel || getErpEventStatusLabel(event.status))}</div>
                  <div class="secondary">${escapeHtml(event.serviceType || "Sin servicio")} · ${escapeHtml(event.venue || "Sin lugar")} · ${escapeHtml(event.invoiceStatusLabel || getInvoiceSummaryLabel(event))}${event.invoiceNumber && !isNoInvoiceEvent(event) ? ` · ${escapeHtml(event.invoiceNumber)}` : ""}</div>
                </div>
                <div class="debt-amount">
                  <div>${formatCurrency(event.pendingCollectionAmount || 0)}</div>
                  <span class="badge ${event.collectionStatus === "paid" ? "confirmed" : event.collectionStatus === "partial" ? "ready_to_quote" : "missing_info"}">${escapeHtml(event.collectionStatusLabel || getFinanceCollectionStatusLabel(event.collectionStatus))}</span>
                </div>
                <button class="filter" type="button" onclick="showFinanceEventPayment('${escapeAttribute(event.id)}')">Ver / cobro</button>
              </article>
            `).join("")}
          </div>
        </section>
      `;
    }

    function getFinanceCollectionStatusLabel(status) {
      return {
        pending: "Pendiente",
        partial: "Parcial",
        paid: "Cobrado",
      }[status] || "Pendiente";
    }

    function showFinanceEventPayment(id) {
      const finance = erpData.financeDashboard || buildClientFinanceDashboard();
      const event = (finance.events || []).find((item) => item.id === id);
      if (!event) return;
      const noInvoice = isNoInvoiceEvent(event);
      document.getElementById("purchase-rank-title").textContent = `Cobro - ${event.name || "Evento"}`;
      document.getElementById("purchase-rank-subtitle").textContent = `${event.clientName || "Sin cliente"} · ${formatShortDate(event.eventDate) || "Sin fecha"}`;
      document.getElementById("purchase-rank-body").innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Venta</span><strong>${formatCurrency(event.saleTotal || 0)}</strong></div>
          <div><span>Cobrado</span><strong>${formatCurrency(event.collectedAmount || 0)}</strong></div>
          <div><span>Pendiente</span><strong>${formatCurrency(event.pendingCollectionAmount || 0)}</strong></div>
          <div><span>Facturacion</span><strong>${escapeHtml(event.invoiceStatusLabel || getInvoiceSummaryLabel(event))}</strong></div>
        </section>
        <form class="form-grid" onsubmit="saveFinanceEventPayment(event)">
          <input type="hidden" name="id" value="${escapeAttribute(event.id || "")}">
          <div class="form-field">
            <label>Estado de cobro</label>
            <select name="collectionStatus">
              <option value="pending" ${event.collectionStatus === "pending" ? "selected" : ""}>Pendiente</option>
              <option value="partial" ${event.collectionStatus === "partial" ? "selected" : ""}>Parcial</option>
              <option value="paid" ${event.collectionStatus === "paid" ? "selected" : ""}>Cobrado</option>
            </select>
          </div>
          <div class="form-field">
            <label>Monto cobrado acumulado</label>
            <input name="collectedAmount" inputmode="decimal" value="${escapeAttribute(event.collectedAmount || 0)}">
          </div>
          <div class="form-field">
            <label>Fecha prevista/proxima</label>
            <input name="collectionDueDate" type="date" value="${escapeAttribute(event.collectionDueDate || "")}">
          </div>
          <div class="form-field">
            <label>Medio de cobro</label>
            <input name="collectionMethod" value="${escapeAttribute(event.collectionMethod || "")}" placeholder="Transferencia, efectivo, MP">
          </div>
          <div class="form-field">
            <label>Condicion de facturacion</label>
            <select name="invoiceRequirement" onchange="toggleFinanceInvoiceFields(this.form)">
              <option value="invoice_required" ${!noInvoice ? "selected" : ""}>Facturar</option>
              <option value="no_invoice" ${noInvoice ? "selected" : ""}>No facturar</option>
            </select>
          </div>
          <div class="form-field finance-invoice-field ${noInvoice ? "hidden" : ""}">
            <label>Estado de factura</label>
            <select name="invoiceStatus">
              <option value="not_invoiced" ${event.invoiceStatus !== "invoiced" ? "selected" : ""}>No facturado</option>
              <option value="invoiced" ${event.invoiceStatus === "invoiced" ? "selected" : ""}>Facturado</option>
            </select>
          </div>
          <div class="form-field finance-invoice-field ${noInvoice ? "hidden" : ""}">
            <label>Nro factura</label>
            <input name="invoiceNumber" value="${escapeAttribute(event.invoiceNumber || "")}" placeholder="Opcional">
          </div>
          <div class="form-field full">
            <label>Nota para contador</label>
            <textarea name="collectionNotes">${escapeHtml(event.collectionNotes || "")}</textarea>
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Guardar cobro</button>
          </div>
        </form>
      `;
      toggleFinanceInvoiceFields(document.querySelector("#purchase-rank-body form"));
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function isNoInvoiceEvent(event = {}) {
      return event.invoiceRequirement === "no_invoice" || event.invoiceStatus === "not_applicable";
    }

    function getInvoiceRequirementLabel(requirement) {
      return requirement === "no_invoice" ? "No facturar" : "Facturar";
    }

    function getInvoiceStatusLabel(status) {
      if (status === "not_applicable") return "No aplica";
      return status === "invoiced" ? "Facturado" : "No facturado";
    }

    function getInvoiceSummaryLabel(event = {}) {
      if (isNoInvoiceEvent(event)) return "No facturar";
      return `${getInvoiceRequirementLabel(event.invoiceRequirement)} · ${getInvoiceStatusLabel(event.invoiceStatus)}`;
    }

    function toggleFinanceInvoiceFields(form) {
      if (!form) return;
      const noInvoice = form.elements.invoiceRequirement?.value === "no_invoice";
      form.querySelectorAll(".finance-invoice-field").forEach((field) => {
        field.classList.toggle("hidden", noInvoice);
        field.querySelectorAll("input, select, textarea").forEach((input) => {
          input.disabled = noInvoice;
        });
      });
    }

    function toggleEventInvoiceFields(form) {
      if (!form) return;
      const noInvoice = form.elements.invoiceRequirement?.value === "no_invoice";
      form.querySelectorAll(".event-invoice-field").forEach((field) => {
        field.classList.toggle("hidden", noInvoice);
        field.querySelectorAll("input, select, textarea").forEach((input) => {
          input.disabled = noInvoice;
        });
      });
    }

    function renderHrDashboard() {
      const container = document.getElementById("hr-dashboard");
      if (!container) return;
      const hr = erpData.hrDashboard || { summary: {}, staff: [], shifts: [], payroll: [] };
      const summary = hr.summary || {};
      container.innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Personal activo</span><strong>${escapeHtml(summary.activeStaff || 0)}</strong></div>
          <div><span>Asistencias</span><strong>${escapeHtml(summary.shiftsCount || 0)}</strong></div>
          <div><span>Sueldos pendientes</span><strong>${formatCurrency(summary.pendingPayrollAmount || 0)}</strong></div>
          <div><span>Liquidaciones pendientes</span><strong>${escapeHtml(summary.pendingPayrollCount || 0)}</strong></div>
        </section>
        <div class="panel-grid">
          <section id="hr-staff-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Legajo</h2>
            <form id="hr-staff-form" class="form-grid" onsubmit="saveHrStaff(event)">
              <input type="hidden" name="id">
              <div class="form-field full"><label>Nombre</label><input name="fullName" required></div>
              <div class="form-field"><label>Rol</label><input name="role" placeholder="Mozo, cocina, chofer"></div>
              <div class="form-field"><label>Telefono</label><input name="phone"></div>
              <div class="form-field"><label>DNI/CUIL</label><input name="documentId"></div>
              <div class="form-field"><label>Valor hora</label><input name="hourlyRate" inputmode="decimal"></div>
              <div class="form-field"><label>Estado</label><select name="status"><option value="active">Activo</option><option value="paused">Pausado</option><option value="inactive">Inactivo</option></select></div>
              <div class="form-field full"><label>Disponibilidad</label><input name="availability" placeholder="Fines de semana, noches, feriados"></div>
              <div class="form-field full"><label>Notas</label><textarea name="notes"></textarea></div>
              <div class="actions full"><button class="approve" type="submit">Guardar legajo</button><button class="filter" type="button" onclick="resetHrStaffForm()">Nuevo</button></div>
            </form>
            <h2 id="hr-shifts-section" style="font-size:20px;">Asistencia / horario</h2>
            <form id="hr-shift-form" class="form-grid" onsubmit="saveHrShift(event)">
              <input type="hidden" name="id">
              <div class="form-field"><label>Persona</label><select name="staffId">${renderStaffOptions(hr.staff || [])}</select></div>
              <div class="form-field"><label>Evento</label><select name="eventId">${renderEventOptions(erpData.events || [])}</select></div>
              <div class="form-field"><label>Fecha</label><input name="date" type="date"></div>
              <div class="form-field"><label>Entrada</label><input name="startTime" type="time"></div>
              <div class="form-field"><label>Salida</label><input name="endTime" type="time"></div>
              <div class="form-field"><label>Horas manual</label><input name="hours" inputmode="decimal" placeholder="Opcional"></div>
              <div class="form-field"><label>Adicionales $</label><input name="extrasAmount" inputmode="decimal" value="0"></div>
              <div class="form-field"><label>Estado</label><select name="attendanceStatus"><option value="scheduled">Programado</option><option value="present">Presente</option><option value="absent">Ausente</option><option value="cancelled">Cancelado</option></select></div>
              <div class="form-field full"><label>Novedad</label><textarea name="notes"></textarea></div>
              <div class="actions full"><button class="approve" type="submit">Guardar asistencia</button></div>
            </form>
          </section>
          <section id="hr-payroll-list-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Personal</h2>
            <div class="compact-list compact-scroll">${renderHrStaffList(hr.staff || [])}</div>
            <h2 style="font-size:20px;">Horas y asistencia</h2>
            <div class="compact-list compact-scroll">${renderHrShiftList(hr.shifts || [])}</div>
            <h2 id="hr-payroll-section" style="font-size:20px;">Sueldos</h2>
            <form id="payroll-form" class="form-grid" onsubmit="savePayroll(event)">
              <input type="hidden" name="id">
              <div class="form-field"><label>Persona</label><select name="staffId">${renderStaffOptions(hr.staff || [])}</select></div>
              <div class="form-field"><label>Periodo</label><input name="period" placeholder="2026-06" value="${escapeAttribute(new Date().toISOString().slice(0, 7))}"></div>
              <div class="form-field"><label>Horas</label><input name="hours" inputmode="decimal"></div>
              <div class="form-field"><label>Base $</label><input name="baseAmount" inputmode="decimal"></div>
              <div class="form-field"><label>Adicionales</label><input name="additions" inputmode="decimal" value="0"></div>
              <div class="form-field"><label>Descuentos</label><input name="deductions" inputmode="decimal" value="0"></div>
              <div class="form-field"><label>Estado</label><select name="paymentStatus"><option value="pending">Pendiente</option><option value="approved">Aprobado</option><option value="paid">Pagado</option></select></div>
              <div class="form-field full"><label>Notas</label><textarea name="notes"></textarea></div>
              <div class="actions full"><button class="approve" type="submit">Guardar sueldo</button></div>
            </form>
            <div class="compact-list compact-scroll">${renderPayrollList(hr.payroll || [])}</div>
          </section>
        </div>
      `;
    }

    function renderStaffOptions(staff = []) {
      return `<option value="">Seleccionar</option>${staff.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.fullName || "")}</option>`).join("")}`;
    }

    function renderEventOptions(events = []) {
      return `<option value="">Sin evento</option>${events.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name || "Evento")} · ${escapeHtml(formatShortDate(item.eventDate) || "")}</option>`).join("")}`;
    }

    function renderHrStaffList(staff = []) {
      if (!staff.length) return `<div class="empty compact-empty">Sin legajos cargados.</div>`;
      return staff.map((item) => `
        <article class="compact-row" onclick="editHrStaff('${escapeAttribute(item.id)}')">
          <div><strong>${escapeHtml(item.fullName)}</strong><div class="secondary">${escapeHtml(item.role || "Sin rol")} · ${escapeHtml(item.phone || "Sin telefono")}</div></div>
          <span class="badge">${escapeHtml(item.statusLabel || item.status)}</span>
        </article>
      `).join("");
    }

    function renderHrShiftList(shifts = []) {
      if (!shifts.length) return `<div class="empty compact-empty">Sin asistencias cargadas.</div>`;
      return shifts.slice(0, 12).map((item) => `
        <article class="compact-row">
          <div><strong>${escapeHtml(item.staffName || "Sin persona")}</strong><div class="secondary">${escapeHtml(formatShortDate(item.date) || "")} · ${escapeHtml(item.eventName || "Sin evento")} · ${escapeHtml(item.hours || 0)} hs</div></div>
          <strong>${formatCurrency(item.totalAmount || 0)}</strong>
        </article>
      `).join("");
    }

    function renderPayrollList(rows = []) {
      if (!rows.length) return `<div class="empty compact-empty">Sin sueldos liquidados.</div>`;
      return rows.slice(0, 12).map((item) => `
        <article class="compact-row">
          <div><strong>${escapeHtml(item.staffName || "Persona")}</strong><div class="secondary">${escapeHtml(item.period || "")} · ${escapeHtml(item.hours || 0)} hs</div></div>
          <div><strong>${formatCurrency(item.totalAmount || 0)}</strong><div class="secondary">${escapeHtml(item.paymentStatus || "")}</div></div>
        </article>
      `).join("");
    }

    function editHrStaff(id) {
      const staff = (erpData.hrDashboard?.staff || []).find((item) => item.id === id);
      const form = document.getElementById("hr-staff-form");
      if (!staff || !form) return;
      ["id", "fullName", "role", "phone", "documentId", "hourlyRate", "status", "availability", "notes"].forEach((field) => setFormValue(form, field, staff[field] || ""));
    }

    function resetHrStaffForm() {
      document.getElementById("hr-staff-form")?.reset();
      setFormValue(document.getElementById("hr-staff-form"), "id", "");
    }

    async function saveHrStaff(event) {
      event.preventDefault();
      const form = event.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      const result = await postJson("/api/hr-staff", payload);
      if (!result.ok) return showNotice(result.error || "No se pudo guardar el legajo.", "error");
      erpData.hrDashboard = result.hrDashboard;
      renderHrDashboard();
      showNotice("Legajo guardado.", "success");
    }

    async function saveHrShift(event) {
      event.preventDefault();
      const form = event.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      const staff = (erpData.hrDashboard?.staff || []).find((item) => item.id === payload.staffId);
      const erpEvent = (erpData.events || []).find((item) => item.id === payload.eventId);
      payload.staffName = staff?.fullName || "";
      payload.eventName = erpEvent?.name || "";
      const result = await postJson("/api/hr-shift", payload);
      if (!result.ok) return showNotice(result.error || "No se pudo guardar la asistencia.", "error");
      erpData.hrDashboard = result.hrDashboard;
      renderHrDashboard();
      showNotice("Asistencia guardada.", "success");
    }

    async function savePayroll(event) {
      event.preventDefault();
      const form = event.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      const staff = (erpData.hrDashboard?.staff || []).find((item) => item.id === payload.staffId);
      payload.staffName = staff?.fullName || "";
      const result = await postJson("/api/payroll", payload);
      if (!result.ok) return showNotice(result.error || "No se pudo guardar el sueldo.", "error");
      erpData.hrDashboard = result.hrDashboard;
      renderHrDashboard();
      showNotice("Sueldo guardado.", "success");
    }

    function renderSanitationDashboard() {
      const container = document.getElementById("sanitation-dashboard");
      if (!container) return;
      const data = erpData.sanitationDashboard || { summary: {}, records: [] };
      const summary = data.summary || {};
      container.innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Registros</span><strong>${escapeHtml(summary.total || 0)}</strong></div>
          <div><span>Aprobaciones pendientes</span><strong>${escapeHtml(summary.pendingApprovals || 0)}</strong></div>
          <div><span>Vencen pronto</span><strong>${escapeHtml(summary.dueSoon || 0)}</strong></div>
          <div><span>Vencidos</span><strong>${escapeHtml(summary.expired || 0)}</strong></div>
          <div><span>Decomisos pendientes</span><strong>${escapeHtml(summary.discardsPending || 0)}</strong></div>
        </section>
        <div class="panel-grid">
          <section id="sanitation-form-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Registro bromatológico</h2>
            <form id="sanitation-form" class="form-grid" onsubmit="saveSanitationRecord(event)">
              <input type="hidden" name="id">
              <input type="hidden" name="documentDataUrl">
              <input type="hidden" name="documentName">
              <div class="form-field"><label>Tipo</label><select name="recordType"><option value="document">Documentación</option><option value="label">Etiqueta</option><option value="expiration">Vencimiento</option><option value="discard">Decomiso</option><option value="approval">Aprobación</option></select></div>
              <div class="form-field"><label>Fecha</label><input name="date" type="date" value="${escapeAttribute(toDateValue(new Date()))}"></div>
              <div class="form-field full"><label>Título</label><input name="title" placeholder="Ej: Decomiso salsa vencida"></div>
              <div class="form-field"><label>Producto</label><input name="productName"></div>
              <div class="form-field"><label>Lote</label><input name="batch"></div>
              <div class="form-field"><label>Vencimiento</label><input name="expirationDate" type="date"></div>
              <div class="form-field"><label>Cantidad</label><input name="quantity" placeholder="Ej: 2 kg, 5 un."></div>
              <div class="form-field"><label>Evento</label><select name="eventId">${renderEventOptions(erpData.events || [])}</select></div>
              <div class="form-field full"><label>Motivo</label><textarea name="reason"></textarea></div>
              <div class="form-field full"><label>Acción tomada</label><textarea name="actionTaken" placeholder="Decomisado, rotulado, enviado a revisión..."></textarea></div>
              <div class="form-field full"><label>Foto/comprobante/PDF</label><input type="file" accept="image/*,application/pdf" onchange="handleSanitationFile(this)"><p id="sanitation-file-label" class="secondary"></p></div>
              <div class="actions full"><button class="approve" type="submit">Guardar registro</button><button class="filter" type="button" onclick="document.getElementById('sanitation-form').reset()">Nuevo</button></div>
            </form>
          </section>
          <section id="sanitation-records-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Registros y aprobaciones</h2>
            <div class="compact-list compact-scroll">${renderSanitationRecordList(data.records || [])}</div>
          </section>
        </div>
      `;
    }

    function renderSanitationRecordList(records = []) {
      if (!records.length) return `<div class="empty compact-empty">Sin registros bromatológicos.</div>`;
      return records.map((item) => `
        <article class="compact-row">
          <div>
            <strong>${escapeHtml(item.title || item.productName || item.eventName || "Registro")}</strong>
            <div class="secondary">${escapeHtml(item.recordTypeLabel || item.recordType)} · ${escapeHtml(formatShortDate(item.date) || "")}${item.expirationDate ? ` · vence ${escapeHtml(formatShortDate(item.expirationDate))}` : ""}</div>
            <div class="secondary">${escapeHtml(item.reason || item.actionTaken || "")}</div>
            ${item.documentDataUrl ? `<a class="filter" href="${escapeAttribute(item.documentDataUrl)}" download="${escapeAttribute(item.documentName || "comprobante")}">Descargar archivo</a>` : ""}
          </div>
          <div class="actions">
            <span class="badge ${item.approvalStatus === "approved" ? "confirmed" : item.approvalStatus === "rejected" ? "referred" : "missing_info"}">${escapeHtml(item.approvalStatusLabel || item.approvalStatus)}</span>
            ${can("sanitation:approve") && item.approvalStatus === "pending" ? `<button class="approve" type="button" onclick="approveSanitation('${escapeAttribute(item.id)}', 'approved')">Aprobar</button><button class="reject" type="button" onclick="approveSanitation('${escapeAttribute(item.id)}', 'rejected')">Rechazar</button>` : ""}
          </div>
        </article>
      `).join("");
    }

    function handleSanitationFile(input) {
      const file = input.files?.[0];
      const form = input.closest("form");
      if (!file || !form) return;
      const reader = new FileReader();
      reader.onload = () => {
        form.elements.documentDataUrl.value = reader.result || "";
        form.elements.documentName.value = file.name || "comprobante";
        const label = document.getElementById("sanitation-file-label");
        if (label) label.textContent = file.name || "Archivo cargado";
      };
      reader.readAsDataURL(file);
    }

    async function saveSanitationRecord(event) {
      event.preventDefault();
      const form = event.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      const erpEvent = (erpData.events || []).find((item) => item.id === payload.eventId);
      payload.eventName = erpEvent?.name || "";
      const result = await postJson("/api/sanitation-record", payload);
      if (!result.ok) return showNotice(result.error || "No se pudo guardar bromatología.", "error");
      erpData.sanitationDashboard = result.sanitationDashboard;
      renderSanitationDashboard();
      showNotice("Registro bromatológico guardado.", "success");
    }

    async function approveSanitation(id, approvalStatus) {
      const approvalNotes = approvalStatus === "rejected" ? prompt("Motivo del rechazo:") || "" : "";
      const result = await postJson("/api/sanitation-approval", { id, approvalStatus, approvalNotes });
      if (!result.ok) return showNotice(result.error || "No se pudo actualizar la aprobación.", "error");
      erpData.sanitationDashboard = result.sanitationDashboard;
      renderSanitationDashboard();
      showNotice("Aprobación actualizada.", "success");
    }

    function renderPaymentOrdersDashboard() {
      const container = document.getElementById("payment-orders-dashboard");
      if (!container) return;
      const data = erpData.paymentOrdersDashboard || { summary: {}, orders: [] };
      const summary = data.summary || {};
      container.innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Pendiente</span><strong>${formatCurrency(summary.pendingAmount || 0)}</strong></div>
          <div><span>Aprobado</span><strong>${formatCurrency(summary.approvedAmount || 0)}</strong></div>
          <div><span>Pagado</span><strong>${formatCurrency(summary.paidAmount || 0)}</strong></div>
          <div><span>Ordenes pendientes</span><strong>${escapeHtml(summary.pendingCount || 0)}</strong></div>
          <div><span>Ordenes aprobadas</span><strong>${escapeHtml(summary.approvedCount || 0)}</strong></div>
        </section>
        <div class="panel-grid">
          <section id="payment-order-form-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Nueva orden de pago</h2>
            <form id="payment-order-form" class="form-grid" onsubmit="savePaymentOrder(event)">
              <input type="hidden" name="id">
              <input type="hidden" name="receiptDataUrl">
              <input type="hidden" name="receiptName">
              <div class="form-field"><label>Tipo</label><select name="type"><option value="provider">Proveedor</option><option value="salary">Sueldo</option><option value="reimbursement">Reintegro</option><option value="expense">Gasto</option></select></div>
              <div class="form-field"><label>Beneficiario</label><input name="beneficiary" required placeholder="Proveedor o persona"></div>
              <div class="form-field full"><label>Concepto</label><input name="concept" required placeholder="Compra, sueldo, reintegro, alquiler"></div>
              <div class="form-field"><label>Monto</label><input name="amount" inputmode="decimal" required></div>
              <div class="form-field"><label>Vencimiento</label><input name="dueDate" type="date"></div>
              <div class="form-field"><label>Medio de pago</label><input name="paymentMethod" placeholder="Transferencia, efectivo, MP"></div>
              <div class="form-field"><label>Origen fondos</label><input name="fundsSource" placeholder="Cuenta, caja, Joaquin"></div>
              <div class="form-field full"><label>Notas</label><textarea name="notes"></textarea></div>
              <div class="form-field full"><label>Comprobante</label><input type="file" accept="image/*,application/pdf" onchange="handlePaymentOrderReceipt(this)"><p id="payment-order-file-label" class="secondary"></p></div>
              <div class="actions full"><button class="approve" type="submit">Guardar orden</button><button class="filter" type="button" onclick="document.getElementById('payment-order-form').reset()">Nueva</button></div>
            </form>
          </section>
          <section id="payment-order-list-section" class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Ordenes</h2>
            <div class="compact-list compact-scroll">${renderPaymentOrderList(data.orders || [])}</div>
          </section>
        </div>
      `;
    }

    function renderPaymentOrderList(orders = []) {
      if (!orders.length) return `<div class="empty compact-empty">Sin órdenes de pago.</div>`;
      return orders.map((item) => `
        <article class="compact-row">
          <div>
            <strong>${escapeHtml(item.beneficiary || "Beneficiario")}</strong>
            <div class="secondary">${escapeHtml(item.concept || "")} · ${escapeHtml(item.type || "")}${item.dueDate ? ` · vence ${escapeHtml(formatShortDate(item.dueDate))}` : ""}</div>
            ${item.receipt?.dataUrl ? `<a class="filter" href="${escapeAttribute(item.receipt.dataUrl)}" download="${escapeAttribute(item.receipt.name || "comprobante")}">Descargar comprobante</a>` : ""}
          </div>
          <div class="actions">
            <strong>${formatCurrency(item.amount || 0)}</strong>
            <span class="badge ${item.status === "paid" ? "confirmed" : item.status === "approved" ? "ready_to_quote" : item.status === "rejected" ? "referred" : "missing_info"}">${escapeHtml(item.statusLabel || item.status)}</span>
            ${can("payment_orders:approve") && item.status === "pending" ? `<button class="approve" type="button" onclick="updatePaymentOrderStatus('${escapeAttribute(item.id)}', 'approved')">Aprobar</button><button class="reject" type="button" onclick="updatePaymentOrderStatus('${escapeAttribute(item.id)}', 'rejected')">Rechazar</button>` : ""}
            ${can("payment_orders:approve") && item.status === "approved" ? `<button class="approve" type="button" onclick="updatePaymentOrderStatus('${escapeAttribute(item.id)}', 'paid')">Marcar pagada</button>` : ""}
          </div>
        </article>
      `).join("");
    }

    function handlePaymentOrderReceipt(input) {
      const file = input.files?.[0];
      const form = input.closest("form");
      if (!file || !form) return;
      const reader = new FileReader();
      reader.onload = () => {
        form.elements.receiptDataUrl.value = reader.result || "";
        form.elements.receiptName.value = file.name || "comprobante";
        const label = document.getElementById("payment-order-file-label");
        if (label) label.textContent = file.name || "Archivo cargado";
      };
      reader.readAsDataURL(file);
    }

    async function savePaymentOrder(event) {
      event.preventDefault();
      const form = event.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.receiptDataUrl) {
        payload.receipt = {
          dataUrl: payload.receiptDataUrl,
          name: payload.receiptName || "comprobante",
          uploadedAt: new Date().toISOString(),
        };
      }
      delete payload.receiptDataUrl;
      delete payload.receiptName;
      const result = await postJson("/api/payment-order", payload);
      if (!result.ok) return showNotice(result.error || "No se pudo guardar la orden de pago.", "error");
      erpData.paymentOrdersDashboard = result.paymentOrdersDashboard;
      renderPaymentOrdersDashboard();
      showNotice("Orden de pago guardada.", "success");
    }

    async function updatePaymentOrderStatus(id, status) {
      const paymentDate = status === "paid" ? toDateValue(new Date()) : "";
      const result = await postJson("/api/payment-order-status", { id, status, paymentDate });
      if (!result.ok) return showNotice(result.error || "No se pudo actualizar la orden.", "error");
      erpData.paymentOrdersDashboard = result.paymentOrdersDashboard;
      renderPaymentOrdersDashboard();
      showNotice("Orden de pago actualizada.", "success");
    }

    async function saveFinanceEventPayment(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/finance-event-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el cobro.", "error");
        return;
      }
      erpData.financeDashboard = result.financeDashboard || erpData.financeDashboard;
      renderFinanceDashboard();
      hidePurchaseRankDetail();
      showNotice("Cobro del evento actualizado.");
    }

    function renderProviderDebtRows() {
      const term = normalizeSearch(document.getElementById("provider-debt-search")?.value || "");
      const debts = buildProviderDebts().filter((debt) => !term || normalizeSearch(debt.provider).includes(term));
      const container = document.getElementById("provider-debt-list");
      if (container) container.innerHTML = renderProviderDebtRowsHtml(debts);
    }

    function renderProviderDebtRowsHtml(debts) {
      if (!debts.length) return `<div class="empty">No hay deudas pendientes con proveedores.</div>`;
      return debts.map((debt) => `
        <article class="debt-row">
          <div>
            <div class="primary">${escapeHtml(debt.provider)}</div>
            <div class="secondary">${escapeHtml(debt.purchaseCount)} compra(s) con saldo pendiente</div>
          </div>
          <div class="debt-amount">${formatCurrency(debt.totalDebt)}</div>
          <button class="filter" type="button" onclick="showProviderDebt('${escapeAttribute(debt.provider)}')">Ver / pagar</button>
        </article>
      `).join("");
    }

    function getPurchaseTotal(purchase) {
      const netAmount = Number(purchase.netAmount || 0);
      const ivaAmount = Number(purchase.ivaAmount || 0);
      const grossAmount = netAmount + ivaAmount;
      const storedTotal = Number(purchase.totalAmount || 0);

      if (grossAmount > storedTotal) return grossAmount;
      if (Number.isFinite(storedTotal)) return storedTotal;

      return (purchase.lineItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
    }

    function getPurchaseLineTotal(purchase, item) {
      const net = Number(item.total || 0);
      const rawIvaRate = Number(purchase.ivaRate || 0);
      const ivaRate = rawIvaRate > 1 ? rawIvaRate / 100 : rawIvaRate;
      return ivaRate > 0 ? net * (1 + ivaRate) : net;
    }

    function addPurchaseGroupTotal(groups, label, amount) {
      if (!groups[label]) {
        groups[label] = { label, total: 0, count: 0 };
      }

      groups[label].total += Number(amount || 0);
      groups[label].count += 1;
    }

    function sortPurchaseGroups(groups) {
      return Object.values(groups).sort((a, b) => b.total - a.total);
    }

    function showProviderDebt(provider) {
      const debt = buildProviderDebts().find((item) => item.provider === provider);
      if (!debt) {
        showNotice("Ese proveedor no tiene deuda pendiente.", "error");
        return;
      }
      const totalPurchases = roundClientMoney(debt.purchases.reduce((sum, purchase) => sum + getPurchaseTotal(purchase), 0));
      const totalPaid = roundClientMoney(debt.purchases.reduce((sum, purchase) => sum + Number(purchase.paidAmount || 0), 0));
      const totalPending = roundClientMoney(debt.purchases.reduce((sum, purchase) => sum + getPurchasePending(purchase), 0));
      const providerRecord = findProviderRecordByName(provider);

      document.getElementById("purchase-rank-title").textContent = `Deuda - ${provider}`;
      document.getElementById("purchase-rank-subtitle").textContent = `${debt.purchaseCount} compra(s) pendientes · saldo ${formatCurrency(totalPending)}`;
      document.getElementById("purchase-rank-body").innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Compras pendientes</span><strong>${escapeHtml(debt.purchaseCount)}</strong></div>
          <div><span>Pagado parcial</span><strong>${formatCurrency(totalPaid)}</strong></div>
          <div><span>Saldo deuda</span><strong>${formatCurrency(totalPending)}</strong></div>
        </section>
        ${renderProviderTransferBox(provider, providerRecord)}
        <form class="form-grid" onsubmit="submitProviderPayment(event, '${escapeAttribute(provider)}')">
          <div class="form-field">
            <label>Tipo de pago</label>
            <select name="mode" onchange="toggleProviderPaymentAmount(this, ${Number(debt.totalDebt || 0)})">
              <option value="partial">Pago parcial</option>
              <option value="total">Cancelar deuda total</option>
            </select>
          </div>
          <div class="form-field">
            <label>Monto</label>
            <input name="amount" inputmode="decimal" placeholder="${escapeAttribute(formatCurrency(totalPending))}">
          </div>
          <div class="form-field">
            <label>Fecha</label>
            <input name="date" type="date" value="${escapeAttribute(new Date().toISOString().slice(0, 10))}">
          </div>
          <div class="form-field">
            <label>Medio de pago</label>
            ${renderPaymentOptionSelect("paymentMethod", purchaseOptions.paymentMethods || [], "Seleccionar medio")}
          </div>
          <div class="form-field">
            <label>Origen de fondos</label>
            ${renderPaymentOptionSelect("fundsSource", purchaseOptions.fundsSources || [], "Seleccionar origen")}
          </div>
          <div class="form-field full">
            <label>Nota</label>
            <input name="notes" placeholder="Referencia, comprobante o aclaracion">
          </div>
          <div class="form-field full">
            <label>Comprobante</label>
            <input name="receiptFile" type="file" accept="application/pdf,image/*">
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Registrar pago</button>
          </div>
        </form>
        <h3 style="margin:14px 0 8px;">Compras que componen la deuda</h3>
        <div class="debt-detail-list">
          ${debt.purchases.flatMap(renderProviderDebtPurchaseLines).join("")}
          <div class="debt-detail-row total">
            <div></div>
            <div>Total deuda del proveedor</div>
            <div>${formatCurrency(totalPending)}</div>
          </div>
        </div>
        <h3 style="margin:14px 0 8px;">Historial de pagos</h3>
        ${renderPaymentHistory(debt.purchases, "provider")}
      `;
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function findProviderRecordByName(providerName) {
      const key = normalizeSearch(providerName || "");
      return (allProviders || erpData.providers || []).find((provider) =>
        normalizeSearch(provider.name || "") === key ||
        normalizeSearch(provider.legalName || "") === key
      ) || null;
    }

    function providerHasTransferData(provider = {}) {
      return Boolean(provider?.alias || provider?.cbu || provider?.bankAccountNumber);
    }

    function renderProviderTransferBox(providerName, provider = {}) {
      if (providerHasTransferData(provider)) {
        return `
          <section class="purchase-order-result-card" style="margin:12px 0;">
            <span>Datos para transferir</span>
            <div class="fields" style="margin-top:10px;">
              ${field("Titular", provider.bankAccountHolder || provider.legalName || provider.name || providerName)}
              ${field("Banco", provider.bankName || "Sin banco")}
              ${field("Alias", provider.alias || "Sin alias")}
              ${field("CBU / CVU", provider.cbu || "Sin CBU/CVU")}
              ${field("Cuenta", [provider.bankAccountType, provider.bankAccountNumber].filter(Boolean).join(" · ") || "Sin cuenta")}
            </div>
            <div class="actions" style="margin-top:10px;">
              <button class="filter" type="button" onclick="toggleProviderBankForm('${escapeAttribute(providerName)}')">Editar datos bancarios</button>
            </div>
            <div id="provider-bank-inline-form" class="hidden">${renderProviderBankInlineForm(providerName, provider)}</div>
          </section>
        `;
      }

      return `
        <section class="purchase-order-result-card" style="margin:12px 0;">
          <span>Datos para transferir</span>
          <div class="empty" style="margin-top:10px;">Este proveedor todavia no tiene datos bancarios cargados.</div>
          <div class="actions" style="margin-top:10px;">
            <button class="approve" type="button" onclick="toggleProviderBankForm('${escapeAttribute(providerName)}')">Agregar datos bancarios</button>
          </div>
          <div id="provider-bank-inline-form" class="hidden">${renderProviderBankInlineForm(providerName, provider)}</div>
        </section>
      `;
    }

    function renderProviderBankInlineForm(providerName, provider = {}) {
      return `
        <form class="form-grid" style="margin-top:12px;" onsubmit="saveProviderBankFromDebt(event, '${escapeAttribute(providerName)}')">
          <input type="hidden" name="id" value="${escapeAttribute(provider.id || "")}">
          <input type="hidden" name="name" value="${escapeAttribute(provider.name || providerName)}">
          <div class="form-field">
            <label>Banco</label>
            <input name="bankName" value="${escapeAttribute(provider.bankName || "")}">
          </div>
          <div class="form-field">
            <label>Tipo de cuenta</label>
            <input name="bankAccountType" placeholder="CC, CA, billetera" value="${escapeAttribute(provider.bankAccountType || "")}">
          </div>
          <div class="form-field">
            <label>Nro cuenta</label>
            <input name="bankAccountNumber" value="${escapeAttribute(provider.bankAccountNumber || "")}">
          </div>
          <div class="form-field">
            <label>Titular</label>
            <input name="bankAccountHolder" value="${escapeAttribute(provider.bankAccountHolder || provider.legalName || provider.name || providerName)}">
          </div>
          <div class="form-field">
            <label>CBU / CVU</label>
            <input name="cbu" value="${escapeAttribute(provider.cbu || "")}">
          </div>
          <div class="form-field">
            <label>Alias</label>
            <input name="alias" value="${escapeAttribute(provider.alias || "")}">
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Guardar datos bancarios</button>
          </div>
        </form>
      `;
    }

    function toggleProviderBankForm(providerName) {
      const box = document.getElementById("provider-bank-inline-form");
      if (!box) return;
      box.classList.toggle("hidden");
    }

    async function saveProviderBankFromDebt(event, providerName) {
      event.preventDefault();
      const existing = findProviderRecordByName(providerName) || {};
      const formData = Object.fromEntries(new FormData(event.target).entries());
      const payload = {
        ...existing,
        ...formData,
        id: formData.id || existing.id || "",
        name: formData.name || existing.name || providerName,
        legalName: existing.legalName || "",
        cuit: existing.cuit || "",
        ivaCondition: existing.ivaCondition || "",
        contactName: existing.contactName || "",
        phone: existing.phone || "",
        email: existing.email || "",
        category: existing.category || "",
        address: existing.address || "",
        paymentTerms: existing.paymentTerms || "",
        notes: existing.notes || "",
      };

      const response = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudieron guardar los datos bancarios.", "error");
        return;
      }

      allProviders = result.providers || allProviders;
      erpData.providers = result.providers || erpData.providers;
      showProviderDebt(providerName);
      renderProviders();
      showNotice("Datos bancarios guardados.", "success");
    }

    function showReimbursementDetail(payer) {
      const group = buildReimbursementGroups().find((item) => item.payer === payer);
      if (!group) {
        showNotice("Esa persona no tiene reintegros pendientes.", "error");
        return;
      }
      const totalPaid = roundClientMoney(group.purchases.reduce((sum, purchase) => sum + Number(purchase.paidByPerson || 0), 0));
      const totalReimbursed = roundClientMoney(group.purchases.reduce((sum, purchase) => sum + Number(purchase.reimbursementPaidAmount || 0), 0));
      const totalPending = roundClientMoney(group.purchases.reduce((sum, purchase) => sum + Number(purchase.reimbursementPendingAmount || 0), 0));

      document.getElementById("purchase-rank-title").textContent = `Reintegro - ${payer}`;
      document.getElementById("purchase-rank-subtitle").textContent = `${group.purchaseCount} compra(s) pagadas con plata personal · pendiente ${formatCurrency(totalPending)}`;
      document.getElementById("purchase-rank-body").innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Pagado por ${escapeHtml(payer)}</span><strong>${formatCurrency(totalPaid)}</strong></div>
          <div><span>Ya reintegrado</span><strong>${formatCurrency(totalReimbursed)}</strong></div>
          <div><span>Pendiente de reintegro</span><strong>${formatCurrency(totalPending)}</strong></div>
        </section>
        <form class="form-grid" onsubmit="submitPayerReimbursement(event, '${escapeAttribute(payer)}')">
          <div class="form-field">
            <label>Tipo de reintegro</label>
            <select name="mode" onchange="toggleProviderPaymentAmount(this, ${Number(totalPending || 0)})">
              <option value="partial">Reintegro parcial</option>
              <option value="total">Reintegrar todo</option>
            </select>
          </div>
          <div class="form-field">
            <label>Monto</label>
            <input name="amount" inputmode="decimal" placeholder="${escapeAttribute(formatCurrency(totalPending))}">
          </div>
          <div class="form-field">
            <label>Fecha</label>
            <input name="date" type="date" value="${escapeAttribute(new Date().toISOString().slice(0, 10))}">
          </div>
          <div class="form-field">
            <label>Medio</label>
            ${renderPaymentOptionSelect("paymentMethod", purchaseOptions.paymentMethods || [], "Seleccionar medio")}
          </div>
          <div class="form-field">
            <label>Origen del reintegro</label>
            ${renderPaymentOptionSelect("fundsSource", purchaseOptions.fundsSources || [], "Seleccionar origen")}
          </div>
          <div class="form-field full">
            <label>Nota</label>
            <input name="notes" placeholder="Referencia o aclaracion">
          </div>
          <div class="form-field full">
            <label>Comprobante</label>
            <input name="receiptFile" type="file" accept="application/pdf,image/*">
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Registrar reintegro</button>
          </div>
        </form>
        <h3 style="margin:14px 0 8px;">Compras que componen el reintegro</h3>
        <div class="debt-detail-list">
          ${group.purchases.map((purchase) => `
            <div class="debt-detail-row">
              <div>${escapeHtml(formatShortDate(purchase.date) || purchase.date || "")}</div>
              <div>
                <strong>${escapeHtml(purchase.description || "Compra")}</strong>
                <div class="secondary">${escapeHtml(purchase.provider || "Sin proveedor")} · ${escapeHtml(purchase.eventName || "Sin evento")}</div>
              </div>
              <div>
                <span class="secondary">Pendiente</span>
                <strong>${formatCurrency(purchase.reimbursementPendingAmount || 0)}</strong>
                <div class="secondary">Pagado: ${formatCurrency(purchase.paidByPerson || 0)} · Reintegrado: ${formatCurrency(purchase.reimbursementPaidAmount || 0)}</div>
              </div>
            </div>
          `).join("")}
          <div class="debt-detail-row total">
            <div></div>
            <div>Total pendiente de reintegro</div>
            <div>${formatCurrency(totalPending)}</div>
          </div>
        </div>
        <h3 style="margin:14px 0 8px;">Historial de reintegros</h3>
        ${renderPaymentHistory(group.purchases, "reimbursement")}
      `;
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function renderProviderDebtPurchaseLines(purchase) {
      const lines = getProviderDebtLineRows(purchase);
      if (!lines.length) return [];

      return lines.map((line, index) => `
        <div class="debt-detail-row">
          <div>${escapeHtml(formatShortDate(purchase.date) || purchase.date || "")}</div>
          <div>
            <strong>${escapeHtml(line.description || "Producto")}</strong>
            <div class="secondary">
              ${escapeHtml([
                purchase.eventName || "Sin evento",
                line.quantity ? `Cantidad ${line.quantity}` : "",
                index === 0 ? `Compra total ${formatCurrency(getPurchaseTotal(purchase))}` : "",
              ].filter(Boolean).join(" · "))}
            </div>
          </div>
          <div>
            <span class="secondary">Saldo</span>
            <strong>${formatCurrency(line.pendingAmount)}</strong>
          </div>
        </div>
      `);
    }

    function getProviderDebtLineRows(purchase) {
      const items = purchase.lineItems?.length
        ? purchase.lineItems
        : [{ description: purchase.description || "Compra", quantity: purchase.quantity || "", total: getPurchaseTotal(purchase) }];
      let remainingPaid = Math.max(0, Number(purchase.paidAmount || 0));

      return items.map((item) => {
        const lineTotal = roundClientMoney(getPurchaseLineTotal(purchase, item) || Number(item.total || 0) || Number(item.quantity || 0) * Number(item.unitAmount || 0));
        const paidForLine = Math.min(remainingPaid, lineTotal);
        remainingPaid = Math.max(0, remainingPaid - paidForLine);
        return {
          description: item.description || purchase.description || "Producto",
          quantity: item.quantity || "",
          totalAmount: lineTotal,
          pendingAmount: roundClientMoney(Math.max(0, lineTotal - paidForLine)),
        };
      }).filter((line) => line.pendingAmount > 0);
    }

    function renderPaymentOptionSelect(name, items = [], placeholder = "Seleccionar") {
      const options = Array.from(new Set((items || []).filter(Boolean)));
      return `
        <select name="${escapeAttribute(name)}">
          <option value="">${escapeHtml(placeholder)}</option>
          ${options.map((item) => `<option value="${escapeAttribute(item)}">${escapeHtml(item)}</option>`).join("")}
        </select>
      `;
    }

    function renderPaymentHistory(purchases = [], type = "provider") {
      const entries = purchases.flatMap((purchase) => {
        const log = type === "reimbursement" ? purchase.reimbursementLog : purchase.paymentLog;
        return (Array.isArray(log) ? log : []).map((item) => ({
          ...item,
          purchase,
          kind: type,
        }));
      }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

      if (!entries.length) {
        return `<div class="empty">Todavia no hay pagos registrados.</div>`;
      }

      return `
        <div class="debt-detail-list">
          ${entries.map((entry) => `
            <div class="debt-detail-row">
              <div>${escapeHtml(formatShortDate(entry.date) || entry.date || "")}</div>
              <div>
                <strong>${escapeHtml(entry.kind === "reimbursement" ? `Reintegro a ${entry.purchase.fundsSource || "persona"}` : entry.purchase.provider || "Proveedor")}</strong>
                <div class="secondary">${escapeHtml([
                  entry.purchase.description || "Compra",
                  entry.paymentMethod || "Medio sin definir",
                  entry.fundsSource || "Origen sin definir",
                ].filter(Boolean).join(" · "))}</div>
                ${entry.notes ? `<div class="secondary">${escapeHtml(entry.notes)}</div>` : ""}
                ${renderPaymentReceiptLink(entry.receipt)}
              </div>
              <div><span class="secondary">Monto</span><strong>${formatCurrency(entry.amount || 0)}</strong></div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderPaymentReceiptLink(receipt) {
      if (!receipt?.dataUrl) return "";
      return `
        <div class="actions" style="margin-top:6px;">
          <a class="filter" href="${escapeAttribute(receipt.dataUrl)}" download="${escapeAttribute(receipt.name || "comprobante")}">Descargar comprobante</a>
        </div>
      `;
    }

    function toggleProviderPaymentAmount(select, totalDebt) {
      const input = select.closest("form").elements.amount;
      if (select.value === "total") {
        input.value = totalDebt;
        input.disabled = true;
      } else {
        input.disabled = false;
        input.value = "";
      }
    }

    async function submitProviderPayment(event, provider) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      payload.provider = provider;
      payload.receipt = await getPaymentReceiptPayload(event.target.elements.receiptFile?.files?.[0]);
      delete payload.receiptFile;
      const response = await fetch("/api/provider-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo registrar el pago.", "error");
        return;
      }

      erpData.dashboard = result.dashboard || erpData.dashboard;
      erpData.purchases = result.purchases || erpData.purchases;
      renderPurchaseDashboard();
      const nextDebt = buildProviderDebts().find((item) => item.provider === provider);
      if (nextDebt) {
        showProviderDebt(provider);
      } else if (buildProviderDebts().length) {
        showProviderDebtWindow();
      } else {
        hidePurchaseRankDetail();
      }
      showNotice(`Pago aplicado: ${formatCurrency(result.result?.appliedAmount || 0)}. Saldo restante: ${formatCurrency(result.result?.debtAfter || 0)}.`, "success");
    }

    async function submitPayerReimbursement(event, payer) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      payload.payer = payer;
      payload.receipt = await getPaymentReceiptPayload(event.target.elements.receiptFile?.files?.[0]);
      delete payload.receiptFile;
      const response = await fetch("/api/payer-reimbursement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo registrar el reintegro.", "error");
        return;
      }

      erpData.dashboard = result.dashboard || erpData.dashboard;
      erpData.purchases = result.purchases || erpData.purchases;
      erpData.financeDashboard = result.financeDashboard || erpData.financeDashboard;
      renderFinanceDashboard();
      const nextGroup = buildReimbursementGroups().find((item) => item.payer === payer && Number(item.pendingAmount || 0) > 0);
      if (nextGroup) {
        showReimbursementDetail(payer);
      } else {
        showReimbursementWindow();
      }
      showNotice(`Reintegro aplicado: ${formatCurrency(result.result?.appliedAmount || 0)}. Pendiente: ${formatCurrency(result.result?.debtAfter || 0)}.`, "success");
    }

    function getPaymentReceiptPayload(file) {
      if (!file) return null;
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: reader.result,
          uploadedAt: new Date().toISOString(),
        });
        reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
        reader.readAsDataURL(file);
      });
    }

    function normalizePurchaseDate(value) {
      if (!value) return "";
      const raw = String(value).trim();
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

      const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
      }

      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? "" : toDateValue(date);
    }

    function formatPeriodLabel(from, to, fallback) {
      if (from && to) return `${formatShortDate(from)} al ${formatShortDate(to)}`;
      if (from) return `Desde ${formatShortDate(from)}`;
      if (to) return `Hasta ${formatShortDate(to)}`;
      return fallback;
    }

    function addDays(date, days) {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    }

    function toDateValue(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function renderPurchaseRank(title, key, rows) {
      const top = rows[0];
      const summary = top
        ? `${top.label || "Sin definir"} · ${formatCurrency(top.total || 0)}`
        : "Sin datos";
      return `
        <article class="purchase-panel" onclick="showPurchaseRankDetail('${escapeAttribute(title)}', '${escapeAttribute(key)}')">
          <div class="purchase-panel-head">
            <div>
              <div class="purchase-panel-title">${escapeHtml(title)}</div>
              <div class="purchase-panel-summary">${escapeHtml(summary)}</div>
            </div>
            <div class="purchase-panel-toggle">...</div>
          </div>
        </article>
      `;
    }

    function showPurchaseRankDetail(title, key) {
      const rows = buildPurchaseSummary(getVisiblePurchasesByPeriod())[key] || [];
      const period = getPurchasePeriodRange();
      const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const count = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
      document.getElementById("purchase-rank-title").textContent = title;
      document.getElementById("purchase-rank-subtitle").textContent = `${period.label} · ranking de compras`;
      document.getElementById("purchase-rank-body").innerHTML = `
        <section class="rank-modal-summary">
          <div><span>Total</span><strong>${formatCurrency(total)}</strong></div>
          <div><span>Compras</span><strong>${escapeHtml(count)}</strong></div>
          <div><span>Grupos</span><strong>${escapeHtml(rows.length)}</strong></div>
        </section>
        <input id="purchase-rank-search" class="search rank-search" placeholder="Buscar dentro de este ranking">
        <div id="purchase-rank-list">${renderPurchaseRankRows(rows)}</div>
      `;
      document.getElementById("purchase-rank-search").addEventListener("input", (event) => {
        const term = normalizeSearch(event.target.value);
        const filteredRows = rows.filter((row) => normalizeSearch(row.label || "Sin definir").includes(term));
        document.getElementById("purchase-rank-list").innerHTML = renderPurchaseRankRows(filteredRows);
      });
      document.getElementById("purchase-rank-detail").classList.add("open");
    }

    function renderPurchaseRankRows(rows) {
      if (!rows.length) return `<div class="empty">No hay resultados para mostrar.</div>`;

      return `
        <section class="rank-list">
          ${rows.map((row, index) => `
            <article class="rank-row">
              <div class="rank-position">${escapeHtml(index + 1)}</div>
              <div>
                <div class="rank-label" title="${escapeAttribute(row.label || "Sin definir")}">${escapeHtml(row.label || "Sin definir")}</div>
                <div class="rank-meta">${escapeHtml(row.count || 0)} compra(s)</div>
              </div>
              <div class="rank-amount">${formatCurrency(row.total || 0)}</div>
            </article>
          `).join("")}
        </section>
      `;
    }

    function hidePurchaseRankDetail() {
      document.getElementById("purchase-rank-detail").classList.remove("open");
    }

    function closePurchaseRankDetail(event) {
      if (event.target.id === "purchase-rank-detail") {
        hidePurchaseRankDetail();
      }
    }

    function renderPurchaseTable() {
      const container = document.getElementById("purchase-table-wrap");
      if (!container) return;

      const term = normalizeSearch(document.getElementById("purchase-dashboard-search")?.value || "");
      const status = document.getElementById("purchase-dashboard-status")?.value || "";
      const rows = getVisiblePurchasesByPeriod()
        .filter((purchase) => !status || purchase.paymentStatus === status)
        .filter((purchase) => !term || normalizeSearch([
          purchase.date,
          purchase.provider,
          purchase.description,
          purchase.eventName,
          purchase.invoiceType,
          purchase.paymentStatus,
          purchase.paymentMethod,
          purchase.fundsSource,
          purchase.notes,
        ].join(" ")).includes(term));

      if (!rows.length) {
        container.innerHTML = `<div class="empty">No hay compras para ese filtro.</div>`;
        return;
      }

      container.innerHTML = `
        <div class="purchase-table-wrap">
          <table class="purchase-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Producto / descripcion</th>
                <th>Evento</th>
                <th class="number">Cantidad</th>
                <th class="money">Unitario</th>
                <th class="money">Total</th>
                <th class="money">Pagado</th>
                <th class="money">Saldo</th>
                <th>Comprobante</th>
                <th>Estado pago</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rows.flatMap((purchase) => {
                const items = purchase.lineItems?.length ? purchase.lineItems : [{ description: purchase.description, quantity: "", unitAmount: "", total: getPurchaseTotal(purchase) }];
                return items.map((item, index) => `
                  <tr onclick="editPurchase('${escapeAttribute(purchase.id)}')">
                    <td>${escapeHtml(formatShortDate(purchase.date) || purchase.date || "")}</td>
                    <td>${escapeHtml(purchase.provider || "")}</td>
                    <td>${escapeHtml(item.description || purchase.description || "")}</td>
                    <td>${escapeHtml(purchase.eventName || "")}</td>
                    <td class="number">${escapeHtml(item.quantity || "")}</td>
                    <td class="money">${formatCurrency(item.unitAmount || 0)}</td>
                    <td class="money">${formatCurrency(getPurchaseLineTotal(purchase, item) || getPurchaseTotal(purchase) || 0)}</td>
                    <td class="money">${index === 0 ? formatCurrency(purchase.paidAmount || 0) : ""}</td>
                    <td class="money">${index === 0 ? formatCurrency(getPurchasePending(purchase)) : ""}</td>
                    <td>${escapeHtml(purchase.invoiceType || "")}</td>
                    <td><span class="badge ${purchase.paymentStatus === "Pagado" ? "confirmed" : "missing_info"}">${escapeHtml(purchase.paymentStatus || "Pendiente")}</span></td>
                    <td class="number">
                      ${index === 0 ? `
                        <div class="actions" onclick="event.stopPropagation()">
                          <button class="menu-dot" type="button" onclick="showPurchaseActions('${escapeAttribute(purchase.id)}')">...</button>
                        </div>
                      ` : ""}
                    </td>
                  </tr>
                `);
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function showPurchaseOrderAdvisor() {
      showPurchaseOrderForm();
    }

    function showPurchaseOrderForm(id = "") {
      const form = document.getElementById("purchase-order-advisor-form");
      if (!form) return;
      form.reset();
      form.elements.id.value = "";
      document.getElementById("purchase-order-title").textContent = id ? "Editar orden de compra" : "Orden de compra";
      document.getElementById("purchase-order-delete-button").classList.toggle("hidden", !id);
      renderPurchaseOrderEventOptions();
      renderPurchaseOrderDatalists();
      document.getElementById("purchase-order-items").innerHTML = "";
      const order = id ? (purchaseOrders || []).find((item) => item.id === id) : null;
      if (order) {
        setFormValue(form, "id", order.id || "");
        setFormValue(form, "eventId", order.eventId || "");
        setFormValue(form, "title", order.title || "");
        setFormValue(form, "menuType", order.menuType || "");
        setFormValue(form, "status", order.status || "draft");
        setFormValue(form, "neededDate", order.neededDate || "");
        setFormValue(form, "notes", order.notes || "");
        (order.items || []).forEach(addPurchaseOrderItemRow);
      } else {
        addPurchaseOrderItemRow();
        syncPurchaseOrderEventData();
      }
      renderPurchaseOrderPreview();
      document.getElementById("purchase-order-advisor").classList.add("open");
    }

    function hidePurchaseOrderAdvisor() {
      document.getElementById("purchase-order-advisor").classList.remove("open");
    }

    function closePurchaseOrderAdvisor(event) {
      if (event.target.id === "purchase-order-advisor") {
        hidePurchaseOrderAdvisor();
      }
    }

    function renderPurchaseOrderEventOptions() {
      const select = document.querySelector("#purchase-order-advisor-form select[name='eventId']");
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">Seleccionar evento</option>${(erpData.events || []).map((event) => `
        <option value="${escapeAttribute(event.id)}">${escapeHtml(event.name || "Sin nombre")} · ${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")}</option>
      `).join("")}`;
      select.value = current;
    }

    function getPurchaseOrderProductOptions() {
      return Array.from(new Set([
        ...(purchaseOptions.products || []),
        ...(erpData.purchases || []).flatMap((purchase) => [
          purchase.description,
          ...(purchase.lineItems || []).map((item) => item.description),
        ]),
        ...(erpData.recipes || allRecipes || []).flatMap((recipe) => [
          recipe.name,
          ...(recipe.items || []).map((item) => item.name),
        ]),
        ...(erpData.events || []).flatMap((event) => getKitchenChecklistItems(event).map((item) => item.name)),
      ].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
    }

    function getPurchaseOrderProviderOptions() {
      return Array.from(new Set([
        ...(purchaseOptions.providers || []),
        ...(allProviders || []).map((provider) => provider.name),
        ...(erpData.providers || []).map((provider) => provider.name),
        ...(erpData.purchases || []).map((purchase) => purchase.provider),
      ].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
    }

    function renderPurchaseOrderDatalists() {
      const products = getPurchaseOrderProductOptions();
      const providers = getPurchaseOrderProviderOptions();
      const productList = document.getElementById("purchase-products-datalist");
      const providerList = document.getElementById("purchase-providers-datalist");
      if (productList) productList.innerHTML = products.map((item) => `<option value="${escapeAttribute(item)}"></option>`).join("");
      if (providerList) providerList.innerHTML = providers.map((item) => `<option value="${escapeAttribute(item)}"></option>`).join("");
    }

    function syncPurchaseOrderEventData() {
      const form = document.getElementById("purchase-order-advisor-form");
      const event = (erpData.events || []).find((item) => item.id === form.elements.eventId.value);
      if (!event) return;
      if (!form.elements.title.value.trim()) form.elements.title.value = `Orden de compra - ${event.name || "Evento"}`;
      if (!form.elements.menuType.value.trim()) form.elements.menuType.value = event.serviceType || event.eventMoments || "";
      if (!form.elements.neededDate.value && event.eventDate) form.elements.neededDate.value = event.eventDate;
      renderPurchaseOrderPreview();
    }

    function addPurchaseOrderItemRow(item = {}) {
      const container = document.getElementById("purchase-order-items");
      if (!container) return;
      const row = document.createElement("div");
      row.className = "purchase-order-row";
      row.dataset.itemId = item.id || `item-${Date.now()}`;
      row.innerHTML = `
        <div class="autocomplete">
          <input class="po-item-product" autocomplete="off" placeholder="Producto / insumo" value="${escapeAttribute(item.productName || "")}" list="purchase-products-datalist">
          <div class="autocomplete-list"></div>
        </div>
        <input class="po-item-quantity" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}">
        <input class="po-item-unit" placeholder="Unidad" value="${escapeAttribute(item.unit || "")}">
        <div class="autocomplete">
          <input class="po-item-provider" autocomplete="off" placeholder="Proveedor sugerido/asignado" value="${escapeAttribute(item.providerName || item.suggestedProvider || "")}" list="purchase-providers-datalist">
          <div class="autocomplete-list"></div>
        </div>
        <input class="po-item-notes" placeholder="Nota" value="${escapeAttribute(item.notes || "")}">
        <button class="reject icon-action" type="button" onclick="this.closest('.purchase-order-row').remove(); renderPurchaseOrderPreview();">X</button>
      `;
      container.appendChild(row);
      setupAutocompleteForElement(
        row.querySelector(".po-item-product"),
        row.querySelector(".po-item-product")?.parentElement.querySelector(".autocomplete-list"),
        getPurchaseOrderProductOptions,
        () => {
          const provider = suggestPurchaseOrderProvider(row.querySelector(".po-item-product")?.value || "");
          const providerInput = row.querySelector(".po-item-provider");
          if (provider && providerInput && !providerInput.value.trim()) providerInput.value = provider;
          renderPurchaseOrderPreview();
        },
        { showOnEmpty: true }
      );
      setupAutocompleteForElement(
        row.querySelector(".po-item-provider"),
        row.querySelector(".po-item-provider")?.parentElement.querySelector(".autocomplete-list"),
        getPurchaseOrderProviderOptions,
        renderPurchaseOrderPreview,
        { showOnEmpty: true }
      );
      row.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
          if (input.classList.contains("po-item-product")) {
            const provider = suggestPurchaseOrderProvider(input.value);
            const providerInput = row.querySelector(".po-item-provider");
            if (provider && !providerInput.value.trim()) providerInput.value = provider;
          }
          renderPurchaseOrderPreview();
        });
      });
    }

    function addPurchaseOrderItemsFromEventMenu() {
      const form = document.getElementById("purchase-order-advisor-form");
      const event = (erpData.events || []).find((item) => item.id === form.elements.eventId.value);
      if (!event) {
        showNotice("Seleccione un evento para traer su menu.", "error");
        return;
      }
      const menuItems = getKitchenChecklistItems(event);
      if (!menuItems.length) {
        showNotice("Ese evento no tiene items de menu cargados.", "error");
        return;
      }
      const container = document.getElementById("purchase-order-items");
      if (container.querySelectorAll(".purchase-order-row").length === 1 && !container.querySelector(".po-item-product")?.value.trim()) {
        container.innerHTML = "";
      }
      menuItems.forEach((item) => addPurchaseOrderItemRow({
        productName: item.name,
        quantity: item.quantity || item.suggestedQuantity || "",
        unit: "",
        notes: item.detail || "",
      }));
      applyPurchaseOrderProviderSuggestions();
      renderPurchaseOrderPreview();
    }

    function suggestPurchaseOrderProvider(productName) {
      const key = normalizeSearch(productName || "");
      if (!key) return "";
      const purchases = (erpData.purchases || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const match = purchases.find((purchase) => {
        const values = [purchase.description, ...(purchase.lineItems || []).map((item) => item.description)]
          .map(normalizeSearch)
          .filter(Boolean);
        return values.some((value) => value.includes(key) || key.includes(value));
      });
      return match?.provider || "";
    }

    function applyPurchaseOrderProviderSuggestions() {
      document.querySelectorAll("#purchase-order-items .purchase-order-row").forEach((row) => {
        const product = row.querySelector(".po-item-product")?.value || "";
        const providerInput = row.querySelector(".po-item-provider");
        const provider = suggestPurchaseOrderProvider(product);
        if (provider && providerInput) providerInput.value = provider;
      });
      renderPurchaseOrderPreview();
    }

    function collectPurchaseOrderPayload() {
      const form = document.getElementById("purchase-order-advisor-form");
      const selectedEvent = (erpData.events || []).find((event) => event.id === form.elements.eventId.value);
      return {
        id: form.elements.id.value,
        eventId: form.elements.eventId.value,
        eventName: selectedEvent?.name || "",
        title: form.elements.title.value.trim(),
        menuType: form.elements.menuType.value.trim(),
        status: form.elements.status.value,
        neededDate: form.elements.neededDate.value,
        notes: form.elements.notes.value.trim(),
        items: Array.from(document.querySelectorAll("#purchase-order-items .purchase-order-row"))
          .map((row) => ({
            id: row.dataset.itemId || "",
            productName: row.querySelector(".po-item-product")?.value.trim() || "",
            quantity: row.querySelector(".po-item-quantity")?.value.trim() || "",
            unit: row.querySelector(".po-item-unit")?.value.trim() || "",
            providerName: row.querySelector(".po-item-provider")?.value.trim() || "",
            suggestedProvider: suggestPurchaseOrderProvider(row.querySelector(".po-item-product")?.value || ""),
            notes: row.querySelector(".po-item-notes")?.value.trim() || "",
          }))
          .filter((item) => item.productName),
      };
    }

    function renderPurchaseOrderPreview() {
      const box = document.getElementById("purchase-order-result");
      if (!box) return;
      const order = collectPurchaseOrderPayload();
      const grouped = order.items.reduce((groups, item) => {
        const provider = item.providerName || item.suggestedProvider || "Sin proveedor";
        groups[provider] = groups[provider] || [];
        groups[provider].push(item);
        return groups;
      }, {});
      box.innerHTML = order.items.length ? `
        <section class="purchase-order-result-card">
          <span>Vista por proveedor</span>
          <div class="purchase-order-list" style="margin-top:10px;">
            ${Object.entries(grouped).map(([provider, items]) => `
              <div class="purchase-order-list-row">
                <strong>${escapeHtml(provider)}</strong>
                <div>${escapeHtml(items.length)} producto(s)</div>
                <div>${escapeHtml(items.map((item) => [item.quantity, item.unit, item.productName].filter(Boolean).join(" ")).join("; "))}</div>
              </div>
            `).join("")}
          </div>
        </section>
      ` : `<div class="empty compact-empty">Agregue productos para armar la orden.</div>`;
    }

    async function savePurchaseOrder(event) {
      event.preventDefault();
      const payload = collectPurchaseOrderPayload();
      const response = await fetch("/api/purchase-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar la orden de compra.", "error");
        return;
      }
      purchaseOrders = result.orders || purchaseOrders;
      erpData.purchaseOrders = purchaseOrders;
      hidePurchaseOrderAdvisor();
      renderPurchaseDashboard();
      showNotice("Orden de compra guardada.", "success");
    }

    async function deletePurchaseOrder() {
      const id = document.getElementById("purchase-order-advisor-form").elements.id.value;
      if (!id || !confirm("Eliminar esta orden de compra?")) return;
      const response = await fetch("/api/delete-purchase-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar la orden.", "error");
        return;
      }
      purchaseOrders = result.orders || purchaseOrders.filter((order) => order.id !== id);
      erpData.purchaseOrders = purchaseOrders;
      hidePurchaseOrderAdvisor();
      renderPurchaseDashboard();
      showNotice("Orden de compra eliminada.", "success");
    }

    function buildPurchaseOrderText() {
      const order = collectPurchaseOrderPayload();
      const grouped = order.items.reduce((groups, item) => {
        const provider = item.providerName || item.suggestedProvider || "Sin proveedor";
        groups[provider] = groups[provider] || [];
        groups[provider].push(item);
        return groups;
      }, {});
      return [
        `ORDEN DE COMPRA - ${(order.title || "SIN TITULO").toUpperCase()}`,
        `Evento: ${order.eventName || "Sin evento"}`,
        `Tipo/menu: ${order.menuType || "Sin definir"}`,
        `Necesario para: ${order.neededDate || "Sin fecha"}`,
        "",
        ...Object.entries(grouped).flatMap(([provider, items]) => [
          provider.toUpperCase(),
          ...items.map((item) => `- ${[item.quantity, item.unit, item.productName].filter(Boolean).join(" ")}${item.notes ? ` (${item.notes})` : ""}`),
          "",
        ]),
        order.notes ? `Notas: ${order.notes}` : "",
      ].filter((line, index, arr) => line || arr[index - 1]).join("\n");
    }

    async function copyPurchaseOrderText() {
      const text = buildPurchaseOrderText();
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      showNotice("Orden copiada.", "success");
    }

    function downloadPurchaseOrderText() {
      const text = buildPurchaseOrderText();
      downloadTextFile(`orden-compra-${Date.now()}.txt`, text);
      showNotice("Orden descargada.", "success");
    }

    function getLatestPurchaseReceiptForOrder(orderId) {
      return (purchaseReceipts || [])
        .filter((receipt) => receipt.orderId === orderId)
        .sort((a, b) => String(b.receivedAt || b.updatedAt || "").localeCompare(String(a.receivedAt || a.updatedAt || "")))[0] || null;
    }

    function showPurchaseReceiptForm(orderId) {
      const order = (purchaseOrders || []).find((item) => item.id === orderId);
      if (!order) {
        showNotice("No encontre esa orden de compra.", "error");
        return;
      }
      const receipt = getLatestPurchaseReceiptForOrder(orderId);
      const form = document.getElementById("purchase-receipt-form");
      form.reset();
      form.elements.id.value = receipt?.id || "";
      form.elements.orderId.value = order.id;
      form.elements.receivedAt.value = receipt?.receivedAt || toDateValue(new Date());
      form.elements.receivedBy.value = receipt?.receivedBy || currentUser?.displayName || currentUser?.username || "";
      form.elements.notes.value = receipt?.notes || "";
      document.getElementById("purchase-receipt-convert-button")?.classList.toggle("hidden", Boolean(receipt?.convertedPurchaseId));
      document.getElementById("purchase-receipt-title").textContent = `Recepcion - ${order.title || "Orden"}`;
      document.getElementById("purchase-receipt-subtitle").textContent = `${order.eventName || "Sin evento"} · ${order.menuType || "Sin tipo"}`;
      const items = receipt?.items?.length ? receipt.items : (order.items || []).map((item) => ({
        orderItemId: item.id,
        productName: item.productName,
        providerName: item.providerName || item.suggestedProvider || "",
        itemType: item.itemType || "merchandise",
        orderedQuantity: item.quantity,
        receivedQuantity: "",
        unit: item.unit,
        unitAmount: item.unitAmount || "",
        ivaRate: item.ivaRate || "0",
        notes: item.notes || "",
      }));
      document.getElementById("purchase-receipt-items").innerHTML = "";
      items.forEach(addPurchaseReceiptItemRow);
      renderPurchaseReceiptSummary();
      document.getElementById("purchase-receipt-detail").classList.add("open");
    }

    function hidePurchaseReceiptForm() {
      document.getElementById("purchase-receipt-detail").classList.remove("open");
    }

    function closePurchaseReceiptForm(event) {
      if (event.target.id === "purchase-receipt-detail") {
        hidePurchaseReceiptForm();
      }
    }

    function addPurchaseReceiptItemRow(item = {}) {
      const container = document.getElementById("purchase-receipt-items");
      if (!container) return;
      const row = document.createElement("div");
      row.className = "purchase-order-row receipt-row";
      row.dataset.itemId = item.id || `recepcion-item-${Date.now()}`;
      row.dataset.orderItemId = item.orderItemId || "";
      row.innerHTML = `
        <input class="receipt-product" value="${escapeAttribute(item.productName || "")}" readonly>
        <select class="receipt-item-type">
          <option value="merchandise" ${item.itemType === "merchandise" || !item.itemType ? "selected" : ""}>Mercaderia</option>
          <option value="tableware" ${item.itemType === "tableware" ? "selected" : ""}>Vajilla</option>
          <option value="rental" ${item.itemType === "rental" ? "selected" : ""}>Alquiler</option>
          <option value="equipment" ${item.itemType === "equipment" ? "selected" : ""}>Equipamiento</option>
        </select>
        <input class="receipt-ordered" value="${escapeAttribute(item.orderedQuantity || "")}" readonly title="Cantidad pedida">
        <input class="receipt-received" placeholder="Recibido" value="${escapeAttribute(item.receivedQuantity || "")}">
        <input class="receipt-unit" placeholder="Unidad" value="${escapeAttribute(item.unit || "")}">
        <input class="receipt-unit-amount" placeholder="$ unit." value="${escapeAttribute(item.unitAmount || "")}">
        <select class="receipt-iva">
          <option value="0" ${Number(item.ivaRate || 0) === 0 ? "selected" : ""}>IVA 0%</option>
          <option value="0.105" ${Number(item.ivaRate || 0) === 0.105 ? "selected" : ""}>IVA 10.5%</option>
          <option value="0.21" ${Number(item.ivaRate || 0) === 0.21 ? "selected" : ""}>IVA 21%</option>
          <option value="0.27" ${Number(item.ivaRate || 0) === 0.27 ? "selected" : ""}>IVA 27%</option>
        </select>
        <input class="receipt-provider" placeholder="Proveedor / marca" value="${escapeAttribute(item.providerName || item.brandReceived || "")}">
        <select class="receipt-difference-status">
          <option value="pending" ${item.differenceStatus === "pending" ? "selected" : ""}>Dif. pendiente</option>
          <option value="resolved" ${item.differenceStatus === "resolved" ? "selected" : ""}>Dif. resuelta</option>
          <option value="accepted" ${item.differenceStatus === "accepted" ? "selected" : ""}>Aceptada</option>
        </select>
        <input class="receipt-difference-reason" placeholder="Diferencia / nota" value="${escapeAttribute(item.differenceReason || item.notes || "")}">
      `;
      container.appendChild(row);
      row.querySelectorAll("input, select").forEach((input) => input.addEventListener("input", renderPurchaseReceiptSummary));
      row.querySelectorAll("select").forEach((input) => input.addEventListener("change", renderPurchaseReceiptSummary));
    }

    function collectPurchaseReceiptPayload() {
      const form = document.getElementById("purchase-receipt-form");
      const order = (purchaseOrders || []).find((item) => item.id === form.elements.orderId.value);
      return {
        id: form.elements.id.value,
        orderId: form.elements.orderId.value,
        orderTitle: order?.title || "",
        eventId: order?.eventId || "",
        eventName: order?.eventName || "",
        receivedAt: form.elements.receivedAt.value,
        receivedBy: form.elements.receivedBy.value.trim(),
        notes: form.elements.notes.value.trim(),
        items: Array.from(document.querySelectorAll("#purchase-receipt-items .receipt-row"))
          .map((row) => ({
            id: row.dataset.itemId || "",
            orderItemId: row.dataset.orderItemId || "",
            productName: row.querySelector(".receipt-product")?.value.trim() || "",
            providerName: row.querySelector(".receipt-provider")?.value.trim() || "",
            itemType: row.querySelector(".receipt-item-type")?.value || "merchandise",
            orderedQuantity: row.querySelector(".receipt-ordered")?.value.trim() || "",
            receivedQuantity: row.querySelector(".receipt-received")?.value.trim() || "",
            unit: row.querySelector(".receipt-unit")?.value.trim() || "",
            unitAmount: row.querySelector(".receipt-unit-amount")?.value.trim() || "",
            ivaRate: row.querySelector(".receipt-iva")?.value || "0",
            differenceReason: row.querySelector(".receipt-difference-reason")?.value.trim() || "",
            differenceStatus: row.querySelector(".receipt-difference-status")?.value || "pending",
          }))
          .filter((item) => item.productName),
      };
    }

    function getReceiptDifference(item) {
      const ordered = parseDecimal(item.orderedQuantity || 0);
      const received = parseDecimal(item.receivedQuantity || 0);
      if (!ordered && !received) return 0;
      return received - ordered;
    }

    function renderPurchaseReceiptSummary() {
      const box = document.getElementById("purchase-receipt-summary");
      if (!box) return;
      const receipt = collectPurchaseReceiptPayload();
      const rows = receipt.items.map((item) => ({ ...item, difference: getReceiptDifference(item) }));
      const differenceRows = rows.filter((item) => Math.abs(item.difference || 0) > 0.0001 || item.differenceReason);
      const unresolvedRows = differenceRows.filter((item) => !["resolved", "accepted"].includes(item.differenceStatus));
      const receivedRows = rows.filter((item) => parseDecimal(item.receivedQuantity || 0) > 0);
      const estimatedTotal = rows.reduce((sum, item) => {
        const quantity = parseDecimal(item.receivedQuantity || 0);
        const unitAmount = parseDecimal(item.unitAmount || 0);
        const ivaRate = parseDecimal(item.ivaRate || 0);
        return sum + quantity * unitAmount * (1 + ivaRate);
      }, 0);
      const typeCounts = rows.reduce((acc, item) => {
        const label = getReceiptItemTypeLabel(item.itemType);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      const status = differenceRows.length
        ? "with_differences"
        : receivedRows.length >= rows.length && rows.length
          ? "complete"
          : receivedRows.length
            ? "partial"
            : "pending";
      box.innerHTML = `
        <section class="purchase-order-result-grid">
          <div class="purchase-order-result-card"><span>Estado</span><strong>${escapeHtml(getPurchaseReceiptStatusLabel(status))}</strong></div>
          <div class="purchase-order-result-card"><span>Productos</span><strong>${escapeHtml(receivedRows.length)} / ${escapeHtml(rows.length)}</strong></div>
          <div class="purchase-order-result-card"><span>Diferencias pendientes</span><strong>${escapeHtml(unresolvedRows.length)} / ${escapeHtml(differenceRows.length)}</strong></div>
          <div class="purchase-order-result-card"><span>Total estimado</span><strong>${formatCurrency(estimatedTotal)}</strong></div>
          <div class="purchase-order-result-card"><span>Tipo</span><strong>${escapeHtml(Object.entries(typeCounts).map(([name, count]) => `${name}: ${count}`).join(" · ") || "Sin datos")}</strong></div>
        </section>
        ${differenceRows.length ? `
          <section class="purchase-order-result-card">
            <span>Diferencias detectadas</span>
            <div class="purchase-order-list" style="margin-top:10px;">
              ${differenceRows.map((item) => `
                <div class="purchase-order-list-row">
                  <strong>${escapeHtml(item.productName)}</strong>
                  <div>${escapeHtml(formatSmartNumber(item.difference || 0))} ${escapeHtml(item.unit || "")}</div>
                  <div>${escapeHtml(item.differenceStatus === "pending" ? "Pendiente" : item.differenceStatus === "resolved" ? "Resuelta" : "Aceptada")} · ${escapeHtml(item.differenceReason || "Sin motivo")}</div>
                </div>
              `).join("")}
            </div>
          </section>
        ` : ""}
      `;
    }

    function getReceiptItemTypeLabel(type) {
      return {
        merchandise: "Mercaderia",
        tableware: "Vajilla",
        rental: "Alquiler",
        equipment: "Equipamiento",
      }[type || "merchandise"] || "Mercaderia";
    }

    async function savePurchaseReceipt(event) {
      event.preventDefault();
      const payload = collectPurchaseReceiptPayload();
      const response = await fetch("/api/purchase-order-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar la recepcion.", "error");
        return;
      }
      purchaseReceipts = result.receipts || purchaseReceipts;
      purchaseOrders = result.orders || purchaseOrders;
      erpData.purchaseReceipts = purchaseReceipts;
      erpData.purchaseOrders = purchaseOrders;
      hidePurchaseReceiptForm();
      renderPurchaseDashboard();
      showNotice("Recepcion guardada.", "success");
    }

    async function convertPurchaseReceiptToPurchase() {
      const payload = collectPurchaseReceiptPayload();
      if (!payload.id) {
        showNotice("Primero guarde la recepcion antes de convertirla.", "error");
        return;
      }
      const unresolved = payload.items.filter((item) =>
        (Math.abs(getReceiptDifference(item)) > 0.0001 || item.differenceReason) &&
        !["resolved", "accepted"].includes(item.differenceStatus)
      );
      if (unresolved.length) {
        showNotice("Hay diferencias pendientes. Marquelas como resueltas o aceptadas antes de convertir.", "error");
        return;
      }
      if (payload.items.some((item) => parseDecimal(item.receivedQuantity || 0) > 0 && parseDecimal(item.unitAmount || 0) <= 0)) {
        showNotice("Cargue precio unitario en cada producto recibido antes de convertir.", "error");
        return;
      }
      const response = await fetch("/api/convert-purchase-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payload.id }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo convertir la recepcion.", "error");
        return;
      }
      purchaseReceipts = result.receipts || purchaseReceipts;
      purchaseOrders = result.orders || purchaseOrders;
      erpData.purchaseReceipts = purchaseReceipts;
      erpData.purchaseOrders = purchaseOrders;
      erpData.purchases = result.purchases || erpData.purchases || [];
      erpData.inventory = result.inventory || erpData.inventory || [];
      hidePurchaseReceiptForm();
      renderPurchaseDashboard();
      showNotice("Recepcion convertida en compra real e inventario actualizado.", "success");
    }

    function loadPizzaPurchaseOrderExample() {
      const form = document.getElementById("purchase-order-advisor-form");
      if (!form) return;
      setFormValue(form, "productionName", "pizza");
      setFormValue(form, "targetCount", "10");
      setFormValue(form, "wastePercent", "5");
      setFormValue(form, "distributionMode", "balanced");
      setFormValue(form, "baseWidth", "30");
      setFormValue(form, "baseHeight", "40");
      document.getElementById("purchase-order-trays").innerHTML = "";
      [
        { name: "Rectangular grande 30x40", shape: "rect", width: 30, height: 40 },
        { name: "Rectangular chica 30x25", shape: "rect", width: 30, height: 25 },
        { name: "Redonda 30 cm", shape: "round", diameter: 30 },
      ].forEach(addPurchaseOrderTrayRow);
      document.getElementById("purchase-order-ingredients").innerHTML = "";
      [
        { name: "Harina", quantity: 500, unit: "g" },
        { name: "Levadura", quantity: 50, unit: "g" },
        { name: "Salsa", quantity: 100, unit: "ml" },
        { name: "Queso", quantity: 300, unit: "g" },
      ].forEach(addPurchaseOrderIngredientRow);
      calculatePurchaseOrderAdvisor();
    }

    function addPurchaseOrderTrayRow(item = {}) {
      const container = document.getElementById("purchase-order-trays");
      if (!container) return;
      const row = document.createElement("div");
      row.className = "purchase-order-row";
      row.innerHTML = `
        <input class="po-tray-name" placeholder="Nombre de bandeja" value="${escapeAttribute(item.name || "")}">
        <select class="po-tray-shape" onchange="calculatePurchaseOrderAdvisor()">
          <option value="rect" ${(item.shape || "rect") === "rect" ? "selected" : ""}>Rectangular</option>
          <option value="round" ${item.shape === "round" ? "selected" : ""}>Redonda</option>
        </select>
        <input class="po-tray-width" inputmode="decimal" placeholder="Ancho / diam." value="${escapeAttribute(item.width || item.diameter || "")}">
        <input class="po-tray-height" inputmode="decimal" placeholder="Alto" value="${escapeAttribute(item.height || "")}">
        <button class="reject icon-action" type="button" onclick="this.closest('.purchase-order-row').remove(); calculatePurchaseOrderAdvisor();">X</button>
      `;
      container.appendChild(row);
      row.querySelectorAll("input, select").forEach((input) => {
        input.addEventListener("input", calculatePurchaseOrderAdvisor);
        input.addEventListener("change", calculatePurchaseOrderAdvisor);
      });
    }

    function addPurchaseOrderIngredientRow(item = {}) {
      const container = document.getElementById("purchase-order-ingredients");
      if (!container) return;
      const row = document.createElement("div");
      row.className = "purchase-order-row three";
      row.innerHTML = `
        <input class="po-ingredient-name" placeholder="Insumo" value="${escapeAttribute(item.name || "")}">
        <input class="po-ingredient-quantity" inputmode="decimal" placeholder="Cantidad" value="${escapeAttribute(item.quantity || "")}">
        <select class="po-ingredient-unit">
          <option value="g" ${(item.unit || "g") === "g" ? "selected" : ""}>g</option>
          <option value="kg" ${item.unit === "kg" ? "selected" : ""}>kg</option>
          <option value="ml" ${item.unit === "ml" ? "selected" : ""}>ml</option>
          <option value="l" ${item.unit === "l" ? "selected" : ""}>l</option>
          <option value="unidad" ${item.unit === "unidad" ? "selected" : ""}>unidad</option>
        </select>
        <button class="reject icon-action" type="button" onclick="this.closest('.purchase-order-row').remove(); calculatePurchaseOrderAdvisor();">X</button>
      `;
      container.appendChild(row);
      row.querySelectorAll("input, select").forEach((input) => {
        input.addEventListener("input", calculatePurchaseOrderAdvisor);
        input.addEventListener("change", calculatePurchaseOrderAdvisor);
      });
    }

    function getPurchaseOrderAdvisorPayload() {
      const form = document.getElementById("purchase-order-advisor-form");
      const baseWidth = parseDecimal(form.elements.baseWidth.value || 0);
      const baseHeight = parseDecimal(form.elements.baseHeight.value || 0);
      const baseArea = baseWidth * baseHeight;
      return {
        productionName: form.elements.productionName.value.trim() || "produccion",
        targetCount: parseDecimal(form.elements.targetCount.value || 0),
        wastePercent: Math.max(0, parseDecimal(form.elements.wastePercent.value || 0)),
        distributionMode: form.elements.distributionMode.value || "balanced",
        baseWidth,
        baseHeight,
        baseArea,
        trays: Array.from(document.querySelectorAll("#purchase-order-trays .purchase-order-row"))
          .map((row) => {
            const shape = row.querySelector(".po-tray-shape").value;
            const width = parseDecimal(row.querySelector(".po-tray-width").value || 0);
            const height = parseDecimal(row.querySelector(".po-tray-height").value || 0);
            const area = shape === "round" ? Math.PI * (width / 2) ** 2 : width * height;
            return {
              name: row.querySelector(".po-tray-name").value.trim() || (shape === "round" ? "Redonda" : "Rectangular"),
              shape,
              width,
              height,
              area,
              equivalent: baseArea > 0 ? area / baseArea : 0,
            };
          })
          .filter((tray) => tray.area > 0),
        ingredients: Array.from(document.querySelectorAll("#purchase-order-ingredients .purchase-order-row"))
          .map((row) => ({
            name: row.querySelector(".po-ingredient-name").value.trim(),
            quantity: parseDecimal(row.querySelector(".po-ingredient-quantity").value || 0),
            unit: row.querySelector(".po-ingredient-unit").value,
          }))
          .filter((item) => item.name && item.quantity > 0),
      };
    }

    function calculatePurchaseOrderAdvisor() {
      const resultBox = document.getElementById("purchase-order-result");
      if (!resultBox) return;
      const data = getPurchaseOrderAdvisorPayload();
      if (!data.targetCount || !data.baseArea || !data.trays.length || !data.ingredients.length) {
        resultBox.innerHTML = `<div class="empty">Complete objetivo, placa base, bandejas e insumos para calcular.</div>`;
        purchaseOrderAdvisorLastText = "";
        return;
      }

      const plan = findPurchaseOrderTrayPlan(data.trays, data.targetCount, data.distributionMode);
      const marginFactor = 1 + data.wastePercent / 100;
      const purchaseEquivalents = plan.totalEquivalent * marginFactor;
      const shoppingList = data.ingredients.map((item) => {
        const total = item.quantity * purchaseEquivalents;
        return {
          ...item,
          total,
          formatted: formatPurchaseOrderAmount(total, item.unit),
        };
      });

      const trayRows = plan.rows.filter((row) => row.count > 0);
      purchaseOrderAdvisorLastText = buildPurchaseOrderAdvisorText(data, plan, shoppingList);
      resultBox.innerHTML = `
        <section class="purchase-order-result-grid">
          <div class="purchase-order-result-card"><span>Objetivo</span><strong>${escapeHtml(formatSmartNumber(data.targetCount))} placa(s)</strong></div>
          <div class="purchase-order-result-card"><span>Produccion propuesta</span><strong>${escapeHtml(formatSmartNumber(plan.totalEquivalent))} placa(s)</strong></div>
          <div class="purchase-order-result-card"><span>Con margen</span><strong>${escapeHtml(formatSmartNumber(purchaseEquivalents))} placa(s)</strong></div>
        </section>
        <section class="purchase-order-result-card">
          <span>Como producir</span>
          <div class="purchase-order-list" style="margin-top:10px;">
            ${trayRows.length ? trayRows.map((row) => `
              <div class="purchase-order-list-row">
                <strong>${escapeHtml(row.tray.name)}</strong>
                <div>${escapeHtml(row.count)} vez/veces</div>
                <div>${escapeHtml(formatSmartNumber(row.count * row.tray.equivalent))} placa(s)</div>
              </div>
            `).join("") : `<div class="purchase-order-list-row"><div>Sin combinacion calculada</div><div></div><div></div></div>`}
          </div>
          <p class="secondary" style="margin:10px 0 0;">Sobrante estimado: ${escapeHtml(formatSmartNumber(Math.max(0, plan.totalEquivalent - data.targetCount)))} placa(s). Margen de compra aplicado: ${escapeHtml(formatSmartNumber(data.wastePercent))}%.</p>
        </section>
        <section class="purchase-order-result-card">
          <span>Lista de compras</span>
          <div class="purchase-order-list" style="margin-top:10px;">
            ${shoppingList.map((item) => `
              <div class="purchase-order-list-row">
                <strong>${escapeHtml(item.name)}</strong>
                <div>${escapeHtml(item.formatted)}</div>
                <div>${escapeHtml(formatSmartNumber(item.total))} ${escapeHtml(item.unit)}</div>
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }

    function findPurchaseOrderTrayPlan(trays, targetCount, mode = "balanced") {
      const active = trays.slice(0, 4);
      const minEquivalent = Math.max(0.01, Math.min(...active.map((tray) => tray.equivalent).filter(Boolean)));
      const maxCount = Math.min(30, Math.ceil(targetCount / minEquivalent) + 3);
      let best = null;
      const counts = Array(active.length).fill(0);

      function visit(index) {
        if (index === active.length) {
          const totalEquivalent = counts.reduce((sum, count, trayIndex) => sum + count * active[trayIndex].equivalent, 0);
          if (totalEquivalent < targetCount) return;
          const usedCounts = counts.filter((count) => count > 0);
          const missing = mode === "balanced" ? active.length - usedCounts.length : 0;
          const totalRuns = counts.reduce((sum, count) => sum + count, 0);
          const overshoot = totalEquivalent - targetCount;
          const spread = usedCounts.length
            ? Math.max(...usedCounts) - Math.min(...usedCounts)
            : totalRuns;
          const score = overshoot * 100 + totalRuns * (mode === "balanced" ? 0.35 : 1.4) + spread * (mode === "balanced" ? 0.15 : 0.02) + missing * 10000;
          if (!best || score < best.score) {
            best = { score, counts: [...counts], totalEquivalent };
          }
          return;
        }

        for (let count = 0; count <= maxCount; count += 1) {
          counts[index] = count;
          visit(index + 1);
        }
      }

      visit(0);
      const selected = best || { counts: [Math.ceil(targetCount / (active[0]?.equivalent || 1))], totalEquivalent: targetCount };
      return {
        totalEquivalent: selected.totalEquivalent,
        rows: active.map((tray, index) => ({ tray, count: selected.counts[index] || 0 })),
      };
    }

    function formatPurchaseOrderAmount(value, unit) {
      const amount = Number(value || 0);
      if (unit === "g") {
        return amount >= 1000 ? `${formatSmartNumber(amount / 1000)} kg` : `${Math.ceil(amount)} g`;
      }
      if (unit === "ml") {
        return amount >= 1000 ? `${formatSmartNumber(amount / 1000)} l` : `${Math.ceil(amount)} ml`;
      }
      if (unit === "unidad") {
        return `${Math.ceil(amount)} unidad(es)`;
      }
      return `${formatSmartNumber(amount)} ${unit}`;
    }

    function formatSmartNumber(value) {
      return Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
    }

    function buildPurchaseOrderAdvisorText(data, plan, shoppingList) {
      const lines = [
        `ORDEN RAPIDA - ${data.productionName.toUpperCase()}`,
        "",
        `Objetivo: ${formatSmartNumber(data.targetCount)} placa(s) base de ${formatSmartNumber(data.baseWidth)}x${formatSmartNumber(data.baseHeight)} cm`,
        `Produccion propuesta: ${formatSmartNumber(plan.totalEquivalent)} placa(s) equivalentes`,
        `Margen aplicado: ${formatSmartNumber(data.wastePercent)}%`,
        "",
        "BANDEJAS A HACER",
        ...plan.rows.filter((row) => row.count > 0).map((row) => `- ${row.tray.name}: ${row.count} vez/veces (${formatSmartNumber(row.count * row.tray.equivalent)} placa(s) equivalentes)`),
        "",
        "COMPRAS NECESARIAS",
        ...shoppingList.map((item) => `- ${item.name}: ${item.formatted}`),
      ];
      return lines.join("\n");
    }

    async function copyPurchaseOrderAdvisor() {
      calculatePurchaseOrderAdvisor();
      if (!purchaseOrderAdvisorLastText) {
        showNotice("Primero calcule la orden.", "error");
        return;
      }
      await navigator.clipboard.writeText(purchaseOrderAdvisorLastText);
      showNotice("Orden rapida copiada.", "success");
    }

    function downloadPurchaseOrderAdvisor() {
      calculatePurchaseOrderAdvisor();
      if (!purchaseOrderAdvisorLastText) {
        showNotice("Primero calcule la orden.", "error");
        return;
      }
      downloadTextFile(`orden-compra-rapida-${Date.now()}.txt`, purchaseOrderAdvisorLastText);
      showNotice("Orden rapida descargada.", "success");
    }

    async function importPurchasesFromSheets() {
      const response = await fetch("/api/import-purchases-from-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudieron importar las compras de Sheets.", "error");
        return;
      }

      await loadErp();
      const imported = result.result?.imported || 0;
      const skipped = result.result?.skipped || 0;
      const detail = skipped ? ` ${skipped} fila(s) incompleta(s) fueron omitidas.` : "";
      showNotice(`Compras importadas desde Sheets: ${imported}.${detail}`);
    }

    async function importAccountantPayments() {
      if (!confirm("Importar los pagos cargados por el contador y aplicarlos a las deudas pendientes?")) return;

      const response = await fetch("/api/import-accountant-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudieron importar los pagos del contador.", "error");
        return;
      }

      await loadErp();
      const imported = result.result?.imported || 0;
      const skipped = result.result?.skipped || 0;
      const firstError = result.result?.errors?.[0] ? ` Primer error: ${result.result.errors[0]}` : "";
      showNotice(`Pagos importados: ${imported}. Omitidos/con error: ${skipped}.${firstError}`, skipped ? "warning" : "success");
    }

    async function syncAccountantDebts() {
      const response = await fetch("/api/sync-accountant-debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo actualizar la planilla del contador.", "error");
        return;
      }

      const providers = result.result?.providers || 0;
      const purchases = result.result?.purchases || 0;
      showNotice(`Planilla del contador actualizada: ${providers} proveedor(es), ${purchases} compra(s) pendiente(s).`, "success");
    }

    async function loadLogisticsEvents() {
      if (!can("logistics:read")) return;
      const container = document.getElementById("logistics-event-list");
      if (container) container.innerHTML = `<div class="empty">Cargando eventos operativos...</div>`;

      try {
        const response = await fetch("/api/logistics-events");
        const result = await readJsonResponse(response);
        if (!result.ok) throw new Error(result.error || "No se pudieron cargar eventos de logistica.");
        logisticsEvents = result.events || [];
        renderLogisticsEvents();
      } catch (error) {
        if (container) container.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      }
    }

    function renderLogisticsEvents() {
      const container = document.getElementById("logistics-event-list");
      if (!container) return;
      container.classList.add("logistics-list");
      if (!logisticsEvents.length) {
        container.innerHTML = `<div class="empty">No hay eventos proximos o confirmados para logistica.</div>`;
        return;
      }

      container.innerHTML = logisticsEvents.map((event) => {
        const progress = event.progress || {};
        return `
          <article class="logistics-card" onclick="openLogisticsEvent('${escapeAttribute(event.id)}')">
            <div>
              <div class="logistics-title">${escapeHtml(event.name || "Evento sin nombre")}</div>
              <div class="logistics-meta">${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")} · ${escapeHtml(event.clientName || "Sin cliente")} · ${escapeHtml(event.venue || "Sin lugar")}</div>
              <div class="logistics-meta">${escapeHtml(event.guestCount || 0)} invitados · ${escapeHtml(event.serviceType || "Servicio sin definir")} · ${escapeHtml(event.statusLabel || "")}</div>
              <div class="progress-track" style="margin-top:10px;"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%;"></div></div>
            </div>
            <span class="progress-pill ${escapeAttribute(progress.status || "not_started")}">${escapeHtml(getLogisticsProgressLabel(progress.status))} · ${escapeHtml(progress.percent || 0)}%</span>
          </article>
        `;
      }).join("");
    }

    function getLogisticsProgressLabel(status) {
      return {
        not_started: "Sin iniciar",
        in_progress: "En proceso",
        complete: "Completo",
      }[status] || "Sin iniciar";
    }

    async function openLogisticsEvent(id) {
      if (!id) return;
      const response = await fetch(`/api/logistics-event?id=${encodeURIComponent(id)}`);
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo abrir la ficha logistica.", "error");
        return;
      }
      activeLogisticsEvent = result.event;
      logisticsCategories = result.categories || [];
      renderLogisticsEventDetail();
      document.getElementById("logistics-event-detail").classList.add("open");
    }

    function renderLogisticsEventDetail() {
      const event = activeLogisticsEvent;
      if (!event) return;
      const progress = event.progress || {};
      document.getElementById("logistics-detail-title").textContent = event.name || "Evento";
      document.getElementById("logistics-detail-subtitle").textContent =
        `${event.clientName || "Sin cliente"} · ${formatShortDate(event.eventDate) || "Sin fecha"} · ${event.guestCount || 0} invitados`;
      document.getElementById("logistics-detail-body").innerHTML = `
        <div id="logistics-modal-notice" class="notice" style="position:sticky;top:0;margin-bottom:10px;z-index:4;display:none;"></div>
        <div class="logistics-detail-grid">
          ${logisticsInfo("Estado operativo", event.statusLabel || "Sin estado")}
          ${logisticsInfo("Responsable", event.owner || "Sin responsable")}
          ${logisticsInfo("Cliente", event.clientName || "Sin cliente")}
          ${logisticsInfoHtml("Telefono cliente", buildPhoneHtml(event.clientPhone))}
          ${logisticsInfo("Fecha y horario", [formatShortDate(event.eventDate), event.eventTime, event.schedule].filter(Boolean).join(" · ") || "Sin definir")}
          ${logisticsInfoHtml("Lugar", buildVenueHtml(event))}
          ${logisticsInfo("Servicio", event.serviceType || "Sin servicio")}
          ${logisticsInfo("Invitados", event.guestCount || 0)}
          ${logisticsInfo("Proxima accion", event.nextAction || "Sin definir")}
          ${logisticsInfo("Avance", `${getLogisticsProgressLabel(progress.status)} · ${progress.completed || 0}/${progress.total || 0}`)}
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%;"></div></div>
        <section class="logistics-section">
          <h3>Menu y bebidas</h3>
          <div class="logistics-mini-list">
            ${renderLogisticsMenu(event)}
            ${renderLogisticsDrinks(event)}
            ${renderLogisticsTableware(event)}
          </div>
        </section>
        <section class="logistics-section">
          <h3>Notas operativas</h3>
          <div class="logistics-mini-list">
            <div class="row"><strong>Observaciones</strong><div class="secondary">${escapeHtml(event.notes || "Sin notas")}</div></div>
            <div class="row"><strong>Restricciones alimentarias</strong><div class="secondary">${escapeHtml(event.dietaryRestrictions || "Sin restricciones cargadas")}</div></div>
            <div class="row"><strong>Detalle operativo previo</strong><div class="secondary">${escapeHtml(event.checklistDetails || "Sin detalle")}</div></div>
          </div>
        </section>
        <section class="logistics-section">
          <h3>Aprendizajes operativos</h3>
          ${renderLogisticsLearnedSuggestions(event.learnedSuggestions || [])}
          <div class="form-field full">
            <label>Comentario post-evento</label>
            <textarea id="logistics-post-event-notes" placeholder="Que no se deberia olvidar en proximos eventos similares" onchange="saveLogisticsSheetNow()">${escapeHtml(event.operationalSheet?.postEventNotes || "")}</textarea>
          </div>
          <div class="toolbar-actions" style="justify-content:space-between;">
            <button class="filter" type="button" onclick="fillLogisticsNoNotes()">Sin comentarios</button>
            <button class="approve" type="button" onclick="closeLogisticsOperationalEvent()">Solicitar cierre</button>
          </div>
        </section>
        <section class="logistics-section">
          <div class="toolbar-actions" style="justify-content:space-between;">
            <h3>Sobrantes / almacenamiento</h3>
            <button class="filter" type="button" onclick="addLogisticsLeftover()">Agregar sobrante</button>
          </div>
          <div id="logistics-leftovers">${renderLogisticsLeftovers(event.operationalSheet?.leftovers || [])}</div>
        </section>
        <section class="logistics-section">
          <h3>Checklist operativo por rubro</h3>
          <div id="logistics-checklist">${renderLogisticsCategories(event)}</div>
        </section>
      `;
    }

    function logisticsInfo(label, value) {
      return `<div class="logistics-info"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Sin definir")}</strong></div>`;
    }

    function logisticsInfoHtml(label, html) {
      return `<div class="logistics-info"><span>${escapeHtml(label)}</span><strong>${html || "Sin definir"}</strong></div>`;
    }

    function buildVenueHtml(event) {
      const venue = event.venueDetail || {};
      const maps = venue.latitude && venue.longitude
        ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
        : (venue.address || venue.mapLabel || event.venue)
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.address || venue.mapLabel, event.venue].filter(Boolean).join(" "))}`
        : "";
      const lines = [
        event.venue,
        venue.address || venue.mapLabel,
        venue.reference ? `Ref: ${venue.reference}` : "",
      ].filter(Boolean).map(escapeHtml);
      return `${lines.join("<br>")}${maps ? `<br><a href="${escapeAttribute(maps)}" target="_blank" rel="noopener">Abrir en Google Maps</a>` : ""}`;
    }

    function buildPhoneHtml(phone) {
      const raw = String(phone || "").trim();
      if (!raw) return "Sin telefono";
      const digits = raw.replace(/\D+/g, "");
      if (!digits) return escapeHtml(raw);
      let whatsappDigits = digits;
      if (!whatsappDigits.startsWith("54")) {
        whatsappDigits = whatsappDigits.length >= 10 ? `549${whatsappDigits}` : `54${whatsappDigits}`;
      } else if (whatsappDigits.startsWith("54261")) {
        whatsappDigits = whatsappDigits.replace(/^54/, "549");
      }
      return `
        ${escapeHtml(raw)}
        <br><a href="tel:${escapeAttribute(digits)}">Llamar</a>
        <br><a href="https://wa.me/${escapeAttribute(whatsappDigits)}" target="_blank" rel="noopener">Enviar WhatsApp</a>
      `;
    }

    function renderLogisticsMenu(event) {
      const items = getLogisticsMenuItemsForDisplay(event);
      if (!items.length) {
        return `<div class="row"><strong>Menu</strong><div class="secondary">${escapeHtml(event.selectedMenu || "Sin menu cargado")}</div></div>`;
      }
      const grouped = items.reduce((groups, item) => {
        const key = item.category || "otro";
        groups[key] = groups[key] || [];
        groups[key].push(item);
        return groups;
      }, {});
      return `
        <div class="row">
          <strong>Menu</strong>
          <div class="logistics-menu-grid" style="margin-top:8px;">
            ${Object.entries(grouped).map(([category, categoryItems]) => `
              <div class="logistics-menu-group">
                <h4>
                  <span>${escapeHtml(getMenuCategoryLabel(category))}</span>
                  <small>${escapeHtml(categoryItems.length)} item(s)</small>
                </h4>
                ${categoryItems.map((item) => `
                  <div class="logistics-menu-item">
                    <strong>${escapeHtml([item.quantity, item.name].filter(Boolean).join(" · ") || "Item")}</strong>
                    ${item.suggestedQuantity ? `<div class="secondary">${escapeHtml(item.suggestedQuantity)}</div>` : ""}
                    ${item.detail ? `<div class="secondary">${escapeHtml(item.detail)}</div>` : ""}
                    ${item.subItems?.length ? `<div class="logistics-menu-subitems">${item.subItems.map((subItem) => `<span>${escapeHtml([subItem.quantity, subItem.name, subItem.detail].filter(Boolean).join(" · "))}</span>`).join("")}</div>` : ""}
                  </div>
                `).join("")}
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    function getMenuCategoryLabel(category) {
      return {
        finger_food: "Finger food",
        empanadas: "Empanadas",
        cazuelas: "Cazuelas",
        picada: "Picada",
        principal: "Principal",
        postre: "Postre",
        guarnicion: "Guarniciones",
        panificados: "Panificados",
        otro: "Otros",
      }[category] || category || "Otros";
    }

    function getLogisticsMenuItemsForDisplay(event) {
      const items = (event.menuItems || []).filter((item) => item.name || item.detail || item.quantity);
      if (items.length !== 1 || items[0].quantity || items[0].detail || String(items[0].name || "").length < 120) {
        return items;
      }
      return splitLongMenuText(items[0].name).map((name) => ({ name }));
    }

    function splitLongMenuText(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .split(/\s+(?=[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 2);
    }

    function renderLogisticsDrinks(event) {
      const drinks = [event.includesDrinks, event.drinkType].filter(Boolean).join(" · ");
      return `<div class="row"><strong>Bebidas</strong><div class="secondary">${escapeHtml(drinks || "Sin bebidas definidas")}</div></div>`;
    }

    function renderLogisticsTableware(event) {
      const parts = [
        ["Vajilla", event.tableware],
        ["Cantidades", event.tablewareQuantities],
        ["Detalle", event.tablewareDetail],
        ["Contenedores grandes", event.largeContainers],
        ["Contenedores chicos", event.smallContainers],
      ].filter(Boolean);
      const rows = parts
        .filter(([, value]) => value)
        .map(([label, value]) => `<div class="secondary"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
        .join("");
      return `<div class="row logistics-tableware-card"><strong>Vajilla y contenedores</strong>${rows || `<div class="secondary">Sin detalle</div>`}</div>`;
    }

    function renderLogisticsLearnedSuggestions(items = []) {
      if (!items.length) {
        return `<div class="empty">Sin aprendizajes previos para este tipo de servicio.</div>`;
      }
      return `
        <div class="logistics-mini-list">
          ${items.map((item) => `
            <div class="row">
              <strong>${escapeHtml(item.eventName || "Evento anterior")}</strong>
              <div class="secondary">${escapeHtml(formatShortDate(item.eventDate) || "")} · ${escapeHtml(item.serviceType || "")}</div>
              <div>${escapeHtml(item.note || "")}</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderLogisticsCategories(event) {
      const sheet = event.operationalSheet || { categories: {} };
      return logisticsCategories.map((category) => {
        const items = sheet.categories?.[category.id] || [];
        const categoryProgress = event.progress?.byCategory?.[category.id] || {};
        return `
          <section class="logistics-category" data-category-id="${escapeAttribute(category.id)}">
            <div class="logistics-category-head">
              <div>
                <strong>${escapeHtml(category.label)}</strong>
                <div class="secondary">${escapeHtml(categoryProgress.completed || 0)}/${escapeHtml(categoryProgress.total || 0)} completo(s)</div>
              </div>
              <button class="filter" type="button" onclick="addLogisticsChecklistItem('${escapeAttribute(category.id)}')">Agregar item</button>
            </div>
            <div class="logistics-category-items">
              ${items.length ? items.map((item) => renderLogisticsChecklistItem(item)).join("") : `<div class="empty">Sin items en este rubro.</div>`}
            </div>
          </section>
        `;
      }).join("");
    }

    function renderLogisticsChecklistItem(item = {}) {
      const hasExtra = item.owner || item.note;
      return `
        <div class="logistics-item-row" data-item-id="${escapeAttribute(item.id || "")}">
          <input class="logistics-item-checked" type="checkbox" ${item.checked ? "checked" : ""} onchange="saveLogisticsSheetNow()">
          <textarea class="logistics-item-text" placeholder="Observacion o item operativo" onchange="saveLogisticsSheetNow()">${escapeHtml(item.text || "")}</textarea>
          <input class="logistics-item-quantity" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}" onchange="saveLogisticsSheetNow()">
          <div class="logistics-item-actions">
            <button class="filter icon-action" type="button" onclick="toggleLogisticsItemMenu(this)">...</button>
            <div class="logistics-item-menu">
              <button type="button" onclick="showLogisticsItemExtra(this)">Agregar nota</button>
              <button type="button" onclick="removeLogisticsChecklistItem(this)">Eliminar</button>
            </div>
          </div>
          <div class="logistics-item-extra ${hasExtra ? "open" : ""}">
            <input class="logistics-item-owner" placeholder="Responsable" value="${escapeAttribute(item.owner || "")}" onchange="saveLogisticsSheetNow()">
            <textarea class="logistics-item-note" placeholder="Nota" onchange="saveLogisticsSheetNow()">${escapeHtml(item.note || "")}</textarea>
          </div>
        </div>
      `;
    }

    function renderLogisticsLeftovers(items = []) {
      if (!items.length) return `<div class="empty">Sin sobrantes cargados.</div>`;
      return items.map((item) => renderLogisticsLeftoverRow(item)).join("");
    }

    function toggleLogisticsItemMenu(button) {
      const menu = button.closest(".logistics-item-actions")?.querySelector(".logistics-item-menu");
      document.querySelectorAll(".logistics-item-menu.open").forEach((item) => {
        if (item !== menu) item.classList.remove("open");
      });
      menu?.classList.toggle("open");
    }

    function showLogisticsItemExtra(button) {
      const row = button.closest(".logistics-item-row");
      row?.querySelector(".logistics-item-extra")?.classList.add("open");
      row?.querySelector(".logistics-item-menu")?.classList.remove("open");
    }

    function renderLogisticsLeftoverRow(item = {}) {
      return `
        <div class="logistics-leftover-row" data-leftover-id="${escapeAttribute(item.id || "")}">
          <input class="leftover-food" placeholder="Comida sobrante" value="${escapeAttribute(item.food || "")}" onchange="saveLogisticsSheetNow()">
          <input class="leftover-quantity" placeholder="Cantidad" value="${escapeAttribute(item.quantity || "")}" onchange="saveLogisticsSheetNow()">
          <select class="leftover-destination" onchange="saveLogisticsSheetNow()">
            ${["", "Freezer", "Heladera", "Deposito", "Descartar", "Otro"].map((value) => `<option value="${escapeAttribute(value)}" ${value === (item.destination || "") ? "selected" : ""}>${escapeHtml(value || "Destino")}</option>`).join("")}
          </select>
          <input class="leftover-storage" placeholder="Freezer/heladera" value="${escapeAttribute(item.storage || "")}" onchange="saveLogisticsSheetNow()">
          <input class="leftover-notes" placeholder="Notas" value="${escapeAttribute(item.notes || "")}" onchange="saveLogisticsSheetNow()">
          <button class="reject icon-action" type="button" onclick="removeLogisticsLeftover(this)">x</button>
        </div>
      `;
    }

    function addLogisticsChecklistItem(categoryId) {
      const section = document.querySelector(`.logistics-category[data-category-id="${CSS.escape(categoryId)}"] .logistics-category-items`);
      if (!section) return;
      if (section.querySelector(".empty")) section.innerHTML = "";
      section.insertAdjacentHTML("beforeend", renderLogisticsChecklistItem({ id: `item-${Date.now()}` }));
      section.lastElementChild?.querySelector(".logistics-item-text")?.focus();
    }

    function removeLogisticsChecklistItem(button) {
      button.closest(".logistics-item-row")?.remove();
      saveLogisticsSheetNow();
    }

    function addLogisticsLeftover() {
      const container = document.getElementById("logistics-leftovers");
      if (!container) return;
      if (container.querySelector(".empty")) container.innerHTML = "";
      container.insertAdjacentHTML("beforeend", renderLogisticsLeftoverRow({ id: `sobrante-${Date.now()}` }));
    }

    function removeLogisticsLeftover(button) {
      button.closest(".logistics-leftover-row")?.remove();
      saveLogisticsSheetNow();
    }

    function collectLogisticsOperationalSheet() {
      const categories = {};
      for (const category of logisticsCategories) {
        categories[category.id] = Array.from(document.querySelectorAll(`.logistics-category[data-category-id="${CSS.escape(category.id)}"] .logistics-item-row`))
          .map((row) => ({
            id: row.dataset.itemId || `item-${Date.now()}`,
            text: row.querySelector(".logistics-item-text")?.value.trim() || "",
            quantity: row.querySelector(".logistics-item-quantity")?.value.trim() || "",
            checked: row.querySelector(".logistics-item-checked")?.checked || false,
            owner: row.querySelector(".logistics-item-owner")?.value.trim() || "",
            note: row.querySelector(".logistics-item-note")?.value.trim() || "",
            updatedAt: new Date().toISOString(),
          }))
          .filter((item) => item.text);
      }
      const leftovers = Array.from(document.querySelectorAll("#logistics-leftovers .logistics-leftover-row"))
        .map((row) => ({
          id: row.dataset.leftoverId || `sobrante-${Date.now()}`,
          food: row.querySelector(".leftover-food")?.value.trim() || "",
          quantity: row.querySelector(".leftover-quantity")?.value.trim() || "",
          destination: row.querySelector(".leftover-destination")?.value || "",
          storage: row.querySelector(".leftover-storage")?.value.trim() || "",
          notes: row.querySelector(".leftover-notes")?.value.trim() || "",
          updatedAt: new Date().toISOString(),
        }))
        .filter((item) => item.food);
      const postEventNotes = document.getElementById("logistics-post-event-notes")?.value.trim() || "";
      return { categories, leftovers, postEventNotes, updatedAt: new Date().toISOString() };
    }

    function saveLogisticsSheetNow() {
      clearTimeout(logisticsSaveTimer);
      logisticsSaveTimer = setTimeout(saveLogisticsSheet, 250);
    }

    function fillLogisticsNoNotes() {
      const field = document.getElementById("logistics-post-event-notes");
      if (!field) return;
      field.value = "Sin comentarios";
      saveLogisticsSheetNow();
    }

    function showLogisticsModalNotice(message, type = "error") {
      const box = document.getElementById("logistics-modal-notice");
      if (!box) {
        showNotice(message, type);
        return;
      }
      box.textContent = message;
      box.className = `notice open ${type === "error" ? "error" : ""}`;
      box.style.display = "block";
      box.onclick = () => {
        box.className = "notice";
        box.style.display = "none";
      };
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function scrollLogisticsCategory(categoryId) {
      const section = document.querySelector(`.logistics-category[data-category-id="${CSS.escape(categoryId)}"]`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function saveLogisticsSheet() {
      if (!activeLogisticsEvent?.id) return;
      const operationalSheet = collectLogisticsOperationalSheet();
      const response = await fetch("/api/logistics-event-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeLogisticsEvent.id, operationalSheet }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar la ficha logistica.", "error");
        return;
      }
      activeLogisticsEvent = result.event;
      logisticsCategories = result.categories || logisticsCategories;
      const index = logisticsEvents.findIndex((item) => item.id === activeLogisticsEvent.id);
      if (index >= 0) logisticsEvents[index] = { ...logisticsEvents[index], progress: activeLogisticsEvent.progress };
      renderLogisticsEvents();
      renderLogisticsEventDetail();
    }

    function showLogisticsMissingConformityPrompt() {
      const box = document.getElementById("logistics-modal-notice");
      if (!box) {
        if (confirm("Este evento no tiene conformidad adjunta. Desea finalizarlo sin adjuntar conformidad y enviarlo a autorizacion de administracion?")) {
          closeLogisticsOperationalEvent(true);
        }
        return;
      }
      box.innerHTML = `
        <strong>Este evento no tiene conformidad adjunta.</strong>
        <div style="margin-top:4px;">Desea finalizar el evento sin adjuntar conformidad?</div>
        <div class="actions" style="margin-top:8px;">
          <button class="approve" type="button" onclick="closeLogisticsOperationalEvent(true)">Enviar a Autorizar</button>
          <button class="filter" type="button" onclick="this.closest('.notice').style.display='none'">Cancelar</button>
        </div>
      `;
      box.className = "notice open error";
      box.style.display = "block";
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function closeLogisticsOperationalEvent(requestWithoutConformity = false) {
      if (!activeLogisticsEvent?.id) return;
      clearTimeout(logisticsSaveTimer);
      const operationalSheet = collectLogisticsOperationalSheet();
      if (!operationalSheet.postEventNotes) {
        showLogisticsModalNotice("Antes de cerrar, cargue un comentario post-evento. Puede escribir 'Sin comentarios'.", "error");
        document.getElementById("logistics-post-event-notes")?.focus();
        return;
      }
      const pendingTeardown = (operationalSheet.categories?.desmontaje || []).filter((item) => !item.checked);
      if (pendingTeardown.length) {
        showLogisticsModalNotice("Para cerrar, complete primero Desmontaje y descarga en deposito.", "error");
        scrollLogisticsCategory("desmontaje");
        return;
      }
      if (!activeLogisticsEvent.hasClientConformity && !requestWithoutConformity) {
        showLogisticsMissingConformityPrompt();
        return;
      }

      const response = await fetch("/api/logistics-event-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeLogisticsEvent.id, operationalSheet, requestWithoutConformity }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showLogisticsModalNotice(result.error || "No se pudo cerrar el evento.", "error");
        if (String(result.error || "").toLowerCase().includes("desmontaje")) scrollLogisticsCategory("desmontaje");
        return;
      }

      showNotice(requestWithoutConformity
        ? "Cierre sin conformidad enviado a autorizacion de administracion."
        : "Cierre solicitado. Administracion debe autorizarlo para pasarlo a realizado.", "success");
      hideLogisticsEventDetail();
      activeLogisticsEvent = null;
      await loadLogisticsEvents();
      await loadErp();
    }

    function hideLogisticsEventDetail() {
      document.getElementById("logistics-event-detail").classList.remove("open");
    }

    function closeLogisticsEventDetail(event) {
      if (event.target.id === "logistics-event-detail") {
        hideLogisticsEventDetail();
      }
    }

    function renderPipeline() {
      const container = document.getElementById("pipeline-board");
      if (!container) return;
      const role = document.getElementById("role-filter")?.value || "";
      const columns = erpData.pipeline?.columns || [];

      container.innerHTML = columns.map((column) => {
        const items = (column.items || [])
          .filter((item) => !role || normalizeSearch(item.owner).includes(normalizeSearch(role)) || normalizeSearch(item.role).includes(normalizeSearch(role)))
          .slice(0, 4);
        return `
          <section class="pipeline-column commercial-status-card">
            <div class="pipeline-title"><span>${escapeHtml(column.label)}</span><strong>${(column.items || []).length}</strong></div>
            ${items.length ? items.map((item) => `
              <button class="summary-row" type="button" ${item.source === "event" ? `onclick="showEventOverview('${escapeAttribute(item.id)}')"` : ""}>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.subtitle || "Sin cliente")} · ${item.date ? escapeHtml(formatShortDate(item.date)) : "Sin fecha"} ${item.amount ? `· ${formatCurrency(item.amount)}` : ""}</span>
              </button>
            `).join("") : `<div class="empty compact-empty">Sin items</div>`}
          </section>
        `;
      }).join("");
    }

    function renderVenueList() {
      const container = document.getElementById("venue-list");
      if (!container) return;
      const term = normalizeSearch(document.getElementById("venue-search")?.value || "");
      const venues = (erpData.venues || []).filter((venue) => {
        const searchable = [venue.name, venue.address, venue.phone, venue.contactName, venue.reference, venue.notes].join(" ");
        return !term || normalizeSearch(searchable).includes(term);
      });

      if (!venues.length) {
        container.innerHTML = `<div class="empty">Todavia no hay lugares guardados.</div>`;
        return;
      }

      container.innerHTML = venues.map((venue) => `
        <article class="venue-card" onclick="showVenueForm('${escapeAttribute(venue.id)}')">
          <div class="venue-title">${escapeHtml(venue.name || "Lugar sin nombre")}</div>
          <div class="venue-meta">${escapeHtml(venue.address || venue.mapLabel || "Direccion pendiente")}</div>
          <div class="venue-meta">${escapeHtml([venue.phone, venue.contactName].filter(Boolean).join(" · ") || "Contacto pendiente")}</div>
        </article>
      `).join("");
    }

    function renderCommercialCustomers() {
      const container = document.getElementById("commercial-customer-list");
      if (!container) return;
      const customers = (erpData.customers || []).slice(0, 12);
      if (!customers.length) {
        container.innerHTML = `<div class="empty">Todavia no hay clientes cargados.</div>`;
        return;
      }
      container.innerHTML = customers.map((customer) => `
        <article class="compact-item customer-history-card">
          <div class="primary">${escapeHtml(customer.fullName || customer.contactName || "Cliente sin nombre")}</div>
          <div class="secondary">${escapeHtml(customer.displayPhone || "Sin telefono")} · ${escapeHtml(customer.eventsCount || 0)} evento(s) · ${escapeHtml(formatPercent(customer.closeRate || 0))} cierre</div>
          <div class="secondary">${escapeHtml([customer.preferences, customer.dietaryRestrictions].filter(Boolean).join(" · ") || "Sin preferencias registradas")}</div>
        </article>
      `).join("");
    }

    function showVenueForm(id = "", options = {}) {
      const venue = (erpData.venues || []).find((item) => item.id === id) || { name: options.name || "" };
      document.getElementById("detail-title").textContent = venue.id ? "Ficha de lugar" : "Nuevo lugar";
      document.getElementById("detail-subtitle").textContent = "Busque en el mapa o complete los datos manualmente.";
      document.getElementById("detail-fields").innerHTML = `
        <form id="venue-form" class="form-grid quick-form" onsubmit="saveVenueForm(event)">
          <input type="hidden" name="id" value="${escapeAttribute(venue.id || "")}">
          <input type="hidden" name="latitude" value="${escapeAttribute(venue.latitude ?? "")}">
          <input type="hidden" name="longitude" value="${escapeAttribute(venue.longitude ?? "")}">
          <input type="hidden" name="mapLabel" value="${escapeAttribute(venue.mapLabel || "")}">
          <input type="hidden" name="mapProvider" value="${escapeAttribute(venue.mapProvider || "")}">
          <input type="hidden" name="mapPlaceId" value="${escapeAttribute(venue.mapPlaceId || "")}">
          <div class="form-field full">
            <label>Buscar en mapa</label>
            <div class="inline-action-field">
              <input id="venue-map-search" placeholder="Buscar por nombre o direccion" value="${escapeAttribute(venue.mapLabel || venue.address || venue.name || "")}">
              <button class="filter" type="button" onclick="searchVenueMap()">Buscar</button>
            </div>
          </div>
          <div id="venue-map-results" class="form-field full"></div>
          <div class="form-field full">
            <div id="venue-map" class="venue-map"></div>
          </div>
          <div class="form-field">
            <label>Nombre del lugar</label>
            <input name="name" required value="${escapeAttribute(venue.name || "")}">
          </div>
          <div class="form-field">
            <label>Telefono</label>
            <input name="phone" value="${escapeAttribute(venue.phone || "")}">
          </div>
          <div class="form-field full">
            <label>Direccion</label>
            <input name="address" value="${escapeAttribute(venue.address || "")}">
          </div>
          <div class="form-field">
            <label>Contacto</label>
            <input name="contactName" value="${escapeAttribute(venue.contactName || "")}">
          </div>
          <div class="form-field">
            <label>Email</label>
            <input name="email" type="email" value="${escapeAttribute(venue.email || "")}">
          </div>
          <div class="form-field full">
            <label>Referencias</label>
            <input name="reference" placeholder="Ingreso, estacionamiento, salon, seguridad" value="${escapeAttribute(venue.reference || "")}">
          </div>
          <div class="form-field full">
            <label>Notas</label>
            <textarea name="notes">${escapeHtml(venue.notes || "")}</textarea>
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Guardar lugar</button>
            ${venue.id ? `<button class="reject" type="button" onclick="deleteVenue('${escapeAttribute(venue.id)}')">Eliminar</button>` : ""}
          </div>
        </form>
      `;
      document.getElementById("detail").classList.add("open");
      setTimeout(() => initVenueMap(venue), 80);
    }

    function initVenueMap(venue = {}) {
      const lat = Number(venue.latitude ?? -32.8895);
      const lng = Number(venue.longitude ?? -68.8458);

      if (!window.L) {
        renderVenueMapFallback(lat, lng);
        setVenueMapPosition(lat, lng);
        return;
      }

      const zoom = venue.latitude && venue.longitude ? 15 : 12;

      if (venueMap) {
        venueMap.remove();
        venueMap = null;
        venueMarker = null;
      }

      venueMap = L.map("venue-map").setView([lat, lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(venueMap);

      venueMarker = L.marker([lat, lng], { draggable: true }).addTo(venueMap);
      venueMarker.on("dragend", () => {
        const position = venueMarker.getLatLng();
        setVenueMapPosition(position.lat, position.lng);
      });
      venueMap.on("click", (event) => {
        venueMarker.setLatLng(event.latlng);
        setVenueMapPosition(event.latlng.lat, event.latlng.lng);
      });

      setVenueMapPosition(lat, lng);
      setTimeout(() => venueMap.invalidateSize(), 150);
    }

    function renderVenueMapFallback(latitude, longitude) {
      const tile = getOpenStreetMapTile(latitude, longitude, 15);
      const tileUrl = tile ? `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png` : "";
      document.getElementById("venue-map").innerHTML = `
        <div class="map-fallback" style="${tileUrl ? `background-image:url('${tileUrl}')` : ""}">
          <div class="map-pin" aria-hidden="true"></div>
          <div class="map-fallback-panel">
            <strong>Ubicacion seleccionada</strong>
            <div class="secondary">Lat ${Number(latitude).toFixed(6)} · Lng ${Number(longitude).toFixed(6)}</div>
            <div class="actions" style="justify-content:center;margin-top:8px;">
              <a class="filter" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}" target="_blank" rel="noopener">Google Maps</a>
              <a class="filter" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}" target="_blank" rel="noopener">OpenStreetMap</a>
            </div>
          </div>
        </div>
      `;
    }

    function getOpenStreetMapTile(latitude, longitude, zoom) {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const z = Number(zoom || 15);
      const scale = 2 ** z;
      const x = Math.floor(((lon + 180) / 360) * scale);
      const latRad = lat * Math.PI / 180;
      const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale);
      return { x, y, z };
    }

    function setVenueMapPosition(latitude, longitude) {
      const form = document.getElementById("venue-form");
      if (!form) return;
      form.elements.latitude.value = Number(latitude).toFixed(6);
      form.elements.longitude.value = Number(longitude).toFixed(6);
    }

    async function searchVenueMap() {
      const query = document.getElementById("venue-map-search").value.trim();
      const resultsContainer = document.getElementById("venue-map-results");
      if (!query) {
        resultsContainer.innerHTML = `<div class="empty">Ingrese un lugar o direccion para buscar.</div>`;
        return;
      }

      resultsContainer.innerHTML = `<div class="empty">Buscando...</div>`;
      try {
        const response = await fetch(`/api/map-search?q=${encodeURIComponent(query)}`);
        const result = await readJsonResponse(response);
        if (!result.ok) throw new Error(result.error || "No se pudo consultar el mapa.");
        const results = result.results || [];
        if (!results.length) {
          resultsContainer.innerHTML = `<div class="empty">Sin resultados. Puede completar los datos manualmente.</div>`;
          return;
        }

        resultsContainer.innerHTML = `
          <div class="map-results">
            ${results.map((item, index) => `
              <button class="map-result" type="button" onclick="selectVenueMapResult(${index})">
                <strong>${escapeHtml(item.name || item.display_name?.split(",")[0] || "Resultado")}</strong>
                <div class="secondary">${escapeHtml(item.display_name || "")}</div>
              </button>
            `).join("")}
          </div>
        `;
        resultsContainer.dataset.results = JSON.stringify(results);
      } catch (error) {
        resultsContainer.innerHTML = `<div class="empty">No se pudo consultar el mapa ahora. Complete la direccion manualmente o pruebe de nuevo.</div>`;
      }
    }

    function selectVenueMapResult(index) {
      const container = document.getElementById("venue-map-results");
      const results = JSON.parse(container.dataset.results || "[]");
      const item = results[index];
      if (!item) return;

      const form = document.getElementById("venue-form");
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      const displayName = item.display_name || "";
      const name = item.name || displayName.split(",")[0] || form.elements.name.value;

      form.elements.name.value = form.elements.name.value || name;
      form.elements.address.value = displayName;
      form.elements.mapLabel.value = displayName;
      form.elements.mapProvider.value = "OpenStreetMap";
      form.elements.mapPlaceId.value = item.place_id || "";
      setVenueMapPosition(lat, lng);
      container.innerHTML = `
        <div class="map-results" style="max-height:none;">
          <div class="map-result">
            <strong>Seleccionado: ${escapeHtml(name)}</strong>
            <div class="secondary">${escapeHtml(displayName)}</div>
          </div>
        </div>
      `;

      if (venueMap && venueMarker) {
        venueMap.setView([lat, lng], 16);
        venueMarker.setLatLng([lat, lng]);
      } else {
        renderVenueMapFallback(lat, lng);
      }
    }

    async function saveVenueForm(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());

      const response = await fetch("/api/venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el lugar.", "error");
        return;
      }

      erpData.venues = result.venues || erpData.venues || [];
      renderVenueList();
      renderErpVenueOptions();
      const eventForm = document.getElementById("erp-event-form");
      if (eventForm && payload.name) eventForm.elements.venue.value = result.venue.name || payload.name;
      hideDetail();
      showNotice("Lugar guardado.");
    }

    async function deleteVenue(id) {
      if (!confirm("Desea eliminar este lugar?")) return;
      const response = await fetch("/api/delete-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el lugar.", "error");
        return;
      }

      erpData.venues = result.venues || erpData.venues || [];
      renderVenueList();
      renderErpVenueOptions();
      hideDetail();
      showNotice("Lugar eliminado.");
    }

    function renderConfirmedEvents() {
      const container = document.getElementById("confirmed-event-list");
      const events = erpData.confirmedEvents || [];

      if (!events.length) {
        container.innerHTML = `<div class="empty">No hay eventos confirmados, en proceso o realizados.</div>`;
        return;
      }

      container.innerHTML = events.map((event) => `
        <article class="erp-card">
          <div class="erp-card-head">
            <div>
              <div class="erp-card-title">${escapeHtml(event.name)}</div>
              <div class="erp-card-meta">${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")} | ${escapeHtml(event.clientName || "Sin cliente")} | Compras impagas: ${escapeHtml(event.unpaidPurchases || 0)}</div>
            </div>
            <span class="erp-status">${escapeHtml(getErpEventStatusLabel(event.status))}</span>
          </div>
          <div class="recipe-summary" style="margin-top:10px;">
            <div><span>Venta</span><strong>${formatCurrency(event.quoteTotal || 0)}</strong></div>
            <div><span>Compras imputadas</span><strong>${formatCurrency(event.purchaseTotal || 0)}</strong></div>
            <div><span>Margen real</span><strong>${formatCurrency(event.operationalMargin || 0)} (${formatPercent(event.operationalMarginPercent || 0)})</strong></div>
          </div>
          <div class="checklist" style="margin-top:10px;">
            ${renderChecklistBadge("Compras", event.checklist?.purchases)}
            ${renderChecklistBadge("Produccion", event.checklist?.production)}
            ${renderChecklistBadge("Personal", event.checklist?.staff)}
            ${renderChecklistBadge("Logistica", event.checklist?.logistics)}
            ${renderChecklistBadge("Menu", event.checklist?.menu)}
            ${renderChecklistBadge("Pagos", event.checklist?.payments)}
          </div>
          <div class="actions" style="margin-top:10px;">
            <button class="filter" onclick="editErpEvent('${escapeAttribute(event.id)}')">Actualizar checklist</button>
            <button class="approve" onclick="markErpEventDone('${escapeAttribute(event.id)}')">Marcar realizado</button>
          </div>
        </article>
      `).join("");
    }

    function renderChecklistBadge(label, done) {
      return `<div class="check-item"><span class="badge ${done ? "confirmed" : "missing_info"}">${done ? "OK" : "Pendiente"}</span>${escapeHtml(label)}</div>`;
    }

    function renderProductAlerts() {
      const container = document.getElementById("product-alert-list");
      if (!container) return;
      const alerts = getSortedProductAlerts();

      if (!alerts.length) {
        container.innerHTML = `<div class="empty">No hay variaciones de precio registradas.</div>`;
        return;
      }

      const increases = alerts.filter((item) => Number(item.changePercent || 0) > 0);
      const decreases = alerts.filter((item) => Number(item.changePercent || 0) < 0);
      const affectedRecipes = new Set(alerts.flatMap((item) => item.affectedRecipes || []));
      const topAlerts = alerts.slice(0, 3);

      container.innerHTML = `
        <article class="erp-card">
          <div class="compact-insight">
            <div class="event-number"><span>Insumos</span><strong>${alerts.length}</strong></div>
            <div class="event-number warn"><span>Subas</span><strong>${increases.length}</strong></div>
            <div class="event-number highlight"><span>Recetas afectadas</span><strong>${affectedRecipes.size}</strong></div>
          </div>
          ${topAlerts.map((item) => `
            <div class="alert-row" style="border:1px solid var(--line);border-radius:8px;margin-top:8px;">
              <div>
                <strong>${escapeHtml(item.name || "Insumo sin nombre")}</strong>
                <div class="secondary">${escapeHtml(item.provider || "Sin proveedor")} | ${escapeHtml((item.affectedRecipes || []).slice(0, 2).join(", ") || "Sin recetas afectadas")}</div>
              </div>
              <strong>${formatPercent(item.changePercent || 0)}</strong>
              <span>${formatCurrency(item.unitCost || 0)}</span>
            </div>
          `).join("")}
          <div class="actions" style="margin-top:12px;">
            <button class="filter" onclick="showProductAlertsDetail()">Ver detalle</button>
          </div>
        </article>
      `;
    }

    function showProductAlertsDetail() {
      document.getElementById("alert-detail-title").textContent = "Insumos con variacion";
      document.getElementById("alert-detail-subtitle").textContent = `${getSortedProductAlerts().length} insumo(s) con cambios fuertes de precio.`;
      document.getElementById("alert-detail-body").innerHTML = `
        ${field("Lectura rapida", "La lista esta ordenada por mayor impacto porcentual. Use el buscador para encontrar un insumo, proveedor o receta puntual.")}
        <input id="product-alert-search" class="search" placeholder="Buscar insumo, proveedor o receta" oninput="renderProductAlertDetailRows()">
        <div id="product-alert-detail-list">${renderProductAlertRows(getSortedProductAlerts())}</div>
      `;
      document.getElementById("alert-detail").classList.add("open");
    }

    function renderGlobalSearch() {
      const term = normalizeSearch(document.getElementById("global-search").value || "");
      const container = document.getElementById("global-results");

      if (!term) {
        container.innerHTML = "";
        return;
      }

      const results = [
        ...(erpData.events || []).map((item) => ({ type: "Evento", title: item.name, detail: `${item.clientName || ""} ${item.serviceType || ""}` })),
        ...(erpData.quotes || []).map((item) => ({ type: "Presupuesto", title: item.eventName, detail: `${formatCurrency(item.priceTotal)} ${item.status}` })),
        ...(erpData.customers || []).map((item) => ({ type: "Cliente", title: item.fullName || item.contactName, detail: `${item.displayPhone || ""} Cierre ${formatPercent(item.closeRate || 0)}` })),
        ...(erpData.purchases || []).map((item) => ({ type: "Compra", title: item.provider, detail: `${item.description || ""} ${item.eventName || ""}` })),
        ...(allRecipes || []).map((item) => ({ type: "Receta", title: item.name, detail: `${item.category || ""} ${formatCurrency(item.costPerPortion)}` })),
      ].filter((item) => normalizeSearch(`${item.type} ${item.title} ${item.detail}`).includes(term)).slice(0, 10);

      container.innerHTML = results.length
        ? results.map((item) => `<div class="erp-card"><div class="primary">${escapeHtml(item.type)} | ${escapeHtml(item.title || "")}</div><div class="secondary">${escapeHtml(item.detail || "")}</div></div>`).join("")
        : `<div class="empty">Sin resultados.</div>`;
    }

    function renderErpEvents() {
      const container = document.getElementById("erp-event-list");
      if (!container) return;
      const events = erpData.events || [];
      const activeEvents = events
        .filter((event) => !["done", "lost", "cancelled"].includes(event.status))
        .sort(compareEventsByDate);
      const completedEvents = events
        .filter((event) => event.status === "done")
        .sort(compareEventsByDate);
      const urgentEvents = activeEvents.filter((event) => isEventWithinHours(event, 48));

      if (!events.length) {
        container.innerHTML = `<div class="empty">Todavia no hay eventos cargados.</div>`;
        return;
      }

      const urgentHtml = urgentEvents.length
        ? `<div class="event-section-head">
            <div></div>
            <div class="event-urgent-alert">${urgentEvents.length} evento(s) dentro de 48 hs</div>
          </div>`
        : "";

      const activeHtml = activeEvents.length
        ? activeEvents.map(renderEventControlCard).join("")
        : `<div class="empty">No hay eventos activos. Los realizados quedan en el historial.</div>`;

      const historyHtml = `
        <details class="event-history" ${completedEvents.length ? "" : "open"}>
          <summary>Historial realizados (${completedEvents.length})</summary>
          ${completedEvents.length
            ? completedEvents.map(renderEventHistoryRow).join("")
            : `<div class="empty">Todavia no hay eventos realizados.</div>`}
        </details>
      `;

      container.innerHTML = urgentHtml + activeHtml + historyHtml;
    }

    function compareEventsByDate(a, b) {
      const dateA = normalizePurchaseDate(a.eventDate) || "9999-12-31";
      const dateB = normalizePurchaseDate(b.eventDate) || "9999-12-31";
      return dateA.localeCompare(dateB) || String(a.name || "").localeCompare(String(b.name || ""));
    }

    function isEventWithinHours(event, hours) {
      const date = normalizePurchaseDate(event.eventDate);
      if (!date) return false;
      const eventTime = new Date(`${date}T23:59:59`);
      const now = new Date();
      const diff = eventTime.getTime() - now.getTime();
      return diff >= 0 && diff <= hours * 60 * 60 * 1000;
    }

    function renderEventControlCard(event) {
      return `
        <article class="erp-card event-control-card" onclick="showEventOverview('${escapeAttribute(event.id)}')">
          <div class="erp-card-head">
            <div>
              <div class="erp-card-title">${escapeHtml(event.name)}</div>
              <div class="erp-card-meta">${escapeHtml(event.clientName || "Sin cliente")} | ${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")} | ${escapeHtml(event.guestCount || 0)} invitados ${event.owner ? `| ${escapeHtml(event.owner)}` : ""}</div>
            </div>
            <div style="display:grid;gap:6px;justify-items:end;">
              <span class="erp-status">${escapeHtml(getErpEventStatusLabel(event.status))}</span>
              ${event.logisticsStatus === "pending_admin_close" ? `<span class="badge missing_info">Cierre logistico pendiente</span>` : ""}
            </div>
          </div>
          <div class="event-finance">
            <div class="event-number highlight"><span>Venta</span><strong>${formatCurrency(event.quoteTotal || 0)}</strong></div>
            <div class="event-number"><span>Modalidad</span><strong>${escapeHtml(getEventPriceLabel(event))}</strong></div>
            <div class="event-number"><span>Costo presupuesto</span><strong>${formatCurrency(event.quoteCostTotal || 0)}</strong></div>
            <div class="event-number"><span>Compras reales</span><strong>${formatCurrency(event.purchaseTotal || 0)}</strong></div>
            <div class="event-number"><span>Stock usado</span><strong>${formatCurrency(event.stockCostTotal || 0)}</strong></div>
            <div class="event-number warn"><span>Costo final</span><strong>${formatCurrency(event.finalCostTotal || 0)}</strong></div>
            <div class="event-number highlight"><span>Margen final</span><strong>${formatCurrency(event.operationalMargin || 0)} (${formatPercent(event.operationalMarginPercent || 0)})</strong></div>
          </div>
          ${renderEventPurchases(event)}
          <div class="event-checks">
            ${renderEventCheck("Compras", event.checklist?.purchases)}
            ${renderEventCheck("Produccion", event.checklist?.production)}
            ${renderEventCheck("Personal", event.checklist?.staff)}
            ${renderEventCheck("Logistica", event.checklist?.logistics)}
            ${renderEventCheck("Menu", event.checklist?.menu)}
            ${renderEventCheck("Pagos", event.checklist?.payments)}
          </div>
          <div class="actions" style="margin-top:10px;" onclick="event.stopPropagation()">
            <button class="approve" onclick="showEventOverview('${escapeAttribute(event.id)}')">Ver ficha</button>
            <button class="filter" onclick="startErpQuoteForEvent('${escapeAttribute(event.id)}')">Presupuestar</button>
            ${renderEventCloseAction(event)}
            <button class="menu-dot" type="button" onclick="showEventActions('${escapeAttribute(event.id)}')">...</button>
          </div>
        </article>
      `;
    }

    function showEventActions(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;

      document.getElementById("detail-title").textContent = event.name || "Evento";
      document.getElementById("detail-subtitle").textContent = `${event.clientName || "Sin cliente"} · ${formatShortDate(event.eventDate) || "Sin fecha"} · ${getErpEventStatusLabel(event.status)}`;
      document.getElementById("detail-fields").innerHTML = `
        ${field("Estado", getErpEventStatusLabel(event.status))}
        ${field("Conformidad", stripHtml(renderEventConformityBadge(event)))}
        ${field("Venta / margen", `${formatCurrency(event.quoteTotal || 0)} · ${formatPercent(event.operationalMarginPercent || 0)}`)}
        <div class="actions">
          <button class="approve" onclick="showEventOverview('${escapeAttribute(event.id)}')">Abrir ficha completa</button>
          <button class="filter" onclick="editErpEvent('${escapeAttribute(event.id)}'); hideDetail();">Editar evento</button>
          <button class="filter" onclick="startErpQuoteForEvent('${escapeAttribute(event.id)}'); hideDetail();">Presupuestar</button>
          ${event.clientConformity?.fileName ? `<button class="filter" onclick="downloadEventConformity('${escapeAttribute(event.id)}')">Descargar conformidad</button>` : ""}
          ${renderEventCloseAction(event, true)}
          <button class="reject" onclick="deleteErpEvent('${escapeAttribute(event.id)}'); hideDetail();">Eliminar</button>
        </div>
      `;
      document.querySelector("#detail .detail-panel")?.classList.remove("event-wide");
      document.getElementById("detail").classList.add("open");
    }

    function renderEventCloseAction(event, closeDetailAfter = false) {
      if (["done", "lost", "cancelled"].includes(event.status)) return "";
      const id = escapeAttribute(event.id);
      const after = closeDetailAfter ? "; hideDetail();" : "";
      if (event.logisticsStatus === "pending_admin_close") {
        return `<button class="approve" onclick="approveLogisticsEventClose('${id}')${after}">${hasCloseWithoutConformityRequest(event) ? "Autorizar sin conformidad" : "Autorizar cierre"}</button>`;
      }
      if (eventRequiresConformity(event) && !event.clientConformity?.fileName) {
        return `<button class="approve" onclick="showMissingConformityForClose('${id}', ${closeDetailAfter ? "true" : "false"})">Finalizar</button>`;
      }
      return `<button class="approve" onclick="markErpEventDone('${id}')${after}">Finalizar</button>`;
    }

    function hasCloseWithoutConformityRequest(event = {}) {
      return Boolean(event.operationalSheet?.closeWithoutConformityRequested || event.closeWithoutConformityRequested);
    }

    function showMissingConformityForClose(id, closeDetailAfter = false) {
      if (confirm("Este evento no tiene conformidad adjunta. Desea autorizar el cierre sin conformidad?")) {
        approveEventWithoutConformity(id, closeDetailAfter);
        return;
      }
      showEventOverview(id);
    }

    async function approveEventWithoutConformity(id, closeDetailAfter = false) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;
      const response = await fetch("/api/erp-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          status: "done",
          approveWithoutConformity: "true",
          conformityWaiverReason: "Autorizado por administracion sin conformidad adjunta.",
        }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo autorizar el cierre sin conformidad.", "error");
        return;
      }
      showNotice("Evento finalizado con autorizacion sin conformidad.", "success");
      if (closeDetailAfter) hideDetail();
      await loadErp();
    }

    function renderEventHistoryRow(event) {
      return `
        <div class="event-history-row" onclick="showEventOverview('${escapeAttribute(event.id)}')">
          <div>
            <strong>${escapeHtml(event.name)}</strong>
            <span class="erp-card-meta">${escapeHtml(event.clientName || "Sin cliente")} | ${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")}</span>
          </div>
          <strong>${formatCurrency(event.quoteTotal || 0)}</strong>
          <span class="erp-status">${escapeHtml(getErpEventStatusLabel(event.status))}</span>
        </div>
      `;
    }

    function showEventOverview(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;

      document.getElementById("detail-title").textContent = event.name || "Evento";
      document.getElementById("detail-subtitle").textContent = `${event.clientName || "Sin cliente"} | ${formatShortDate(event.eventDate) || "Sin fecha"}${event.eventTime ? ` ${event.eventTime}` : ""} | ${event.guestCount || 0} invitados`;
      document.getElementById("detail-fields").innerHTML = `
        <div class="event-detail-grid">
          <div class="event-detail-item"><span>Estado</span><strong>${escapeHtml(getErpEventStatusLabel(event.status))}</strong></div>
          <div class="event-detail-item"><span>Horario</span><strong>${escapeHtml(event.eventTime || "Sin definir")}</strong></div>
          <div class="event-detail-item"><span>Responsable</span><strong>${escapeHtml(event.owner || "Sin responsable")}</strong></div>
          <div class="event-detail-item"><span>Lugar</span><strong>${escapeHtml(event.venue || "Sin lugar")}</strong></div>
          <div class="event-detail-item"><span>Servicio</span><strong>${escapeHtml(event.serviceType || "Sin servicio")}</strong></div>
          <div class="event-detail-item"><span>Asistencia</span><strong>${escapeHtml(getAssistanceLabel(event))}</strong></div>
          <div class="event-detail-item"><span>Facturacion</span><strong>${escapeHtml(getInvoiceSummaryLabel(event))}${event.invoiceNumber && !isNoInvoiceEvent(event) ? ` · ${escapeHtml(event.invoiceNumber)}` : ""}</strong></div>
          <div class="event-detail-item event-menu-panel"><span>Menu</span>${renderMenuItems(event)}</div>
          <div class="event-detail-item"><span>Bebidas</span><strong>${escapeHtml([event.includesDrinks, event.drinkType].filter(Boolean).join(" · ") || "Sin definir")}</strong></div>
          <div class="event-detail-item"><span>Vajilla</span><strong>${escapeHtml([event.tableware, event.tablewareQuantities, event.tablewareDetail].filter(Boolean).join(" · ") || "Sin definir")}</strong></div>
          <div class="event-detail-item"><span>Rol operativo</span><strong>${escapeHtml(event.role || "Sin definir")}</strong></div>
          <div class="event-detail-item"><span>Proxima accion</span><strong>${escapeHtml(event.nextAction || "Sin definir")}</strong></div>
        </div>
        <div class="event-finance">
          <div class="event-number highlight"><span>Venta</span><strong>${formatCurrency(event.quoteTotal || 0)}</strong></div>
          <div class="event-number"><span>Modalidad</span><strong>${escapeHtml(getEventPriceLabel(event))}</strong></div>
          <div class="event-number"><span>Costo presupuesto</span><strong>${formatCurrency(event.quoteCostTotal || 0)}</strong></div>
          <div class="event-number"><span>Compras reales</span><strong>${formatCurrency(event.purchaseTotal || 0)}</strong></div>
          <div class="event-number"><span>Stock usado</span><strong>${formatCurrency(event.stockCostTotal || 0)}</strong></div>
          <div class="event-number warn"><span>Costo final</span><strong>${formatCurrency(event.finalCostTotal || 0)}</strong></div>
          <div class="event-number highlight"><span>Margen final</span><strong>${formatCurrency(event.operationalMargin || 0)} (${formatPercent(event.operationalMarginPercent || 0)})</strong></div>
        </div>
        <div class="event-finance" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          <div class="event-number"><span>Momentos</span><strong>${escapeHtml(event.eventMoments || "Sin definir")}</strong></div>
        </div>
        ${renderEventConformityPanel(event)}
        ${renderEventPurchases(event)}
        ${renderEventStockItems(event)}
        <div class="event-checks">
          ${renderEventCheck("Compras", event.checklist?.purchases)}
          ${renderEventCheck("Produccion", event.checklist?.production)}
          ${renderEventCheck("Personal", event.checklist?.staff)}
          ${renderEventCheck("Logistica", event.checklist?.logistics)}
          ${renderEventCheck("Menu", event.checklist?.menu)}
          ${renderEventCheck("Pagos", event.checklist?.payments)}
        </div>
        ${event.notes ? `<div class="event-detail-item" style="margin-top:12px;"><span>Notas</span>${escapeHtml(event.notes)}</div>` : ""}
        <div class="actions" style="margin-top:12px;">
          <button class="filter" onclick="editErpEvent('${escapeAttribute(event.id)}'); hideDetail();">Editar</button>
          <button class="filter" onclick="showOperationalSheet('${escapeAttribute(event.id)}')">Ficha operativa</button>
          <button class="filter" onclick="downloadKitchenChecklist('${escapeAttribute(event.id)}')">Checklist cocina</button>
          ${event.status !== "done" && can("quotes:write") ? `<button class="approve" onclick="startErpQuoteFromMenu('${escapeAttribute(event.id)}'); hideDetail();">Presupuestar con menu</button>` : ""}
          ${renderEventCloseAction(event, true)}
        </div>
      `;
      document.querySelector("#detail .detail-panel")?.classList.add("event-wide");
      document.getElementById("detail").classList.add("open");
    }

    function renderEventConformityPanel(event) {
      const conformity = event.clientConformity || {};
      const waiver = event.conformityWaiver || {};
      if (!eventRequiresConformity(event)) {
        return `
          <section class="event-detail-item" style="margin-top:12px;">
            <span>Conformidad del cliente</span>
            <div class="conformity-box not-required">
              <div>
                <strong>No aplica</strong>
                <div class="secondary">Los eventos perdidos o cancelados no requieren conformidad.</div>
              </div>
              ${conformity.fileName ? `<button class="filter" type="button" onclick="downloadEventConformity('${escapeAttribute(event.id)}')">Descargar PDF</button>` : ""}
            </div>
          </section>
        `;
      }
      return `
        <section class="event-detail-item" style="margin-top:12px;">
          <span>Conformidad del cliente</span>
          <div class="conformity-box">
            <div>
              <strong>${conformity.fileName ? escapeHtml(conformity.originalName || "Conformidad cargada") : waiver.approved ? "Cierre autorizado sin PDF" : "PDF pendiente"}</strong>
              <div class="secondary">${
                conformity.uploadedAt
                  ? `Subida ${escapeHtml(formatDate(conformity.uploadedAt) || conformity.uploadedAt)}${conformity.uploadedBy ? ` por ${escapeHtml(conformity.uploadedBy)}` : ""}`
                  : waiver.approved
                    ? `Autorizado ${escapeHtml(formatDate(waiver.approvedAt) || waiver.approvedAt || "")}${waiver.approvedBy ? ` por ${escapeHtml(waiver.approvedBy)}` : ""}`
                    : hasCloseWithoutConformityRequest(event)
                      ? "Logistica solicito finalizar sin conformidad. Pendiente de autorizacion admin."
                      : "Obligatoria para cerrar el evento."
              }</div>
            </div>
            <div class="actions">
              <label class="filter file-action">
                Subir PDF
                <input type="file" accept="application/pdf" onchange="uploadEventConformity('${escapeAttribute(event.id)}', this)">
              </label>
              ${conformity.fileName ? `<button class="filter" type="button" onclick="downloadEventConformity('${escapeAttribute(event.id)}')">Descargar PDF</button>` : ""}
            </div>
          </div>
        </section>
      `;
    }

    async function uploadEventConformity(id, input) {
      const file = input.files?.[0];
      if (!file) return;
      if (file.type && file.type !== "application/pdf") {
        showNotice("La conformidad debe subirse en PDF.", "error");
        input.value = "";
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        const response = await fetch("/api/event-conformity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, fileName: file.name, dataUrl }),
        });
        const result = await readJsonResponse(response);
        if (!result.ok) throw new Error(result.error || "No se pudo subir la conformidad.");
        showNotice("Conformidad cargada correctamente.", "success");
        await loadErp();
        showEventOverview(id);
      } catch (error) {
        showNotice(error.message, "error");
      } finally {
        input.value = "";
      }
    }

    function downloadEventConformity(id) {
      window.location.href = `/api/event-conformity?id=${encodeURIComponent(id)}`;
    }

    function renderEventPurchases(event) {
      const purchases = getEventPurchaseRows(event);
      if (!purchases.length) {
        return `<div class="empty" style="margin-top:12px;">No hay compras imputadas a este evento.</div>`;
      }

      return `
        <div class="event-purchases">
          <div class="event-purchase-row header">
            <div>Fecha</div>
            <div>Proveedor</div>
            <div>Compra</div>
            <div>Cantidad</div>
            <div>Total</div>
            <div>Pago</div>
          </div>
          ${purchases.map((purchase) => `
            <div class="event-purchase-row">
              <div>${escapeHtml(formatShortDate(purchase.date) || purchase.date || "")}</div>
              <div>${escapeHtml(purchase.provider || "Sin proveedor")}</div>
              <div>${escapeHtml(purchase.description || "Sin descripcion")}</div>
              <div>${escapeHtml(purchase.quantity || "")}</div>
              <div><strong>${formatCurrency(purchase.totalAmount || 0)}</strong></div>
              <div><span class="badge ${purchase.paymentStatus === "Pagado" ? "confirmed" : "missing_info"}">${escapeHtml(purchase.paymentStatus || "Pendiente")}</span></div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function getEventPurchaseRows(event) {
      return (event.purchases || []).flatMap((purchase) => {
        const items = purchase.lineItems || [];
        if (!items.length) {
          return [{
            date: purchase.date,
            provider: purchase.provider,
            description: purchase.description,
            quantity: "",
            totalAmount: purchase.totalAmount,
            paymentStatus: purchase.paymentStatus,
          }];
        }
        return items.map((item) => ({
          date: purchase.date,
          provider: purchase.provider,
          description: item.description || purchase.description,
          quantity: item.quantity,
          totalAmount: item.total,
          paymentStatus: purchase.paymentStatus,
        }));
      });
    }

    function renderMenuItems(event) {
      const items = event.menuItems || [];
      if (!items.length) return `<strong>${escapeHtml(event.selectedMenu || "Sin menu")}</strong>`;
      return `<div class="event-mini-list">${items.map((item) => `
        <div class="event-menu-entry">
          <strong>${escapeHtml([item.quantity, item.name].filter(Boolean).join(" · "))}</strong>
          <div class="event-menu-meta">
            ${item.category ? `<span>${escapeHtml(getMenuCategoryLabel(item.category))}</span>` : ""}
            ${item.suggestedQuantity ? `<span>${escapeHtml(item.suggestedQuantity)}</span>` : ""}
          </div>
          ${item.detail ? `<div class="secondary">${escapeHtml(item.detail)}</div>` : ""}
          ${item.subItems?.length ? `<div class="secondary">${escapeHtml(item.subItems.map((subItem) => subItem.name).join(", "))}</div>` : ""}
        </div>
      `).join("")}</div>`;
    }

    function getAssistanceLabel(event) {
      const labels = {
        assisted: `Con asistencia${event.waiterCount ? ` (${event.waiterCount} mozo/s)` : ""}`,
        self_service: "Sin asistencia / autoservicio montado",
        delivery_only: "Solo entrega",
      };
      return labels[event.assistanceMode] || event.staff || "A definir";
    }

    function renderEventStockItems(event) {
      const items = event.stockItems || [];
      if (!items.length) return "";
      return `
        <div class="event-purchases">
          <div class="event-purchase-row event-stock-row header">
            <div>Tipo</div>
            <div>Mercaderia</div>
            <div>Cantidad</div>
            <div>Total</div>
            <div>Origen</div>
          </div>
          ${items.map((item) => `
            <div class="event-purchase-row event-stock-row">
              <div>Stock</div>
              <div>${escapeHtml(item.description || "Sin detalle")}</div>
              <div>${escapeHtml(item.quantity || "")}</div>
              <div><strong>${formatCurrency(item.total || 0)}</strong></div>
              <div><span class="badge confirmed">Ficticio</span></div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderEventCheck(label, done) {
      return `<span class="event-check ${done ? "done" : ""}">${done ? "OK" : "Pendiente"} · ${escapeHtml(label)}</span>`;
    }

    function getEventPriceLabel(event) {
      if (event.priceMode === "per_person") {
        return `${formatCurrency(event.pricePerPerson || 0)} x persona`;
      }
      return `${formatCurrency(event.servicePriceTotal || event.quoteTotal || 0)} total`;
    }

    function getEventVenueRecord(event) {
      const eventVenueKey = normalizeSearch(event.venue || "");
      if (!eventVenueKey) return null;
      return (erpData.venues || []).find((venue) => normalizeSearch(venue.name || "") === eventVenueKey) || null;
    }

    function getEventMapsUrl(event) {
      const venue = getEventVenueRecord(event) || {};
      if (event.latitude && event.longitude) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.latitude},${event.longitude}`)}`;
      }
      if (venue.latitude && venue.longitude) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.latitude},${venue.longitude}`)}`;
      }
      const query = [event.venueAddress, event.mapLabel, venue.address, venue.mapLabel, event.venue].filter(Boolean).join(" ");
      return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
    }

    function getEventVenueReference(event) {
      const venue = getEventVenueRecord(event);
      return event.venueReference || venue?.reference || "";
    }

    function getOperationalMenuItems(event) {
      if (event.menuItems?.length) return event.menuItems;
      return String(event.selectedMenu || "")
        .split(/\r?\n|,/)
        .map((name) => ({ name: name.trim(), detail: "" }))
        .filter((item) => item.name);
    }

    function getKitchenChecklistItems(event) {
      const sheetItems = event.operationalSheet?.categories?.alimentos || [];
      if (sheetItems.length) {
        return dedupeKitchenItems(sheetItems
          .map((item) => {
            const split = splitKitchenQuantityText(item.text || "");
            return {
              name: split.name,
              quantity: item.quantity || split.quantity,
              detail: item.note || "",
              category: item.category || "",
            };
          })
          .filter((item) => item.name));
      }

      const menuItems = flattenEventMenuForKitchen(event);
      const categoryCounts = menuItems.reduce((acc, item) => {
        const key = item.category || "otro";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      return dedupeKitchenItems(menuItems.map((item) => ({
        name: cleanKitchenText(item.name || ""),
        quantity: item.quantity || estimateMenuItemQuantity(item, event, categoryCounts),
        detail: cleanKitchenText(item.detail || ""),
        category: item.category || "",
      })).filter((item) => item.name));
    }

    function flattenEventMenuForKitchen(event) {
      return getOperationalMenuItems(event).flatMap((item) => {
        const main = {
          ...item,
          name: item.name || item.detail || "",
          detail: item.detail || "",
          category: item.category || "otro",
        };
        const subItems = (item.subItems || []).map((subItem) => ({
          ...subItem,
          category: subItem.category || item.category || "otro",
          detail: subItem.detail || item.detail || "",
          suggestedQuantity: subItem.suggestedQuantity || item.suggestedQuantity || "",
        }));
        return [main, ...subItems].filter((entry) => entry.name || entry.detail);
      });
    }

    function splitKitchenQuantityText(value) {
      const clean = cleanKitchenText(value);
      const match = clean.match(/^(\d+(?:[,.]\d+)?(?:\s*[-a]\s*\d+(?:[,.]\d+)?)?)\s*(?:unidades?|u\.?|porciones?|cazuelas?|botellas?|lts?|kg|g)?\s*[-|·]\s*(.+)$/i);
      if (!match) return { name: clean, quantity: "" };
      return {
        quantity: match[1].replace(/\s+/g, " ").trim(),
        name: cleanKitchenText(match[2]),
      };
    }

    function cleanKitchenText(value) {
      return String(value || "")
        .replace(/\uFFFD/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function dedupeKitchenItems(items) {
      const seen = new Set();
      return items.filter((item) => {
        const key = normalizeSearch([item.name, item.quantity, item.detail].join(" "));
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function estimateMenuItemQuantity(item, event, categoryCounts = {}) {
      const guests = Number(event.guestCount || 0);
      const suggestion = item.suggestedQuantity || "";
      if (!guests || !suggestion) return suggestion;
      const range = parsePerGuestRange(suggestion);
      if (!range) return suggestion;
      const category = item.category || "otro";
      const distribute = ["finger_food", "empanadas", "cazuelas"].includes(category);
      const share = distribute ? Math.max(1, categoryCounts[category] || 1) : 1;
      const low = Math.ceil((guests * range.low) / share);
      const high = Math.ceil((guests * range.high) / share);
      const unit = category === "cazuelas" ? "cazuelas" : category === "empanadas" ? "unidades" : "unidades";
      return low === high ? `${low} ${unit} aprox.` : `${low}-${high} ${unit} aprox.`;
    }

    function parsePerGuestRange(value) {
      const text = normalizeSearch(value || "");
      if (!text.includes("persona")) return null;
      const range = text.match(/(\d+(?:[,.]\d+)?)\s*(?:-|a)\s*(\d+(?:[,.]\d+)?)/);
      if (range) {
        return { low: parseDecimal(range[1]), high: parseDecimal(range[2]) };
      }
      const single = text.match(/(\d+(?:[,.]\d+)?)/);
      if (!single) return null;
      const amount = parseDecimal(single[1]);
      return { low: amount, high: amount };
    }

    function parseKitchenQuantityNumber(value) {
      const text = String(value || "").replace(",", ".");
      const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|a)\s*(\d+(?:\.\d+)?)/);
      if (range) return (Number(range[1]) + Number(range[2])) / 2;
      const single = text.match(/(\d+(?:\.\d+)?)/);
      return single ? Number(single[1]) : 0;
    }

    function buildKitchenChecklistHtml(event) {
      const items = getKitchenChecklistItems(event);
      const now = new Date().toLocaleString("es-AR");
      return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Checklist cocina - ${escapeHtml(event.name || "Evento")}</title>
  <style>
    body { background:#f3f6f8; color:#0f1b2a; font-family: Arial, sans-serif; margin:0; padding:24px; }
    main { background:#fff; border:1px solid #d8dee8; border-radius:10px; margin:auto; max-width:960px; padding:24px; }
    h1 { font-size:24px; margin:0 0 6px; }
    .meta { color:#607086; margin-bottom:18px; }
    .summary { display:grid; gap:8px; grid-template-columns:repeat(4, minmax(0, 1fr)); margin-bottom:18px; }
    .box { border:1px solid #d8dee8; border-radius:8px; padding:10px; }
    .box span { color:#607086; display:block; font-size:11px; font-weight:700; text-transform:uppercase; }
    .box strong { display:block; margin-top:5px; overflow-wrap:anywhere; }
    table { border-collapse:collapse; width:100%; }
    th, td { border-bottom:1px solid #d8dee8; padding:10px; text-align:left; vertical-align:top; }
    th { background:#eef2f6; color:#334155; font-size:11px; text-transform:uppercase; }
    .check { width:34px; }
    @media print { body { background:#fff; padding:0; } main { border:0; border-radius:0; max-width:none; } }
  </style>
</head>
<body>
  <main>
    <h1>Checklist de cocina</h1>
    <div class="meta">${escapeHtml(event.name || "Evento")} · Generado ${escapeHtml(now)}</div>
    <section class="summary">
      <div class="box"><span>Cliente</span><strong>${escapeHtml(event.clientName || "Sin cliente")}</strong></div>
      <div class="box"><span>Fecha</span><strong>${escapeHtml([formatShortDate(event.eventDate), event.eventTime].filter(Boolean).join(" - ") || "Sin fecha")}</strong></div>
      <div class="box"><span>Invitados</span><strong>${escapeHtml(event.guestCount || 0)}</strong></div>
      <div class="box"><span>Servicio</span><strong>${escapeHtml(event.serviceType || "Sin servicio")}</strong></div>
    </section>
    <table>
      <thead><tr><th class="check">OK</th><th>Item</th><th>Cantidad</th><th>Detalle</th></tr></thead>
      <tbody>
        ${items.length ? items.map((item) => `
          <tr>
            <td class="check">☐</td>
            <td><strong>${escapeHtml(item.name)}</strong>${item.category ? `<br><small>${escapeHtml(getMenuCategoryLabel(item.category))}</small>` : ""}</td>
            <td>${escapeHtml(item.quantity || "Definir")}</td>
            <td>${escapeHtml(item.detail || "")}</td>
          </tr>
        `).join("") : `<tr><td colspan="4">Sin items de menu cargados.</td></tr>`}
      </tbody>
    </table>
  </main>
</body>
</html>`;
    }

    function downloadKitchenChecklist(eventId) {
      const event = (erpData.events || []).find((item) => item.id === eventId);
      if (!event) return;
      const fileName = `checklist-cocina-${slugifyFileName(event.name || "evento")}.html`;
      downloadTextFile(fileName, buildKitchenChecklistHtml(event));
      showNotice("Checklist de cocina descargado.", "success");
    }

    function renderOperationalMenuCard(event) {
      const items = getOperationalMenuItems(event);
      return `
        <div class="operational-menu-card">
          <strong>Menu operativo</strong>
          ${items.length
            ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>${item.detail ? `: ${escapeHtml(item.detail)}` : ""}</li>`).join("")}</ul>`
            : `<div>A definir</div>`}
        </div>
      `;
    }

    function getEventSuggestedSupplies(event) {
      const text = normalizeSearch([
        event.serviceType,
        event.selectedMenu,
        event.eventMoments,
        event.drinkType,
        event.includesDrinks,
      ].join(" "));
      const suggestions = new Set();
      const add = (items) => items.forEach((item) => suggestions.add(item));
      const profiles = getSupplyProfiles();
      const profileAliases = {
        coffee: ["coffee", "desayuno", "merienda"],
        finger: ["finger", "cocktail", "recepcion", "mini"],
        asado: ["asado", "parrilla"],
        bebidas: ["bebida", "bebidas", "barra", "vino", "gaseosa", "detox"],
        postre: ["postre", "dulce"],
        agape: ["agape", "agape"],
        cocktail: ["cocktail", "coctel"],
        coctel: ["coctel", "cocktail"],
        cena: ["cena"],
        almuerzo: ["almuerzo"],
        brunch: ["brunch"],
      };

      Object.entries(profiles).forEach(([profile, items]) => {
        const aliases = profileAliases[profile] || [profile];
        if (aliases.some((alias) => text.includes(normalizeSearch(alias))) || (profile === "bebidas" && event.includesDrinks === "Con bebidas")) {
          add(items);
        }
      });

      (allRecipes || []).forEach((recipe) => {
        const recipeKey = normalizeSearch(recipe.name || "");
        if (recipeKey && text.includes(recipeKey)) {
          (recipe.items || []).forEach((item) => {
            if (item.name) suggestions.add(item.name);
          });
        }
      });

      return Array.from(suggestions).slice(0, 40);
    }

    function getSupplyProfiles() {
      return costSettings.supplyProfiles || {
        coffee: ["Cafe", "Te", "Leche", "Azucar", "Edulcorante", "Vasos termicos", "Servilletas", "Medialunas", "Jugo"],
        finger: ["Bandejas", "Servilletas cocktail", "Pinchos", "Salsas", "Panificados", "Descartables de apoyo"],
        asado: ["Carne", "Chorizo", "Morcilla", "Carbon/lenia", "Ensaladas", "Pan", "Chimichurri"],
        bebidas: ["Agua", "Gaseosas", "Hielo", "Vasos", "Conservadoras", "Vinos/espumantes segun propuesta"],
        postre: ["Cucharas", "Platos de postre", "Bases dulces", "Fruta/decoracion", "Contenedores refrigerados"],
      };
    }

    function supplyProfilesToText(profiles = getSupplyProfiles()) {
      return Object.entries(profiles)
        .map(([key, values]) => `${key}: ${(values || []).join(", ")}`)
        .join("\n");
    }

    function operationalOptionsToText(options = getOperationalOptions()) {
      return Object.entries(options)
        .map(([key, values]) => `${key}: ${(values || []).join(", ")}`)
        .join("\n");
    }

    function buildOperationalSheetText(event, selectedSupplies = null) {
      const supplies = selectedSupplies || getEventSuggestedSupplies(event);
      const purchases = event.purchases || [];
      const mapsUrl = getEventMapsUrl(event);
      const venueReference = getEventVenueReference(event);
      const clientPhone = getEventClientPhone(event);
      return [
        `FICHA OPERATIVA - ${event.name || "Evento"}`,
        "",
        `Cliente: ${event.clientName || "Sin cliente"}`,
        `Telefono: ${clientPhone || "Sin telefono"}`,
        `Fecha: ${[formatShortDate(event.eventDate), event.eventTime].filter(Boolean).join(" - ") || "Sin fecha"}`,
        `Invitados: ${event.guestCount || 0}`,
        `Lugar: ${event.venue || "Sin lugar"}`,
        `Ubicacion: ${mapsUrl || "Sin link de mapa"}`,
        ...(venueReference ? [`Referencias: ${venueReference}`] : []),
        `Servicio: ${event.serviceType || "Sin servicio"}`,
        `Precio: ${getEventPriceLabel(event)} | Venta total: ${formatCurrency(event.quoteTotal || 0)}`,
        "",
        "MENU Y BEBIDAS",
        `Momentos: ${event.eventMoments || "A definir"}`,
        "Menu:",
        ...(getOperationalMenuItems(event).length
          ? getOperationalMenuItems(event).map((item) => `- ${[item.quantity, item.name].filter(Boolean).join(" | ")}${item.detail ? `: ${item.detail}` : ""}`)
          : [`- ${event.selectedMenu || "A definir"}`]),
        `Bebidas: ${[event.includesDrinks, event.drinkType].filter(Boolean).join(" - ") || "A definir"}`,
        "",
        "OPERACION",
        `Vajilla: ${event.tableware || "A definir"}`,
        `Cantidades vajilla: ${event.tablewareQuantities || "A definir"}`,
        `Detalle vajilla: ${event.tablewareDetail || "A definir"}`,
        `Contenedores: grandes ${event.largeContainers || 0} | chicos ${event.smallContainers || 0}`,
        `Asistencia: ${getAssistanceLabel(event)}`,
        `Personal: ${event.staff || "A definir"}`,
        `Horarios: ${event.schedule || "A definir"}`,
        `Responsable: ${event.owner || "Sin responsable"}`,
        "",
        "CHECKLIST",
        `Compras: ${event.checklist?.purchases ? "OK" : "Pendiente"}`,
        `Produccion: ${event.checklist?.production ? "OK" : "Pendiente"}`,
        `Personal: ${event.checklist?.staff ? "OK" : "Pendiente"}`,
        `Logistica: ${event.checklist?.logistics ? "OK" : "Pendiente"}`,
        `Menu: ${event.checklist?.menu ? "OK" : "Pendiente"}`,
        `Pagos: ${event.checklist?.payments ? "OK" : "Pendiente"}`,
        `Detalle: ${event.checklistDetails || "Sin detalle"}`,
        "",
        "INSUMOS SUGERIDOS",
        supplies.length ? supplies.map((item) => `- ${item}`).join("\n") : "- Sin sugerencias todavia",
        "",
        "COMPRAS IMPUTADAS",
        getEventPurchaseRows(event).length ? getEventPurchaseRows(event).map((purchase) => `- ${formatShortDate(purchase.date) || ""} | ${purchase.provider || ""} | ${purchase.description || ""} | ${purchase.quantity ? `${purchase.quantity} | ` : ""}${formatCurrency(purchase.totalAmount || 0)} | ${purchase.paymentStatus || "Pendiente"}`).join("\n") : "- Sin compras imputadas",
        "",
        "STOCK USADO / COSTO FICTICIO",
        event.stockItems?.length ? event.stockItems.map((item) => `- ${item.description || "Stock"} | ${item.quantity || ""} x ${formatCurrency(item.unitAmount || 0)} | ${formatCurrency(item.total || 0)}`).join("\n") : "- Sin stock imputado",
        "",
        `Notas: ${event.notes || "Sin notas"}`,
      ].join("\n");
    }

    function getEventClientPhone(event) {
      const key = normalizeSearch(event.clientName || "");
      const customer = (erpData.customers || allCustomers || []).find((item) =>
        key && [item.fullName, item.contactName, item.displayPhone].some((value) => normalizeSearch(value || "") === key)
      );
      return customer?.displayPhone || customer?.phone || "";
    }

    function showOperationalSheet(id) {
      if (can("logistics:write")) {
        hideDetail();
        openLogisticsEvent(id);
        return;
      }
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;
      const supplies = getEventSuggestedSupplies(event);
      const sheetText = buildOperationalSheetText(event);
      const mapsUrl = getEventMapsUrl(event);
      const venueReference = getEventVenueReference(event);
      document.getElementById("alert-detail-title").textContent = `Ficha operativa`;
      document.getElementById("alert-detail-subtitle").textContent = event.name || "";
      document.getElementById("alert-detail-body").innerHTML = `
        ${field("Venta", `${getEventPriceLabel(event)} · ${formatCurrency(event.quoteTotal || 0)}`)}
        ${mapsUrl ? `<div class="field"><label>Ubicacion</label><div><a class="filter" href="${escapeAttribute(mapsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps</a></div></div>` : field("Ubicacion", "Sin link de mapa")}
        ${venueReference ? field("Referencias del lugar", venueReference) : ""}
        ${renderOperationalMenuCard(event)}
        ${field("Bebidas", [event.includesDrinks, event.drinkType].filter(Boolean).join(" · ") || "A definir")}
        ${field("Operacion", [getAssistanceLabel(event), event.tableware, event.staff, event.schedule].filter(Boolean).join(" · ") || "A definir")}
        <div class="form-field full">
          <label>Insumos sugeridos</label>
          <div id="operational-supply-checks" class="checklist">
            ${supplies.length ? supplies.map((item, index) => `
              <label class="check-item"><input type="checkbox" value="${escapeAttribute(item)}" checked onchange="refreshOperationalSheetText('${escapeAttribute(event.id)}')"> ${escapeHtml(item)}</label>
            `).join("") : `<div class="empty">Sin sugerencias todavia.</div>`}
          </div>
        </div>
        <textarea id="operational-sheet-text" style="min-height:320px;">${escapeHtml(sheetText)}</textarea>
        <div class="actions"><button class="approve" onclick="copyOperationalSheet()">Copiar ficha</button></div>
      `;
      document.getElementById("alert-detail").classList.add("open");
    }

    function getSelectedOperationalSupplies() {
      return Array.from(document.querySelectorAll("#operational-supply-checks input[type='checkbox']:checked"))
        .map((input) => input.value)
        .filter(Boolean);
    }

    function refreshOperationalSheetText(eventId) {
      const event = (erpData.events || []).find((item) => item.id === eventId);
      if (!event) return;
      document.getElementById("operational-sheet-text").value = buildOperationalSheetText(event, getSelectedOperationalSupplies());
    }

    async function copyOperationalSheet() {
      const text = document.getElementById("operational-sheet-text").value;
      await navigator.clipboard.writeText(text);
      showNotice("Ficha operativa copiada.");
    }

    function renderErpQuotes() {
      const containers = [
        document.getElementById("erp-quote-list"),
        document.getElementById("events-quote-list"),
      ].filter(Boolean);
      if (!containers.length) return;
      const quotes = erpData.quotes || [];
      const eventById = new Map((erpData.events || []).map((event) => [event.id, event]));
      const activeQuotes = quotes.filter((quote) => eventById.get(quote.eventId)?.status !== "done");
      const archivedQuotes = quotes.filter((quote) => eventById.get(quote.eventId)?.status === "done");

      if (!quotes.length) {
        containers.forEach((container) => {
          container.innerHTML = `<div class="empty">No hay presupuestos ERP guardados.</div>`;
        });
        return;
      }

      const renderQuoteCard = (quote) => `
        <article class="erp-card">
          <div class="erp-card-head">
            <div>
              <div class="erp-card-title">${escapeHtml(quote.eventName || "Presupuesto sin evento")}</div>
              <div class="erp-card-meta">${escapeHtml(quote.clientName || "")} | ${escapeHtml(quote.guestCount || 0)} invitados</div>
            </div>
            <span class="erp-status">${escapeHtml(getErpQuoteStatusLabel(quote.status))}</span>
          </div>
          <div class="recipe-summary" style="margin-top:10px;">
            <div><span>Costo</span><strong>${formatCurrency(quote.costTotal)}</strong></div>
            <div><span>Precio</span><strong>${formatCurrency(quote.priceTotal)}</strong></div>
            <div><span>Margen</span><strong>${formatPercent(quote.marginPercent)}</strong></div>
          </div>
          <div class="actions" style="margin-top:10px;">
            <button class="filter" onclick="editErpQuote('${escapeAttribute(quote.id)}')">Editar</button>
            <button class="reject" onclick="deleteErpQuote('${escapeAttribute(quote.id)}')">Eliminar</button>
          </div>
        </article>
      `;

      const html = `
        ${activeQuotes.length
          ? activeQuotes.map(renderQuoteCard).join("")
          : `<div class="empty">No hay presupuestos activos. Los de eventos realizados quedan archivados.</div>`}
        <details class="event-history">
          <summary>Presupuestos archivados (${archivedQuotes.length})</summary>
          ${archivedQuotes.length ? archivedQuotes.map(renderQuoteCard).join("") : `<div class="empty">Sin presupuestos archivados.</div>`}
        </details>
      `;
      containers.forEach((container) => {
        container.innerHTML = html;
      });
    }

    function renderErpQuoteEventOptions(selectedId = "") {
      const select = document.getElementById("erp-quote-event");
      const events = (erpData.events || []).filter((event) => event.status !== "done" || event.id === selectedId);
      select.innerHTML = [
        `<option value="">Seleccionar evento</option>`,
        ...events.map((event) => `<option value="${escapeAttribute(event.id)}" ${event.id === selectedId ? "selected" : ""}>${escapeHtml(event.name)}</option>`),
      ].join("");
    }

    async function importQuoteDocument(input) {
      const file = input.files?.[0];
      if (!file) return;
      try {
        showNotice("Leyendo presupuesto...");
        const dataUrl = await fileToDataUrl(file);
        const response = await fetch("/api/import-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, dataUrl }),
        });
        const result = await readJsonResponse(response);
        if (!result.ok) {
          showNotice(result.error || "No se pudo importar el presupuesto.", "error");
          return;
        }
        pendingQuoteImport = result.result;
        showImportedQuoteReview(result.result);
      } finally {
        input.value = "";
      }
    }

    function showImportedQuoteReview(data = {}) {
      const panel = document.querySelector("#detail .detail-panel");
      panel?.classList.add("wide");
      document.getElementById("detail-title").textContent = "Revisar presupuesto importado";
      document.getElementById("detail-subtitle").textContent = data.fileName || "Revise antes de guardar";
      document.getElementById("detail-fields").innerHTML = `
        <form id="quote-import-review-form" class="form-grid" onsubmit="saveImportedQuote(event)">
          <div class="form-field full">
            <label>Asociar a evento existente</label>
            <select name="eventId">
              <option value="">Crear evento nuevo</option>
              ${(erpData.events || []).map((event) => `<option value="${escapeAttribute(event.id)}">${escapeHtml(event.name || "Sin nombre")} · ${escapeHtml(formatShortDate(event.eventDate) || "Sin fecha")}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label>Evento</label>
            <input name="eventName" value="${escapeAttribute(data.eventName || "")}" required>
          </div>
          <div class="form-field">
            <label>Cliente</label>
            <input name="clientName" value="${escapeAttribute(data.clientName || "")}">
          </div>
          <div class="form-field">
            <label>Lugar</label>
            <input name="venue" value="${escapeAttribute(data.venue || "")}" placeholder="Lugar o direccion">
          </div>
          <div class="form-field">
            <label>Fecha</label>
            <input name="eventDate" type="date" value="${escapeAttribute(data.eventDate || "")}">
          </div>
          <div class="form-field">
            <label>Horario</label>
            <input name="eventTime" value="${escapeAttribute(data.eventTime || "")}" placeholder="Ej: 20:30">
          </div>
          <div class="form-field">
            <label>Invitados</label>
            <input name="guestCount" inputmode="decimal" value="${escapeAttribute(data.guestCount || "")}">
          </div>
          <div class="form-field">
            <label>Servicio</label>
            <input name="serviceType" value="${escapeAttribute(data.serviceType || "")}">
          </div>
          <div class="form-field">
            <label>Precio por persona</label>
            <input name="pricePerPerson" inputmode="decimal" value="${escapeAttribute(data.pricePerPerson || "")}">
          </div>
          <div class="form-field">
            <label>Venta total</label>
            <input name="priceTotal" inputmode="decimal" value="${escapeAttribute(data.priceTotal || "")}">
          </div>
          <div class="form-field full">
            <label>Menu detectado</label>
            <div id="quote-import-menu" class="erp-quote-lines">
              ${(data.menuItems?.length ? data.menuItems : [{ name: "" }]).map(renderImportedMenuRow).join("")}
            </div>
            <button class="filter" type="button" onclick="addImportedMenuRow()">Agregar item de menu</button>
          </div>
          <div class="form-field full">
            <label>Infraestructura y servicios incluidos</label>
            <textarea name="includedServices" placeholder="Personal, vajilla, ambientacion, mobiliario, seguridad...">${escapeHtml((data.includedServices || []).join("\n"))}</textarea>
          </div>
          <div class="form-field full">
            <label>Bebidas</label>
            <input name="drinks" value="${escapeAttribute((data.drinkItems || []).join(", "))}" placeholder="Agua con gas, gaseosas, vinos">
          </div>
          <div class="form-field full">
            <label>Notas importadas</label>
            <textarea name="notes">${escapeHtml(data.notes || "")}</textarea>
          </div>
          <details class="full">
            <summary>Texto detectado</summary>
            <textarea readonly style="margin-top:8px;min-height:180px;">${escapeHtml(data.sourceText || "")}</textarea>
          </details>
          <div class="actions full">
            <button class="approve" type="submit">Guardar evento y presupuesto</button>
            <button class="filter" type="button" onclick="fillEventFormFromImportedQuote()">Editar como evento</button>
            <button class="reject" type="button" onclick="hideDetail()">Cancelar</button>
          </div>
        </form>
      `;
      document.getElementById("detail").classList.add("open");
    }

    function renderImportedMenuRow(item = {}) {
      const subItemsText = Array.isArray(item.subItems)
        ? item.subItems.map((subItem) => [subItem.name, subItem.detail].filter(Boolean).join(": ")).join("\n")
        : "";
      return `
        <div class="menu-line quote-import-menu-row">
          <label>
            <span>Item del menu</span>
            <input class="quote-import-menu-name" placeholder="Ej: Variedad de empanadas" value="${escapeAttribute(item.name || "")}">
          </label>
          <label>
            <span>Detalle opcional</span>
            <textarea class="quote-import-menu-detail" placeholder="Descripcion del item">${escapeHtml(item.detail || "")}</textarea>
          </label>
          <label>
            <span>Categoria</span>
            <select class="quote-import-menu-category">
              ${[
                ["finger_food", "Finger food"],
                ["empanadas", "Empanadas"],
                ["cazuelas", "Cazuelas"],
                ["picada", "Picada"],
                ["principal", "Principal"],
                ["postre", "Postre"],
                ["guarnicion", "Guarnicion"],
                ["otro", "Otro"],
              ].map(([value, label]) => `<option value="${value}" ${item.category === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Cantidad final</span>
            <input class="quote-import-menu-quantity" placeholder="Ej: 2 p/p" value="${escapeAttribute(item.quantity || "")}">
          </label>
          <button class="reject" type="button" onclick="this.closest('.quote-import-menu-row').remove()">x</button>
          <label class="quote-import-menu-suggestion-wrap">
            <span>Sugerencia editable</span>
            <input class="quote-import-menu-suggestion" placeholder="Sugerencia del sistema" value="${escapeAttribute(item.suggestedQuantity || "")}">
          </label>
          <label class="quote-import-menu-subitems-wrap">
            <span>Subitems / variedades</span>
            <textarea class="quote-import-menu-subitems" placeholder="Uno por linea">${escapeHtml(subItemsText)}</textarea>
          </label>
        </div>
      `;
    }

    function addImportedMenuRow(item = {}) {
      document.getElementById("quote-import-menu")?.insertAdjacentHTML("beforeend", renderImportedMenuRow(item));
    }

    function collectImportedQuoteReview() {
      const form = document.getElementById("quote-import-review-form");
      const menuItems = Array.from(document.querySelectorAll(".quote-import-menu-row"))
        .map((row) => ({
          quantity: row.querySelector(".quote-import-menu-quantity")?.value.trim() || "",
          name: row.querySelector(".quote-import-menu-name")?.value.trim() || "",
          detail: row.querySelector(".quote-import-menu-detail")?.value.trim() || "",
          category: row.querySelector(".quote-import-menu-category")?.value || "",
          suggestedQuantity: row.querySelector(".quote-import-menu-suggestion")?.value.trim() || "",
          subItems: parseImportedMenuSubItems(row.querySelector(".quote-import-menu-subitems")?.value || ""),
        }))
        .filter((item) => item.name || item.detail || item.quantity);
      const drinks = form.elements.drinks.value.split(",").map((item) => item.trim()).filter(Boolean);
      const includedServices = form.elements.includedServices.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      const pricePerPerson = parseDecimal(form.elements.pricePerPerson.value || 0);
      const priceTotal = parseDecimal(form.elements.priceTotal.value || 0);
      return {
        eventId: form.elements.eventId.value,
        eventName: form.elements.eventName.value.trim(),
        clientName: form.elements.clientName.value.trim(),
        venue: form.elements.venue.value.trim(),
        eventDate: form.elements.eventDate.value,
        eventTime: form.elements.eventTime.value.trim(),
        guestCount: form.elements.guestCount.value,
        serviceType: form.elements.serviceType.value.trim(),
        priceMode: pricePerPerson > 0 ? "per_person" : "total",
        pricePerPerson,
        priceTotal,
        menuItems,
        drinkItems: drinks,
        includedServices,
        includesDrinks: drinks.length ? "Con bebidas" : "Sin bebidas",
        notes: form.elements.notes.value.trim(),
      };
    }

    function parseImportedMenuSubItems(value) {
      return String(value || "")
        .split(/\r?\n/)
        .map((line) => {
          const [name, ...detailParts] = line.split(":");
          return {
            name: name.trim(),
            detail: detailParts.join(":").trim(),
            quantity: "",
          };
        })
        .filter((item) => item.name);
    }

    async function saveImportedQuote(event) {
      event.preventDefault();
      const data = collectImportedQuoteReview();
      if (!data.eventName) {
        showNotice("Ingrese el nombre del evento.", "error");
        return;
      }
      const selectedEvent = (erpData.events || []).find((item) => item.id === data.eventId);
      const eventPayload = {
        ...(selectedEvent || {}),
        id: data.eventId || "",
        name: data.eventName,
        clientName: data.clientName,
        venue: data.venue,
        eventDate: data.eventDate,
        eventTime: data.eventTime,
        guestCount: data.guestCount,
        serviceType: data.serviceType,
        priceMode: data.priceMode,
        pricePerPerson: data.pricePerPerson,
        servicePriceTotal: data.priceTotal,
        status: selectedEvent?.status && selectedEvent.status !== "lead" ? selectedEvent.status : "quoted",
        includesDrinks: data.includesDrinks,
        drinkType: data.drinkItems.join(", "),
        menuItems: data.menuItems,
        selectedMenu: data.menuItems.map((item) => [item.quantity, item.name, item.detail].filter(Boolean).join(" - ")).join(", "),
        checklistDetails: data.includedServices.length ? `Infraestructura y servicios incluidos:\n${data.includedServices.map((item) => `- ${item}`).join("\n")}` : selectedEvent?.checklistDetails || "",
        notes: [selectedEvent?.notes, data.notes].filter(Boolean).join("\n"),
      };
      const eventResponse = await fetch("/api/erp-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventPayload),
      });
      const eventResult = await readJsonResponse(eventResponse);
      if (!eventResult.ok) {
        showNotice(eventResult.error || "No se pudo guardar el evento importado.", "error");
        return;
      }
      const savedEvent = eventResult.event;
      const quoteResponse = await fetch("/api/erp-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: savedEvent.id,
          eventName: savedEvent.name,
          clientName: savedEvent.clientName,
          guestCount: savedEvent.guestCount,
          status: "sent",
          version: "importado",
          targetMarginPercent: 35,
          manualPrice: data.priceTotal,
          notes: ["Importado desde presupuesto.", data.notes].filter(Boolean).join("\n"),
          recipes: [],
        }),
      });
      const quoteResult = await readJsonResponse(quoteResponse);
      if (!quoteResult.ok) {
        showNotice(quoteResult.error || "El evento se guardo, pero no se pudo crear el presupuesto.", "error");
        await loadErp();
        return;
      }
      showNotice("Presupuesto importado y asociado al evento.", "success");
      hideDetail();
      await loadErp();
    }

    function fillEventFormFromImportedQuote() {
      const data = collectImportedQuoteReview();
      hideDetail();
      showBlankErpEventForm();
      const form = document.getElementById("erp-event-form");
      setFormValue(form, "name", data.eventName);
      setFormValue(form, "clientName", data.clientName);
      setFormValue(form, "eventDate", data.eventDate);
      setFormValue(form, "eventTime", data.eventTime);
      setFormValue(form, "guestCount", data.guestCount);
      setFormValue(form, "priceMode", data.priceMode);
      setFormValue(form, "pricePerPerson", data.pricePerPerson || "");
      setFormValue(form, "servicePriceTotal", data.priceTotal || "");
      setFormValue(form, "includesDrinks", data.includesDrinks);
      setFormValue(form, "notes", data.notes);
      renderOperationalOptionInputs({ serviceType: data.serviceType, drinkType: data.drinkItems.join(", ") });
      renderEventMenuLines(data.menuItems);
    }

    function renderErpCustomerOptions() {
      document.getElementById("erp-customer-options").innerHTML = (allCustomers || [])
        .map((customer) => `<option value="${escapeAttribute(customer.fullName || customer.contactName || customer.displayPhone || "")}"></option>`)
        .join("");
      const selected = document.getElementById("erp-event-customer").value;
      document.getElementById("erp-event-customer").innerHTML = [
        `<option value="">Seleccionar cliente</option>`,
        ...(allCustomers || []).map((customer) => {
          const value = customer.fullName || customer.contactName || customer.displayPhone || "";
          return `<option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
        }),
      ].join("");
    }

    function renderErpVenueOptions() {
      document.getElementById("erp-venue-options").innerHTML = (erpData.venues || [])
        .map((venue) => `<option value="${escapeAttribute(venue.name || venue)}"></option>`)
        .join("");
      const selected = document.getElementById("erp-event-venue").value;
      document.getElementById("erp-event-venue").innerHTML = [
        `<option value="">Seleccionar lugar</option>`,
        ...(erpData.venues || []).map((venue) => {
          const value = venue.name || venue;
          return `<option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
        }),
      ].join("");
    }

    function getOperationalOptions() {
      return costSettings.operationalOptions || {
        services: ["Coffee", "Finger", "Agape", "Cocktail", "Coctel", "Cena", "Almuerzo", "Asado", "Brunch"],
        moments: ["Recepcion", "Coffee", "Comida", "Postre", "Barra", "Trasnoche", "Desayuno", "Merienda"],
        drinks: ["Agua con gas", "Agua sin gas", "Gaseosas", "Detox", "Cafe", "Te", "Vinos", "Espumantes", "Barra"],
      };
    }

    function renderOperationalOptionInputs(eventData = {}) {
      const options = getOperationalOptions();
      renderCheckGroup("service-options", "serviceType", options.services || [], eventData.serviceType || "");
      renderCheckGroup("moment-options", "eventMoments", options.moments || [], eventData.eventMoments || "");
      renderDrinkChips(eventData.drinkType || "");
      document.getElementById("drink-option-suggestions").innerHTML = (options.drinks || [])
        .map((item) => `<option value="${escapeAttribute(item)}"></option>`)
        .join("");
    }

    function renderCheckGroup(containerId, fieldName, options, selectedText) {
      const selected = new Set(String(selectedText || "").split(",").map((item) => normalizeSearch(item)).filter(Boolean));
      document.getElementById(containerId).innerHTML = (options || []).map((option) => {
        const checked = selected.has(normalizeSearch(option));
        return `<label class="check-item"><input type="checkbox" data-field="${escapeAttribute(fieldName)}" value="${escapeAttribute(option)}" ${checked ? "checked" : ""}> ${escapeHtml(option)}</label>`;
      }).join("");
    }

    function getCheckedOptionText(fieldName) {
      return Array.from(document.querySelectorAll(`input[data-field="${fieldName}"]:checked`))
        .map((input) => input.value)
        .filter(Boolean)
        .join(", ");
    }

    function renderDrinkChips(selectedText = "") {
      const values = String(selectedText || "").split(",").map((item) => item.trim()).filter(Boolean);
      const container = document.getElementById("drink-options");
      container.innerHTML = `
        <div id="drink-chip-list" style="display:contents;">
          ${values.map((item) => renderDrinkChip(item)).join("")}
        </div>
        <input id="drink-chip-input" class="chip-input" list="drink-option-suggestions" placeholder="Escribir bebida y Enter">
      `;
      const input = document.getElementById("drink-chip-input");
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addDrinkChip(input.value);
        input.value = "";
      });
    }

    function renderDrinkChip(value) {
      return `<span class="chip" data-drink="${escapeAttribute(value)}">${escapeHtml(value)} <button type="button" onclick="removeDrinkChip(this)">x</button></span>`;
    }

    function addDrinkChip(value) {
      const clean = String(value || "").trim();
      if (!clean) return;
      const current = getDrinkChips().map((item) => normalizeSearch(item));
      if (current.includes(normalizeSearch(clean))) return;
      document.getElementById("drink-chip-list").insertAdjacentHTML("beforeend", renderDrinkChip(clean));
    }

    function removeDrinkChip(button) {
      button.closest(".chip")?.remove();
    }

    function getDrinkChips() {
      return Array.from(document.querySelectorAll("#drink-chip-list .chip"))
        .map((chip) => chip.dataset.drink || chip.textContent.replace("x", "").trim())
        .filter(Boolean);
    }

    function getDrinkChipsText() {
      const input = document.getElementById("drink-chip-input");
      if (input?.value.trim()) {
        addDrinkChip(input.value);
        input.value = "";
      }
      return getDrinkChips().join(", ");
    }

    function renderEventMenuLines(items = []) {
      const container = document.getElementById("event-menu-items");
      const list = Array.isArray(items) && items.length ? items : [{ name: "", detail: "" }];
      container.innerHTML = list.map((item) => renderEventMenuLine(item)).join("");
    }

    function renderEventMenuLine(item = {}) {
      const subItemsText = Array.isArray(item.subItems)
        ? item.subItems.map((subItem) => [subItem.name, subItem.detail].filter(Boolean).join(": ")).join("\n")
        : "";
      return `
        <div class="menu-line">
          <input class="event-menu-quantity" placeholder="Cantidad" value="${escapeAttribute(item.quantity || "")}">
          <input class="event-menu-name" placeholder="Item del menu" value="${escapeAttribute(item.name || "")}">
          <input class="event-menu-detail" placeholder="Detalle opcional" value="${escapeAttribute(item.detail || "")}">
          <input class="event-menu-category" placeholder="Categoria" value="${escapeAttribute(item.category || "")}">
          <input class="event-menu-suggestion" placeholder="Sugerencia" value="${escapeAttribute(item.suggestedQuantity || "")}">
          <textarea class="event-menu-subitems" placeholder="Subitems / variedades">${escapeHtml(subItemsText)}</textarea>
          <button class="reject" type="button" onclick="this.closest('.menu-line').remove()">x</button>
        </div>
      `;
    }

    function addEventMenuLine(item = {}) {
      document.getElementById("event-menu-items").insertAdjacentHTML("beforeend", renderEventMenuLine(item));
    }

    function getEventMenuItems() {
      return Array.from(document.querySelectorAll("#event-menu-items .menu-line"))
        .map((row) => ({
          quantity: row.querySelector(".event-menu-quantity")?.value.trim() || "",
          name: row.querySelector(".event-menu-name")?.value.trim() || "",
          detail: row.querySelector(".event-menu-detail")?.value.trim() || "",
          category: row.querySelector(".event-menu-category")?.value.trim() || "",
          suggestedQuantity: row.querySelector(".event-menu-suggestion")?.value.trim() || "",
          subItems: parseImportedMenuSubItems(row.querySelector(".event-menu-subitems")?.value || ""),
        }))
        .filter((item) => item.name || item.detail || item.quantity);
    }

    function getOperationalCategoryList() {
      return logisticsCategories.length ? logisticsCategories : operationalCategoryDefaults;
    }

    function renderEventOperationalChecklist(sheet = {}) {
      const container = document.getElementById("event-operational-checklist");
      if (!container) return;
      const categories = sheet.categories || {};
      container.innerHTML = getOperationalCategoryList().map((category) => {
        const items = Array.isArray(categories[category.id]) ? categories[category.id] : [];
        return `
          <section class="logistics-category event-operational-category" data-category-id="${escapeAttribute(category.id)}">
            <div class="logistics-category-head">
              <strong>${escapeHtml(category.label)}</strong>
              <button class="filter" type="button" onclick="addEventOperationalItem('${escapeAttribute(category.id)}')">Agregar item</button>
            </div>
            <div class="event-operational-items">
              ${items.length ? items.map(renderEventOperationalItem).join("") : `<div class="empty">Sin items cargados.</div>`}
            </div>
          </section>
        `;
      }).join("");
    }

    function renderEventOperationalItem(item = {}) {
      return `
        <div class="event-operational-row" data-item-id="${escapeAttribute(item.id || `item-${Date.now()}`)}">
          <input class="event-operational-checked" type="checkbox" ${item.checked ? "checked" : ""}>
          <input class="event-operational-text" placeholder="Item operativo" value="${escapeAttribute(item.text || "")}">
          <input class="event-operational-quantity" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}">
          <button class="reject icon-action" type="button" onclick="removeEventOperationalItem(this)">x</button>
        </div>
      `;
    }

    function addEventOperationalItem(categoryId) {
      const container = document.querySelector(`.event-operational-category[data-category-id="${CSS.escape(categoryId)}"] .event-operational-items`);
      if (!container) return;
      if (container.querySelector(".empty")) container.innerHTML = "";
      container.insertAdjacentHTML("beforeend", renderEventOperationalItem({ id: `item-${Date.now()}` }));
      container.lastElementChild?.querySelector(".event-operational-text")?.focus();
    }

    function removeEventOperationalItem(button) {
      const container = button.closest(".event-operational-items");
      button.closest(".event-operational-row")?.remove();
      if (container && !container.querySelector(".event-operational-row")) {
        container.innerHTML = `<div class="empty">Sin items cargados.</div>`;
      }
    }

    function collectEventOperationalSheet() {
      const eventId = document.getElementById("erp-event-form")?.elements.id.value || "";
      const existing = (erpData.events || []).find((item) => item.id === eventId)?.operationalSheet || {};
      const categories = {};
      for (const category of getOperationalCategoryList()) {
        categories[category.id] = Array.from(document.querySelectorAll(`.event-operational-category[data-category-id="${CSS.escape(category.id)}"] .event-operational-row`))
          .map((row) => ({
            id: row.dataset.itemId || `item-${Date.now()}`,
            text: row.querySelector(".event-operational-text")?.value.trim() || "",
            quantity: row.querySelector(".event-operational-quantity")?.value.trim() || "",
            checked: row.querySelector(".event-operational-checked")?.checked || false,
            owner: "",
            note: "",
            updatedAt: new Date().toISOString(),
          }))
          .filter((item) => item.text);
      }
      return { categories, deletedSeeds: existing.deletedSeeds || {}, postEventNotes: existing.postEventNotes || "", leftovers: existing.leftovers || [], updatedAt: new Date().toISOString() };
    }

    function suggestDietaryRestrictionItems() {
      const form = document.getElementById("erp-event-form");
      const field = form?.elements.dietaryRestrictions;
      if (!field) return;
      const current = field.value.trim();
      const menuItems = getEventMenuItems().map((item) => item.name).filter(Boolean);
      const suggestions = [];
      if (!current) suggestions.push("Sin TACC / celiacos", "Vegetariano", "Sin lactosa");
      if (menuItems.length) {
        suggestions.push(`Preparar alternativa identificada para: ${menuItems.slice(0, 3).join(", ")}`);
      }
      field.value = Array.from(new Set([current, ...suggestions].filter(Boolean))).join("; ");
      form.elements.dietaryRestrictionMode.value = "yes";
      showNotice("Sugerencias de restricciones agregadas al evento.");
    }

    function renderEventStockLines(items = []) {
      const container = document.getElementById("event-stock-items");
      const list = Array.isArray(items) && items.length ? items : [];
      container.innerHTML = list.map((item) => renderEventStockLine(item)).join("");
    }

    function renderEventStockLine(item = {}) {
      return `
        <div class="stock-line">
          <input class="event-stock-description" placeholder="Mercaderia usada de stock" value="${escapeAttribute(item.description || "")}">
          <input class="event-stock-quantity" inputmode="decimal" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}">
          <input class="event-stock-unit" inputmode="decimal" placeholder="$ unitario" value="${escapeAttribute(item.unitAmount || "")}">
          <button class="reject" type="button" onclick="this.closest('.stock-line').remove()">x</button>
        </div>
      `;
    }

    function addEventStockLine(item = {}) {
      document.getElementById("event-stock-items").insertAdjacentHTML("beforeend", renderEventStockLine(item));
    }

    function getEventStockItems() {
      return Array.from(document.querySelectorAll("#event-stock-items .stock-line"))
        .map((row) => {
          const quantity = parseDecimal(row.querySelector(".event-stock-quantity")?.value || 1) || 1;
          const unitAmount = parseDecimal(row.querySelector(".event-stock-unit")?.value || 0);
          return {
            description: row.querySelector(".event-stock-description")?.value.trim() || "",
            quantity,
            unitAmount,
            total: quantity * unitAmount,
          };
        })
        .filter((item) => item.description || item.total > 0);
    }

    async function addOperationalOptionFromPanel(type, inputId) {
      const input = document.getElementById(inputId);
      const value = input.value.trim();
      if (!value) return;
      const response = await fetch("/api/operational-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo agregar la opcion.", "error");
        return;
      }
      costSettings = result.settings || costSettings;
      input.value = "";
      renderOperationalOptionInputs({
        serviceType: getCheckedOptionText("serviceType"),
        eventMoments: getCheckedOptionText("eventMoments"),
        drinkType: getCheckedOptionText("drinkType"),
      });
      showNotice("Opcion agregada.");
    }

    function showQuickCustomerForm() {
      const form = document.getElementById("erp-event-form");
      const currentName = form.elements.clientName.value || "";
      document.getElementById("detail-title").textContent = "Crear cliente";
      document.getElementById("detail-subtitle").textContent = "Se asocia al evento que estas cargando.";
      document.getElementById("detail-fields").innerHTML = `
        <form class="form-grid quick-form" onsubmit="saveQuickCustomer(event)">
          <div class="form-field full">
            <label>Nombre</label>
            <input name="fullName" required value="${escapeAttribute(currentName)}">
          </div>
          <div class="form-field">
            <label>Telefono</label>
            <input name="displayPhone">
          </div>
          <div class="form-field">
            <label>Nombre de agenda</label>
            <input name="contactName">
          </div>
          <div class="form-field full">
            <label>Preferencias</label>
            <textarea name="preferences"></textarea>
          </div>
          <div class="form-field full">
            <label>Restricciones</label>
            <textarea name="dietaryRestrictions"></textarea>
          </div>
          <div class="actions full">
            <button class="approve" type="submit">Guardar cliente</button>
          </div>
        </form>
      `;
      document.getElementById("detail").classList.add("open");
    }

    async function saveQuickCustomer(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el cliente.", "error");
        return;
      }

      const customerName = result.customer.fullName || payload.fullName || "";
      document.getElementById("erp-event-form").elements.clientName.value = customerName;
      allCustomers = [result.customer, ...allCustomers.filter((customer) => customer.id !== result.customer.id)];
      renderErpCustomerOptions();
      hideDetail();
      showNotice("Cliente creado y asociado al evento.");
    }

    function showQuickVenueForm() {
      const form = document.getElementById("erp-event-form");
      const currentVenue = form.elements.venue.value || "";
      showVenueForm("", { name: currentVenue });
    }

    async function saveErpEvent(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const previousEvent = payload.id ? (erpData.events || []).find((item) => item.id === payload.id) : null;
      if (
        payload.status === "done" &&
        previousEvent &&
        !previousEvent.clientConformity?.fileName &&
        !previousEvent.conformityWaiver?.approved
      ) {
        const requestedByLogistics = hasCloseWithoutConformityRequest(previousEvent);
        const message = requestedByLogistics
          ? "Logistica solicito cerrar este evento sin conformidad. Desea autorizarlo y marcarlo como realizado?"
          : "Este evento no tiene conformidad adjunta. Desea autorizar el cierre sin conformidad y marcarlo como realizado?";
        if (!confirm(message)) return;
        payload.approveWithoutConformity = "true";
        payload.conformityWaiverReason = requestedByLogistics
          ? "Autorizado por administracion desde solicitud de logistica."
          : "Autorizado por administracion desde edicion del evento.";
      }
      const selectedVenue = (erpData.venues || []).find((venue) => (
        normalizeSearch(venue.name || "") === normalizeSearch(payload.venue || "")
      ));
      if (selectedVenue) {
        payload.venueAddress = selectedVenue.address || "";
        payload.venueReference = selectedVenue.reference || "";
        payload.latitude = selectedVenue.latitude ?? "";
        payload.longitude = selectedVenue.longitude ?? "";
        payload.mapLabel = selectedVenue.mapLabel || "";
      }
      payload.checklist = {
        purchases: event.target.elements.checklistPurchases.checked,
        production: event.target.elements.checklistProduction.checked,
        staff: event.target.elements.checklistStaff.checked,
        logistics: event.target.elements.checklistLogistics.checked,
        menu: event.target.elements.checklistMenu.checked,
        payments: event.target.elements.checklistPayments.checked,
      };
      payload.serviceType = getCheckedOptionText("serviceType");
      payload.eventMoments = getCheckedOptionText("eventMoments");
      payload.drinkType = getDrinkChipsText();
      payload.menuItems = getEventMenuItems();
      payload.selectedMenu = payload.menuItems.map((item) => [item.name, item.detail].filter(Boolean).join(" - ")).join(", ");
      payload.stockItems = getEventStockItems();
      payload.operationalSheet = collectEventOperationalSheet();
      const response = await fetch("/api/erp-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el evento.", "error");
        return;
      }

      showNotice("Evento guardado.", "success");
      resetErpEventForm();
      hideErpForms();
      await loadErp();
      await loadPurchaseOptions();
    }

    async function markErpEventDone(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;
      const today = new Date().toISOString().slice(0, 10);
      if (event.eventDate && event.eventDate > today) {
        showNotice("No se puede marcar como realizado un evento con fecha futura.", "error");
        return;
      }
      if (!event.clientConformity?.fileName && !event.conformityWaiver?.approved) {
        if (hasCloseWithoutConformityRequest(event)) {
          await approveLogisticsEventClose(id);
          return;
        }
        showNotice("Para cerrar el evento primero suba la conformidad del cliente en PDF.", "error");
        showEventOverview(id);
        return;
      }

      const response = await fetch("/api/erp-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, status: "done" }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo marcar el evento como realizado.", "error");
        return;
      }

      showNotice("Evento marcado como realizado.");
      await loadErp();
    }

    async function approveLogisticsEventClose(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;
      const withoutConformity = hasCloseWithoutConformityRequest(event);
      const message = withoutConformity
        ? `Autorizar el cierre SIN conformidad de ${event.name || "este evento"} y pasarlo a realizado?`
        : `Autorizar el cierre logistico de ${event.name || "este evento"} y pasarlo a realizado?`;
      if (!confirm(message)) return;

      const response = await fetch("/api/approve-logistics-event-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo autorizar el cierre.", "error");
        return;
      }

      showNotice(withoutConformity
        ? "Cierre sin conformidad autorizado. Evento marcado como realizado."
        : "Cierre logistico autorizado. Evento marcado como realizado.", "success");
      await loadErp();
      if (canAccessTab("logistics_event")) await loadLogisticsEvents();
    }

    function editErpEvent(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!event) return;
      showErpEventForm();
      const form = document.getElementById("erp-event-form");
      ["id", "name", "clientName", "eventDate", "eventTime", "guestCount", "priceMode", "pricePerPerson", "servicePriceTotal", "status", "invoiceRequirement", "invoiceStatus", "invoiceNumber", "owner", "role", "venue", "assistanceMode", "waiterCount", "dietaryRestrictionMode", "dietaryRestrictions", "includesDrinks", "tableware", "tablewareQuantities", "tablewareDetail", "largeContainers", "smallContainers", "staff", "schedule", "nextAction", "notes", "checklistDetails"]
        .forEach((field) => setFormValue(form, field, event[field] || ""));
      if (!form.elements.invoiceRequirement.value) form.elements.invoiceRequirement.value = "invoice_required";
      toggleEventInvoiceFields(form);
      renderOperationalOptionInputs(event);
      renderEventMenuLines(getEditableEventMenuItems(event));
      renderEventStockLines(event.stockItems || []);
      renderEventOperationalChecklist(event.operationalSheet || {});
      form.elements.checklistPurchases.checked = Boolean(event.checklist?.purchases);
      form.elements.checklistProduction.checked = Boolean(event.checklist?.production);
      form.elements.checklistStaff.checked = Boolean(event.checklist?.staff);
      form.elements.checklistLogistics.checked = Boolean(event.checklist?.logistics);
      form.elements.checklistMenu.checked = Boolean(event.checklist?.menu);
      form.elements.checklistPayments.checked = Boolean(event.checklist?.payments);
    }

    function resetErpEventForm() {
      document.getElementById("erp-event-form").reset();
      document.getElementById("erp-event-form").elements.id.value = "";
      document.getElementById("erp-event-form").elements.priceMode.value = "total";
      document.getElementById("erp-event-form").elements.invoiceRequirement.value = "invoice_required";
      toggleEventInvoiceFields(document.getElementById("erp-event-form"));
      renderOperationalOptionInputs();
      renderEventMenuLines();
      renderEventStockLines();
      renderEventOperationalChecklist();
    }

    async function deleteErpEvent(id) {
      const event = (erpData.events || []).find((item) => item.id === id);
      if (!confirm(`Desea eliminar el evento ${event?.name || ""}?`)) return;
      const response = await fetch("/api/delete-erp-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el evento.", "error");
        return;
      }

      showNotice("Evento eliminado.", "success");
      await loadErp();
    }

    function startErpQuoteForEvent(eventId) {
      resetErpQuoteForm();
      renderErpQuoteEventOptions(eventId);
      showErpQuoteForm();
      updateErpQuotePreview();
    }

    async function startErpQuoteFromMenu(eventId) {
      const event = (erpData.events || []).find((item) => item.id === eventId);
      if (!event) return;
      if (!allRecipes.length) {
        await loadRecipes();
      }

      resetErpQuoteForm();
      renderErpQuoteEventOptions(eventId);
      const form = document.getElementById("erp-quote-form");
      setFormValue(form, "eventId", eventId);
      setFormValue(form, "priceTotal", event.servicePriceTotal || event.quoteTotal || "");
      document.getElementById("erp-quote-lines").innerHTML = "";
      erpQuoteLineCounter = 0;

      const matched = new Map();
      const unmatched = [];
      getKitchenChecklistItems(event).forEach((item) => {
        const recipe = findRecipeForKitchenItem(item);
        const quantity = parseKitchenQuantityNumber(item.quantity);
        if (recipe && quantity > 0) {
          const current = matched.get(recipe.id) || { recipeId: recipe.id, name: recipe.name, quantity: 0 };
          current.quantity += normalizeRecipeProductionQuantity(quantity, recipe.yieldUnit || "unidad");
          matched.set(recipe.id, current);
        } else {
          unmatched.push(`${item.name}${item.quantity ? ` (${item.quantity})` : ""}`);
        }
      });

      const lines = Array.from(matched.values());
      if (lines.length) {
        lines.forEach((line) => addErpQuoteLine(line));
      } else {
        addErpQuoteLine();
      }

      const notes = [
        lines.length ? `Presupuesto iniciado desde cantidades de menu: ${lines.length} receta(s) vinculada(s).` : "No se encontraron recetas vinculadas al menu.",
        unmatched.length ? `Revisar manualmente: ${unmatched.join("; ")}` : "",
      ].filter(Boolean).join("\n");
      setFormValue(form, "notes", notes);
      showErpQuoteForm();
      updateErpQuotePreview();
      showNotice(lines.length
        ? `Presupuesto iniciado con ${lines.length} receta(s). Revise cantidades antes de guardar.`
        : "No encontre recetas cargadas para ese menu; deje el presupuesto listo para completar.",
        lines.length ? "success" : "error");
    }

    function findRecipeForKitchenItem(item) {
      const target = normalizeRecipeMatchText([item.name, item.detail].join(" "));
      if (!target) return null;
      let best = null;
      let bestScore = 0;
      (allRecipes || []).forEach((recipe) => {
        const recipeKey = normalizeRecipeMatchText(recipe.name || "");
        if (!recipeKey) return;
        let score = 0;
        if (target === recipeKey) score = 100;
        else if (target.includes(recipeKey) || recipeKey.includes(target)) score = 85;
        else {
          const targetTokens = getRecipeMatchTokens(target);
          const recipeTokens = getRecipeMatchTokens(recipeKey);
          const overlap = recipeTokens.filter((token) => targetTokens.includes(token)).length;
          score = overlap ? overlap * 18 : 0;
        }
        if (score > bestScore) {
          bestScore = score;
          best = recipe;
        }
      });
      return bestScore >= 36 ? best : null;
    }

    function normalizeRecipeMatchText(value) {
      return normalizeSearch(value || "")
        .replace(/\b(finger|food|unidad|unidades|aprox|porcion|porciones|cazuela|cazuelas|menu|variedad|detalle|mini)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getRecipeMatchTokens(value) {
      const ignored = new Set(["con", "sin", "para", "del", "las", "los", "una", "uno", "por", "sobre", "base"]);
      return normalizeRecipeMatchText(value)
        .split(" ")
        .filter((token) => token.length > 2 && !ignored.has(token));
    }

    function addErpQuoteLine(item = {}) {
      const row = document.createElement("div");
      row.className = "erp-quote-line";
      row.dataset.lineId = `erp-quote-line-${++erpQuoteLineCounter}`;
      row.innerHTML = `
        <select class="erp-line-recipe">
          <option value="">Receta</option>
          ${(allRecipes || []).map((recipe) => `<option value="${escapeAttribute(recipe.id)}" ${item.recipeId === recipe.id ? "selected" : ""}>${escapeHtml(recipe.name)}</option>`).join("")}
        </select>
        <input class="erp-line-quantity" inputmode="decimal" placeholder="Cantidad" value="${escapeAttribute(item.quantity || "")}">
        <button class="reject icon-action" type="button" onclick="removeErpQuoteLine(this)">X</button>
      `;
      document.getElementById("erp-quote-lines").appendChild(row);
      row.querySelector(".erp-line-recipe").addEventListener("change", updateErpQuotePreview);
      row.querySelector(".erp-line-quantity").addEventListener("input", updateErpQuotePreview);
      updateErpQuotePreview();
    }

    function removeErpQuoteLine(button) {
      button.closest(".erp-quote-line").remove();
      if (!document.querySelector("#erp-quote-lines .erp-quote-line")) {
        addErpQuoteLine();
      }
      updateErpQuotePreview();
    }

    function getErpQuotePayload() {
      const form = document.getElementById("erp-quote-form");
      const event = (erpData.events || []).find((item) => item.id === form.elements.eventId.value);
      const recipes = Array.from(document.querySelectorAll("#erp-quote-lines .erp-quote-line"))
        .map((row) => {
          const recipe = (allRecipes || []).find((item) => item.id === row.querySelector(".erp-line-recipe").value);
          const quantity = normalizeRecipeProductionQuantity(row.querySelector(".erp-line-quantity").value, recipe?.yieldUnit || "unidad");
          if (!recipe || !quantity) return null;
          return {
            recipeId: recipe.id,
            name: recipe.name,
            quantity,
            unitCost: recipe.costPerPortion || 0,
            totalCost: (recipe.costPerPortion || 0) * quantity,
          };
        })
        .filter(Boolean);

      return {
        ...Object.fromEntries(new FormData(form).entries()),
        manualPrice: form.elements.priceTotal.value,
        eventName: event?.name || "",
        clientName: event?.clientName || "",
        guestCount: event?.guestCount || "",
        recipes,
      };
    }

    function calculateErpQuotePreview() {
      const payload = getErpQuotePayload();
      const recipeCost = payload.recipes.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
      const staffCost = parseDecimal(payload.staffCost || 0);
      const logisticsCost = parseDecimal(payload.logisticsCost || 0);
      const tablewareCost = parseDecimal(payload.tablewareCost || 0);
      const extraCost = parseDecimal(payload.extraCost || 0);
      const cost = recipeCost + staffCost + logisticsCost + tablewareCost + extraCost;
      const targetMargin = Math.min(95, Math.max(0, parseDecimal(payload.targetMarginPercent || 35)));
      const manualPrice = parseDecimal(payload.priceTotal || 0);
      const suggestedPrice = targetMargin >= 95 ? cost : cost / (1 - targetMargin / 100);
      const subtotal = manualPrice > 0 ? manualPrice : suggestedPrice;
      const discountPercent = Math.max(0, parseDecimal(payload.discountPercent || 0));
      const discountAmount = Math.max(0, parseDecimal(payload.discountAmount || 0)) || subtotal * (discountPercent / 100);
      const taxableSubtotal = Math.max(0, subtotal - discountAmount);
      const taxRate = Math.max(0, parseDecimal(payload.taxRate || 0));
      const price = taxableSubtotal + taxableSubtotal * taxRate;
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      return { cost, price, margin };
    }

    function updateErpQuotePreview() {
      const preview = calculateErpQuotePreview();
      document.getElementById("erp-quote-cost").textContent = formatCurrency(preview.cost);
      document.getElementById("erp-quote-price").textContent = formatCurrency(preview.price);
      document.getElementById("erp-quote-margin").textContent = formatPercent(preview.margin);
    }

    async function saveErpQuote(event) {
      event.preventDefault();
      const payload = getErpQuotePayload();
      if (!payload.eventId) {
        showNotice("Seleccione el evento del presupuesto.", "error");
        return;
      }
      const response = await fetch("/api/erp-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el presupuesto.", "error");
        return;
      }

      showNotice("Presupuesto guardado.", "success");
      resetErpQuoteForm();
      hideErpForms();
      await loadErp();
    }

    function editErpQuote(id) {
      const quote = (erpData.quotes || []).find((item) => item.id === id);
      if (!quote) return;
      showErpQuoteForm();
      const form = document.getElementById("erp-quote-form");
      ["id", "status", "targetMarginPercent", "validUntil", "staffCost", "logisticsCost", "extraCost", "notes"]
        .forEach((field) => setFormValue(form, field, quote[field] || ""));
      ["version", "tablewareCost", "discountPercent", "discountAmount", "taxRate"]
        .forEach((field) => setFormValue(form, field, quote[field] || ""));
      setFormValue(form, "priceTotal", quote.manualPrice || "");
      renderErpQuoteEventOptions(quote.eventId || "");
      document.getElementById("erp-quote-lines").innerHTML = "";
      erpQuoteLineCounter = 0;
      (quote.recipes?.length ? quote.recipes : [{}]).forEach((line) => addErpQuoteLine(line));
      updateErpQuotePreview();
    }

    function resetErpQuoteForm() {
      const form = document.getElementById("erp-quote-form");
      form.reset();
      form.elements.id.value = "";
      form.elements.targetMarginPercent.value = "35";
      form.elements.staffCost.value = "0";
      form.elements.logisticsCost.value = "0";
      form.elements.tablewareCost.value = "0";
      form.elements.extraCost.value = "0";
      form.elements.discountPercent.value = "0";
      form.elements.discountAmount.value = "0";
      form.elements.taxRate.value = "0";
      form.elements.validUntil.value = "";
      renderErpQuoteEventOptions();
      document.getElementById("erp-quote-lines").innerHTML = "";
      erpQuoteLineCounter = 0;
      addErpQuoteLine();
      updateErpQuotePreview();
    }

    function downloadProposalText() {
      const id = document.getElementById("erp-quote-form").elements.id.value;
      if (!id) {
        showNotice("Guarde el presupuesto antes de descargar la propuesta.", "error");
        return;
      }
      window.location.href = `/api/proposal.txt?quoteId=${encodeURIComponent(id)}`;
    }

    async function deleteErpQuote(id) {
      const quote = (erpData.quotes || []).find((item) => item.id === id);
      if (!confirm(`Desea eliminar el presupuesto de ${quote?.eventName || "este evento"}?`)) return;
      const response = await fetch("/api/delete-erp-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el presupuesto.", "error");
        return;
      }

      showNotice("Presupuesto eliminado.", "success");
      await loadErp();
    }

    function getErpEventStatusLabel(status) {
      return {
        lead: "Consulta",
        quoted: "Presupuestado",
        confirmed: "Confirmado",
        production: "Produccion",
        done: "Finalizado",
        lost: "Perdido",
        cancelled: "Cancelado",
      }[status] || status;
    }

    function getErpQuoteStatusLabel(status) {
      return {
        draft: "Borrador",
        sent: "Enviado",
        negotiation: "Negociacion",
        accepted: "Aceptado",
        rejected: "Rechazado",
      }[status] || status;
    }

    async function loadCustomers() {
      const response = await fetch("/api/customers");
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudieron cargar los clientes.", "error");
        return;
      }

      allCustomers = result.customers || [];
      renderCustomers();
    }

    function renderCustomers() {
      const term = normalizeSearch(document.getElementById("customer-search").value);
      const filtered = allCustomers.filter((customer) => {
        const searchable = [
          customer.fullName,
          customer.displayPhone,
          customer.contactName,
          customer.lastEventType,
          customer.notes,
        ].join(" ");
        return normalizeSearch(searchable).includes(term);
      });

      const list = document.getElementById("customer-list");
      if (!filtered.length) {
        list.innerHTML = `<div class="empty">Todavia no hay clientes guardados.</div>`;
        return;
      }

      list.innerHTML = filtered.map((customer) => `
        <article class="compact-item">
          <div class="provider-card-head">
            <div>
              <div class="primary">${escapeHtml(customer.fullName || customer.contactName || "Sin nombre")}</div>
              <div class="secondary">${escapeHtml(customer.displayPhone || "Telefono pendiente")}</div>
            </div>
            <button class="menu-dot" type="button" onclick="showCustomerActions('${escapeAttribute(customer.id)}')">...</button>
          </div>
          <div class="secondary">${escapeHtml(customer.lastEventType ? `Ultimo evento: ${customer.lastEventType}` : "")}</div>
          <div class="recipe-summary" style="margin-top:10px;">
            <div><span>Eventos</span><strong>${escapeHtml(customer.events?.length || 0)}</strong></div>
            <div><span>Presupuestos</span><strong>${escapeHtml(customer.quoteCount || customer.budgetCount || 0)}</strong></div>
            <div><span>Cierre</span><strong>${formatPercent(customer.closeRate || 0)}</strong></div>
          </div>
          <div class="secondary" style="margin-top:8px;">Venta aceptada: ${formatCurrency(customer.totalRevenue || 0)}</div>
        </article>
      `).join("");
    }

    function showCustomerActions(id) {
      const customer = allCustomers.find((item) => item.id === id);
      if (!customer) return;
      document.getElementById("detail-title").textContent = customer.fullName || customer.contactName || "Cliente";
      document.getElementById("detail-subtitle").textContent = customer.displayPhone || "Telefono pendiente";
      document.getElementById("detail-fields").innerHTML = `
        ${field("Eventos", customer.events?.length || 0)}
        ${field("Presupuestos", customer.quoteCount || customer.budgetCount || 0)}
        ${field("Tasa de cierre", formatPercent(customer.closeRate || 0))}
        <div class="actions" style="margin-top:12px;">
          <button class="approve" type="button" onclick="editCustomer('${escapeAttribute(customer.id)}'); document.getElementById('detail').classList.remove('open');">Editar cliente</button>
          <button class="filter" type="button" onclick="showCustomerInsight('${escapeAttribute(customer.id)}')">Ver historial</button>
          <button class="reject" type="button" onclick="deleteCustomer('${escapeAttribute(customer.id)}'); document.getElementById('detail').classList.remove('open');">Eliminar</button>
        </div>
      `;
      document.getElementById("detail").classList.add("open");
    }

    function showCustomerInsight(id) {
      const customer = allCustomers.find((item) => item.id === id);
      if (!customer) return;
      document.getElementById("detail-title").textContent = customer.fullName || customer.contactName || "Cliente";
      document.getElementById("detail-subtitle").textContent = customer.displayPhone || "";
      document.getElementById("detail-fields").innerHTML = `
        ${field("Tasa de cierre", formatPercent(customer.closeRate || 0))}
        ${field("Venta aceptada", formatCurrency(customer.totalRevenue || 0))}
        <div class="form-field full"><label>Eventos</label>${renderCustomerHistoryCards(customer.events || [], "event")}</div>
        <div class="form-field full"><label>Presupuestos</label>${renderCustomerHistoryCards(customer.quotes || [], "quote")}</div>
        ${field("Preferencias", customer.preferences || "Sin preferencias")}
        ${field("Restricciones", customer.dietaryRestrictions || "Sin restricciones")}
        ${field("Notas", customer.notes || "Sin notas")}
      `;
      document.getElementById("detail").classList.add("open");
    }

    function renderCustomerHistoryCards(items, type) {
      if (!items.length) return `<div class="empty">Sin registros.</div>`;
      return items.map((item) => `
        <article class="customer-history-card">
          <strong>${escapeHtml(type === "event" ? item.name : item.eventName || "Presupuesto")}</strong>
          <div class="secondary">${escapeHtml(type === "event" ? formatShortDate(item.eventDate) || "Sin fecha" : `${item.version || ""} ${getErpQuoteStatusLabel(item.status)}`)}</div>
          ${type === "quote" ? `<div class="secondary">${formatCurrency(item.priceTotal || 0)}</div>` : ""}
        </article>
      `).join("");
    }

    async function deleteCustomer(id) {
      const customer = allCustomers.find((item) => item.id === id);
      if (!confirm(`Desea eliminar el cliente ${customer?.fullName || ""}?`)) return;
      const response = await fetch("/api/delete-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el cliente.", "error");
        return;
      }
      allCustomers = result.customers || allCustomers.filter((item) => item.id !== id);
      renderCustomers();
      renderErpCustomerOptions();
      showNotice("Cliente eliminado.");
    }

    function editCustomer(id) {
      const customer = allCustomers.find((item) => item.id === id);
      if (!customer) return;
      const form = document.getElementById("customer-form");
      setFormValue(form, "id", customer.id || "");
      setFormValue(form, "fullName", customer.fullName || "");
      setFormValue(form, "displayPhone", customer.displayPhone || "");
      setFormValue(form, "contactName", customer.contactName || "");
      setFormValue(form, "preferences", customer.preferences || "");
      setFormValue(form, "dietaryRestrictions", customer.dietaryRestrictions || "");
      setFormValue(form, "notes", customer.notes || "");
    }

    async function saveCustomer(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el cliente.", "error");
        return;
      }

      event.target.reset();
      await loadCustomers();
      await loadState();
      showNotice("Cliente guardado correctamente.");
    }

    async function loadProviders() {
      const response = await fetch("/api/providers");
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudieron cargar los proveedores.", "error");
        return;
      }

      allProviders = result.providers || [];
      renderProviders();
      renderProviderManagerModal();
    }

    async function showProviderManagerWindow() {
      document.getElementById("purchase-rank-title").textContent = "Administrar proveedores";
      document.getElementById("purchase-rank-subtitle").textContent = "Datos fiscales, contacto y cuenta bancaria";
      document.getElementById("purchase-rank-body").innerHTML = renderProviderManagerHtml();
      document.getElementById("purchase-rank-detail").classList.add("open");
      await loadProviders();
      renderProviderManagerModal();
    }

    function renderProviderManagerHtml() {
      return `
        <div class="panel-grid">
          <section class="panel-box">
            <div class="toolbar-actions" style="justify-content:space-between;margin-bottom:12px;">
              <input id="modal-provider-search" class="search" placeholder="Buscar proveedor, CUIT, banco o alias" oninput="renderProviderManagerModal()">
              <button class="filter" type="button" onclick="loadProviders()">Actualizar</button>
            </div>
            <div id="modal-provider-list" class="compact-list provider-list"></div>
          </section>
          <section class="panel-box">
            <h2 style="margin-top:0;font-size:20px;">Ficha de proveedor</h2>
            <form id="modal-provider-form" class="form-grid" onsubmit="saveProviderFromModal(event)">
              <input type="hidden" name="id">
              <div class="form-field full"><label>Nombre comercial</label><input name="name" required></div>
              <div class="form-field full"><label>Razon social</label><input name="legalName"></div>
              <div class="form-field"><label>CUIT</label><input name="cuit" placeholder="20-00000000-0"></div>
              <div class="form-field"><label>Condicion IVA</label><select name="ivaCondition"><option value="">Sin definir</option><option>Responsable Inscripto</option><option>Monotributo</option><option>Exento</option><option>Consumidor Final</option></select></div>
              <div class="form-field"><label>Contacto</label><input name="contactName"></div>
              <div class="form-field"><label>Telefono</label><input name="phone"></div>
              <div class="form-field"><label>Email</label><input name="email" type="email"></div>
              <div class="form-field"><label>Categoria</label><input name="category" placeholder="Carnes, verduras, logistica"></div>
              <div class="form-field full"><label>Direccion</label><input name="address"></div>
              <div class="form-field"><label>Banco</label><input name="bankName"></div>
              <div class="form-field"><label>Tipo de cuenta</label><input name="bankAccountType" placeholder="CC, CA, billetera"></div>
              <div class="form-field"><label>Nro cuenta</label><input name="bankAccountNumber"></div>
              <div class="form-field"><label>Titular</label><input name="bankAccountHolder"></div>
              <div class="form-field"><label>CBU / CVU</label><input name="cbu"></div>
              <div class="form-field"><label>Alias</label><input name="alias"></div>
              <div class="form-field"><label>Condicion de pago</label><input name="paymentTerms" placeholder="Contado, 7 dias, mensual"></div>
              <div class="form-field full"><label>Notas</label><textarea name="notes"></textarea></div>
              <div class="actions full">
                <button class="approve" type="submit">Guardar proveedor</button>
                <button class="filter" type="button" onclick="resetModalProviderForm()">Nuevo</button>
              </div>
            </form>
          </section>
        </div>
      `;
    }

    function renderProviderManagerModal() {
      const list = document.getElementById("modal-provider-list");
      if (!list) return;
      const term = normalizeSearch(document.getElementById("modal-provider-search")?.value || "");
      const filtered = allProviders.filter((provider) => normalizeSearch([
        provider.name,
        provider.legalName,
        provider.cuit,
        provider.ivaCondition,
        provider.bankName,
        provider.cbu,
        provider.alias,
      ].join(" ")).includes(term));
      list.innerHTML = filtered.length ? filtered.map((provider) => `
        <article class="provider-card">
          <div class="provider-card-head">
            <div>
              <div class="provider-title">${escapeHtml(provider.name || "Sin nombre")}</div>
              <div class="provider-meta">${escapeHtml(provider.legalName || "Razon social pendiente")}</div>
              <div class="provider-meta">${escapeHtml([provider.cuit, provider.ivaCondition].filter(Boolean).join(" · ") || "Datos fiscales pendientes")}</div>
            </div>
            <button class="menu-dot" type="button" onclick="editProviderInModal('${escapeAttribute(provider.id)}')">...</button>
          </div>
          <div class="provider-meta">${escapeHtml([provider.bankName, provider.alias || provider.cbu].filter(Boolean).join(" · ") || "Datos bancarios pendientes")}</div>
        </article>
      `).join("") : `<div class="empty">No hay proveedores para ese filtro.</div>`;
    }

    function editProviderInModal(id) {
      const provider = allProviders.find((item) => item.id === id);
      const form = document.getElementById("modal-provider-form");
      if (!provider || !form) return;
      fillProviderForm(form, provider);
    }

    function resetModalProviderForm() {
      const form = document.getElementById("modal-provider-form");
      form?.reset();
      if (form?.elements.id) form.elements.id.value = "";
    }

    async function saveProviderFromModal(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el proveedor.", "error");
        return;
      }
      allProviders = result.providers || allProviders;
      renderProviderManagerModal();
      renderProviders();
      await loadPurchaseOptions();
      showNotice("Proveedor guardado correctamente.");
    }

    function renderProviders() {
      const term = normalizeSearch(document.getElementById("provider-search").value);
      const filtered = allProviders.filter((provider) => normalizeSearch([
        provider.name,
        provider.legalName,
        provider.cuit,
        provider.ivaCondition,
        provider.contactName,
        provider.phone,
        provider.email,
        provider.bankName,
        provider.cbu,
        provider.alias,
        provider.category,
        provider.notes,
      ].join(" ")).includes(term));

      const list = document.getElementById("provider-list");
      if (!filtered.length) {
        list.innerHTML = `<div class="empty">Todavia no hay proveedores para mostrar.</div>`;
        return;
      }

      list.innerHTML = filtered.map((provider) => `
        <article class="provider-card" onclick="editProvider('${escapeAttribute(provider.id)}')">
          <div class="provider-card-head">
            <div>
              <div class="provider-title">${escapeHtml(provider.name || "Sin nombre")}</div>
              <div class="provider-meta">${escapeHtml(provider.legalName || "Razon social pendiente")}</div>
              <div class="provider-meta">${escapeHtml([provider.cuit, provider.ivaCondition].filter(Boolean).join(" · ") || "Datos fiscales pendientes")}</div>
            </div>
            <button class="menu-dot" type="button" onclick="event.stopPropagation(); editProvider('${escapeAttribute(provider.id)}')">...</button>
          </div>
          <div class="provider-stats">
            <div class="provider-stat"><span>Compras</span><strong>${escapeHtml(provider.purchaseCount || 0)}</strong></div>
            <div class="provider-stat"><span>Total comprado</span><strong>${formatCurrency(provider.totalPurchased || 0)}</strong></div>
            <div class="provider-stat"><span>Ultima compra</span><strong>${escapeHtml(formatShortDate(provider.lastPurchaseDate) || "Sin fecha")}</strong></div>
          </div>
          <div class="provider-meta"><strong>Banco:</strong> ${escapeHtml([provider.bankName, provider.alias || provider.cbu, provider.bankAccountHolder].filter(Boolean).join(" · ") || "Datos bancarios pendientes")}</div>
          <div class="provider-meta"><strong>Contacto:</strong> ${escapeHtml([provider.contactName, provider.phone, provider.email].filter(Boolean).join(" · ") || "Contacto pendiente")}</div>
        </article>
      `).join("");
    }

    function editProvider(id) {
      const provider = allProviders.find((item) => item.id === id);
      if (!provider) return;
      const form = document.getElementById("provider-form");
      fillProviderForm(form, provider);
    }

    function fillProviderForm(form, provider) {
      [
        "id",
        "name",
        "legalName",
        "cuit",
        "ivaCondition",
        "contactName",
        "phone",
        "email",
        "address",
        "bankName",
        "bankAccountType",
        "bankAccountNumber",
        "bankAccountHolder",
        "cbu",
        "alias",
        "paymentTerms",
        "category",
        "notes",
      ].forEach((field) => setFormValue(form, field, provider[field] || ""));
    }

    function resetProviderForm() {
      document.getElementById("provider-form").reset();
      document.getElementById("provider-form").elements.id.value = "";
    }

    async function saveProvider(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el proveedor.", "error");
        return;
      }

      allProviders = result.providers || allProviders;
      renderProviders();
      if (result.provider) fillProviderForm(event.target, result.provider);
      await loadPurchaseOptions();
      showNotice("Proveedor guardado correctamente.");
    }

    async function deleteSelectedProvider() {
      const form = document.getElementById("provider-form");
      const id = form.elements.id.value;
      const provider = allProviders.find((item) => item.id === id);
      if (!id || !provider) {
        showNotice("Seleccione un proveedor para eliminar.", "error");
        return;
      }

      if (!confirm(`Eliminar proveedor ${provider.name}?`)) return;

      const response = await fetch("/api/delete-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el proveedor.", "error");
        return;
      }

      allProviders = result.providers || [];
      resetProviderForm();
      renderProviders();
      showNotice("Proveedor eliminado.");
    }

    async function saveCostSettings(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      const response = await fetch("/api/cost-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el valor hora.", "error");
        return;
      }

      costSettings = result.settings || costSettings;
      await loadRecipes();
      hideRecipeForm();
      showNotice("Configuracion operativa actualizada.");
    }

    function showCostSettingsForm() {
      if (!canSeeRecipeCosts()) {
        showNotice("El rol cocinero no puede acceder a costos.", "error");
        return;
      }
      document.getElementById("recipe-editor-title").textContent = "Costos generales";
      document.getElementById("recipe-editor-subtitle").textContent = "Valores base usados para calcular costos de personal.";
      document.getElementById("cost-settings-card").classList.remove("hidden");
      document.getElementById("recipe-form-card").classList.add("hidden");
      setFormValue(document.getElementById("cost-settings-form"), "supplyProfilesText", supplyProfilesToText());
      setFormValue(document.getElementById("cost-settings-form"), "operationalOptionsText", operationalOptionsToText());
      document.getElementById("recipe-editor-modal").classList.add("open");
    }

    function showRecipeForm(recipe = null) {
      document.getElementById("recipe-editor-title").textContent = recipe?.id ? "Editar receta" : "Cargar receta";
      document.getElementById("recipe-editor-subtitle").textContent = "Carga de receta, procesos, mermas e ingredientes.";
      document.getElementById("cost-settings-card").classList.add("hidden");
      document.getElementById("recipe-form-card").classList.remove("hidden");
      resetRecipeForm(recipe || {});
      document.getElementById("recipe-editor-modal").classList.add("open");
    }

    function hideRecipeForm() {
      document.getElementById("recipe-editor-modal").classList.remove("open");
    }

    function closeRecipeForm(event) {
      if (event.target.id === "recipe-editor-modal") {
        hideRecipeForm();
      }
    }

    async function showBudgetBuilder() {
      if (!canSeeRecipeCosts()) {
        showNotice("El rol cocinero no puede acceder a costos ni presupuestos.", "error");
        return;
      }
      await loadRecipes();
      document.getElementById("budget-builder").classList.add("open");
      document.getElementById("budget-recipe-rows").innerHTML = "";
      budgetRecipeCounter = 0;
      addBudgetRecipeRow();
      updateBudgetBuilder();
    }

    function hideBudgetBuilder() {
      document.getElementById("budget-builder").classList.remove("open");
    }

    function closeBudgetBuilder(event) {
      if (event.target.id === "budget-builder") {
        hideBudgetBuilder();
      }
    }

    function addBudgetRecipeRow(item = {}) {
      const id = `budget-recipe-${++budgetRecipeCounter}`;
      const row = document.createElement("div");
      row.className = "budget-recipe-row";
      row.innerHTML = `
        <select class="budget-recipe-select">
          <option value="">Seleccionar receta</option>
          ${allRecipes.map((recipe) => `<option value="${escapeAttribute(recipe.id)}" ${item.recipeId === recipe.id ? "selected" : ""}>${escapeHtml(recipe.name)}</option>`).join("")}
        </select>
        <input class="budget-recipe-quantity" inputmode="decimal" placeholder="Cantidad" value="${escapeAttribute(item.quantity || "")}">
        <button class="reject icon-action" type="button" onclick="removeBudgetRecipeRow(this)">X</button>
      `;
      document.getElementById("budget-recipe-rows").appendChild(row);
      row.querySelector(".budget-recipe-select").addEventListener("change", updateBudgetBuilder);
      row.querySelector(".budget-recipe-quantity").addEventListener("input", updateBudgetBuilder);
      updateBudgetBuilder();
    }

    function removeBudgetRecipeRow(button) {
      const rows = document.querySelectorAll("#budget-recipe-rows .budget-recipe-row");
      if (rows.length <= 1) return;
      button.closest(".purchase-item").remove();
      updateBudgetBuilder();
    }

    function updateBudgetBuilder() {
      const selections = getBudgetSelections();
      const totals = selections.reduce((acc, selection) => {
        acc.total += selection.cost;
        acc.labor += selection.laborCost;
        return acc;
      }, { total: 0, labor: 0 });
      const food = totals.total - totals.labor;

      document.getElementById("budget-food-total").textContent = formatCurrency(food);
      document.getElementById("budget-labor-total").textContent = formatCurrency(totals.labor);
      document.getElementById("budget-total").textContent = formatCurrency(totals.total);
      document.getElementById("budget-breakdown").innerHTML = renderBudgetBreakdown(selections);
    }

    function getBudgetSelections() {
      return Array.from(document.querySelectorAll("#budget-recipe-rows .budget-recipe-row"))
        .map((row) => {
          const recipe = allRecipes.find((item) => item.id === row.querySelector(".budget-recipe-select").value);
          const quantity = normalizeRecipeProductionQuantity(row.querySelector(".budget-recipe-quantity").value, recipe?.yieldUnit || "unidad");
          if (!recipe || !quantity) return null;
          const factor = quantity / parseDecimal(recipe.portions || 1);
          return {
            recipe,
            quantity,
            factor,
            cost: recipe.costPerPortion * quantity,
            laborCost: (recipe.laborCost || 0) * factor,
          };
        })
        .filter(Boolean);
    }

    function renderBudgetBreakdown(selections) {
      if (!selections.length) {
        return `<div class="secondary">Seleccione una receta y cantidad para calcular.</div>`;
      }

      return selections.map((selection) => `
        <div class="compact-item">
          <div class="primary">${escapeHtml(selection.recipe.name)} x ${escapeHtml(selection.quantity)}</div>
          <div class="secondary">Costo: ${formatCurrency(selection.cost)} | Personal: ${formatCurrency(selection.laborCost)}</div>
          ${renderScaledRecipeItems(selection.recipe, selection.factor)}
        </div>
      `).join("");
    }

    function renderScaledRecipeItems(recipe, factor) {
      return (recipe.items || []).map((item) => {
        const scaledQuantity = parseDecimal(item.quantity || 0) * factor;
        const productionQuantity = normalizeRecipeProductionQuantity(scaledQuantity, item.unit);
        const costQuantity = getCostQuantity(productionQuantity, item.unit);
        const unitCost = parseDecimal(item.unitCost || 0);
        const wastePercent = Math.max(0, parseDecimal(item.wastePercent || 0));
        const itemCost = costQuantity * unitCost * (1 + wastePercent / 100);
        const typeLabel = item.type === "recipe" ? "Preparacion" : "Insumo";

        const nested = item.linkedRecipe
          ? renderNestedPreparationItems(item.linkedRecipe, getCostQuantity(productionQuantity, item.unit))
          : "";

        return `
          <div class="recipe-breakdown-row">
            <div>
              <div class="primary">${escapeHtml(item.name)}</div>
              <div class="secondary">${typeLabel}</div>
            </div>
            <div class="primary">${escapeHtml(formatRecipeQuantity(productionQuantity, item.unit))}</div>
            <div class="secondary">${canSeeRecipeCosts() ? formatCurrency(itemCost) : ""}</div>
          </div>
          ${nested}
        `;
      }).join("");
    }

    function renderNestedPreparationItems(recipe, requiredPortions) {
      const basePortions = parseDecimal(recipe.portions || 1);
      const factor = basePortions > 0 ? requiredPortions / basePortions : 0;

      return (recipe.items || []).map((item) => {
        const scaledQuantity = parseDecimal(item.quantity || 0) * factor;
        const productionQuantity = normalizeRecipeProductionQuantity(scaledQuantity, item.unit);
        const costQuantity = getCostQuantity(productionQuantity, item.unit);
        const unitCost = parseDecimal(item.unitCost || 0);
        const wastePercent = Math.max(0, parseDecimal(item.wastePercent || 0));
        const itemCost = costQuantity * unitCost * (1 + wastePercent / 100);

        return `
          <div class="recipe-breakdown-row" style="padding-left:18px;">
            <div>
              <div class="primary">${escapeHtml(item.name)}</div>
              <div class="secondary">Dentro de ${escapeHtml(recipe.name)}</div>
            </div>
            <div class="primary">${escapeHtml(formatRecipeQuantity(productionQuantity, item.unit))}</div>
            <div class="secondary">${canSeeRecipeCosts() ? formatCurrency(itemCost) : ""}</div>
          </div>
        `;
      }).join("");
    }

    async function loadRecipes() {
      const response = await fetch("/api/recipes");
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudieron cargar las recetas.", "error");
        return;
      }

      allRecipes = result.recipes || [];
      recipeProducts = result.products || [];
      costSettings = result.settings || { laborHourlyCost: 0 };
      setFormValue(document.getElementById("cost-settings-form"), "laborHourlyCost", costSettings.laborHourlyCost || "");
      setFormValue(document.getElementById("cost-settings-form"), "supplyProfilesText", supplyProfilesToText(costSettings.supplyProfiles));
      setFormValue(document.getElementById("cost-settings-form"), "operationalOptionsText", operationalOptionsToText(costSettings.operationalOptions));
      if (can("*")) {
        await loadPendingRecipeEdits();
      } else {
        pendingRecipeEdits = [];
      }
      renderRecipes();
      renderRecipeReviewButton();

      if (!document.querySelector(".recipe-item")) {
        resetRecipeForm();
      }
    }

    async function loadPendingRecipeEdits() {
      const response = await fetch("/api/pending-recipe-edits");
      const result = await readJsonResponse(response);
      pendingRecipeEdits = result.ok ? (result.reviews || []) : [];
    }

    function renderRecipeReviewButton() {
      const button = document.getElementById("recipe-review-button");
      if (!button) return;
      button.classList.toggle("hidden", !can("*"));
      button.textContent = `Revisiones pendientes (${pendingRecipeEdits.length})`;
    }

    function showRecipeReviewInbox() {
      if (!can("*")) return;
      document.getElementById("detail-title").textContent = "Revisiones de recetas";
      document.getElementById("detail-subtitle").textContent = "Cambios enviados por cocina para aprobar.";
      document.getElementById("detail-fields").innerHTML = pendingRecipeEdits.length
        ? pendingRecipeEdits.map(renderRecipeReviewCard).join("")
        : `<div class="empty">No hay revisiones pendientes.</div>`;
      document.getElementById("detail").classList.add("open");
    }

    function renderRecipeReviewCard(review) {
      return `
        <div class="compact-item">
          <div class="toolbar-actions" style="justify-content:space-between;">
            <div>
              <div class="primary">${escapeHtml(review.recipeName || review.next?.name || "Receta")}</div>
              <div class="secondary">Enviado por ${escapeHtml(review.requestedByName || "Cocina")} · ${escapeHtml(formatDate(review.requestedAt) || "")}</div>
            </div>
            <div class="actions">
              <button class="approve" onclick="approveRecipeReview('${escapeAttribute(review.id)}')">Aprobar</button>
              <button class="reject" onclick="rejectRecipeReview('${escapeAttribute(review.id)}')">Rechazar</button>
            </div>
          </div>
          <div class="recipe-review-grid">
            ${renderRecipeApprovalSnapshot("Antes", review.before)}
            ${renderRecipeChangeSummary(review)}
            ${renderRecipeApprovalSnapshot("Quedaria", review.next)}
          </div>
        </div>
      `;
    }

    function renderRecipeApprovalSnapshot(title, recipe) {
      if (!recipe) {
        return `<div class="field"><label>${escapeHtml(title)}</label><div>Receta nueva</div></div>`;
      }
      return `
        <div class="field">
          <label>${escapeHtml(title)}</label>
          <div class="primary">${escapeHtml(recipe.name || "")}</div>
          <div class="secondary">${escapeHtml(recipe.category || "Sin categoria")} · Rinde ${escapeHtml(formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad"))}</div>
          <div class="secondary">Ingredientes: ${escapeHtml(recipe.items?.length || 0)} · Procesos: ${escapeHtml(recipe.processRows?.length || 0)} · Fotos: ${escapeHtml(countRecipePhotos(recipe))}</div>
          <div class="secondary">Costo: ${formatCurrency(recipe.totalCost || 0)} · Unitario: ${formatCurrency(recipe.costPerPortion || 0)}</div>
          ${recipe.platePhoto?.dataUrl ? `<div class="recipe-photo-preview" style="margin-top:8px;">${renderRecipePhotoThumbs([recipe.platePhoto], "readonly")}</div>` : ""}
        </div>
      `;
    }

    function renderRecipeChangeSummary(review) {
      const changes = review.changes || {};
      const fields = changes.fields || [];
      return `
        <div class="field">
          <label>Que se modifico</label>
          ${fields.length ? fields.map((item) => `
            <div class="summary-row">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.before || "-")} → ${escapeHtml(item.after || "-")}</span>
            </div>
          `).join("") : `<div class="secondary">Sin cambios de campos principales.</div>`}
          ${renderRecipeCollectionDiff("Ingredientes", changes.ingredients)}
          ${renderRecipeCollectionDiff("Procesos", changes.processRows)}
        </div>
      `;
    }

    function renderRecipeCollectionDiff(label, diff = {}) {
      const added = diff.added || [];
      const removed = diff.removed || [];
      const changed = diff.changed || [];
      if (!added.length && !removed.length && !changed.length) return "";
      return `
        <div style="margin-top:10px;">
          <div class="primary">${escapeHtml(label)}</div>
          ${added.length ? `<div class="secondary">Agregados: ${escapeHtml(added.map(getRecipeDiffItemLabel).join(", "))}</div>` : ""}
          ${removed.length ? `<div class="secondary">Eliminados: ${escapeHtml(removed.map(getRecipeDiffItemLabel).join(", "))}</div>` : ""}
          ${changed.length ? `<div class="secondary">Modificados: ${escapeHtml(changed.map((item) => getRecipeDiffItemLabel(item.after)).join(", "))}</div>` : ""}
        </div>
      `;
    }

    function getRecipeDiffItemLabel(item = {}) {
      return item.name || item.label || "Item";
    }

    function countRecipePhotos(recipe = {}) {
      return (recipe.platePhoto?.dataUrl ? 1 : 0) + (recipe.processRows || []).reduce((sum, row) => sum + (row.photos?.length || 0), 0);
    }

    async function approveRecipeReview(id) {
      const response = await fetch("/api/approve-recipe-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo aprobar la revision.", "error");
        return;
      }
      allRecipes = result.recipes || allRecipes;
      pendingRecipeEdits = result.reviews || [];
      renderRecipes();
      renderRecipeReviewButton();
      showRecipeReviewInbox();
      showNotice("Revision aprobada y receta actualizada.", "success");
    }

    async function rejectRecipeReview(id) {
      const reason = prompt("Motivo opcional del rechazo") || "";
      const response = await fetch("/api/reject-recipe-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo rechazar la revision.", "error");
        return;
      }
      pendingRecipeEdits = result.reviews || [];
      renderRecipeReviewButton();
      showRecipeReviewInbox();
      showNotice("Revision rechazada.", "success");
    }

    function renderRecipes() {
      const term = normalizeSearch(document.getElementById("recipe-search").value);
      const filtered = allRecipes.filter((recipe) =>
        normalizeSearch([recipe.name, recipe.category, recipe.notes].join(" ")).includes(term)
      );

      const list = document.getElementById("recipe-list");
      if (!filtered.length) {
        list.innerHTML = `<div class="empty">Todavia no hay recetas cargadas.</div>`;
        return;
      }

      list.innerHTML = filtered.map((recipe) => `
        <article class="recipe-card" onclick="showRecipeDetail('${escapeAttribute(recipe.id)}')">
          <div class="recipe-card-head">
            <div>
              <div class="recipe-card-title">${escapeHtml(recipe.name)}</div>
              <div class="secondary">Rinde ${escapeHtml(formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad"))}</div>
            </div>
            <div class="actions" onclick="event.stopPropagation()">
              <span class="recipe-pill">${escapeHtml(recipe.category || "Receta")}</span>
              <button class="menu-dot" onclick="showRecipeActions('${escapeAttribute(recipe.id)}')">...</button>
            </div>
          </div>
          ${renderRecipeCardStats(recipe)}
        </article>
      `).join("");
    }

    function renderRecipeCardStats(recipe) {
      if (!canSeeRecipeCosts()) {
        return `
          <div class="recipe-card-stats">
            <div class="recipe-stat"><span>Ingredientes</span><strong>${escapeHtml(recipe.items?.length || 0)}</strong></div>
            <div class="recipe-stat"><span>Procesos</span><strong>${escapeHtml(recipe.processRows?.length || 0)}</strong></div>
            <div class="recipe-stat"><span>Elaboracion</span><strong>${formatDurationHours(recipe.productionTimeHours)}</strong></div>
            <div class="recipe-stat"><span>Armado</span><strong>${formatDurationMinutes(recipe.assemblyTimeMinutes)}</strong></div>
          </div>
        `;
      }
      return `
        <div class="recipe-card-stats">
          <div class="recipe-stat"><span>Total</span><strong>${formatCurrency(recipe.totalCost)}</strong></div>
          <div class="recipe-stat"><span>x ${escapeHtml(recipe.yieldUnit || "unidad")}</span><strong>${formatCurrency(recipe.costPerPortion)}</strong></div>
          <div class="recipe-stat"><span>Insumos</span><strong>${formatCurrency(recipe.ingredientCost)}</strong></div>
          <div class="recipe-stat"><span>Personal</span><strong>${formatCurrency(recipe.laborCost)}</strong></div>
        </div>
      `;
    }

    function showRecipeActions(id) {
      const recipe = allRecipes.find((item) => item.id === id);
      if (!recipe) return;
      document.getElementById("detail-title").textContent = recipe.name;
      document.getElementById("detail-subtitle").textContent = recipe.category || "Receta";
      document.getElementById("detail-fields").innerHTML = `
        ${field("Rinde", formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad"))}
        ${canSeeRecipeCosts() ? field("Costo total", formatCurrency(recipe.totalCost)) : ""}
        ${canSeeRecipeCosts() ? field("Costo unitario", formatCurrency(recipe.costPerPortion)) : ""}
        <div class="actions">
          <button class="approve" onclick="hideDetail(); editRecipe('${escapeAttribute(recipe.id)}')">Editar receta</button>
          <button class="filter" onclick="downloadRecipeSheet('${escapeAttribute(recipe.id)}')">Descargar ficha</button>
          <button class="filter" onclick="printRecipeSheet('${escapeAttribute(recipe.id)}')">Imprimir</button>
          ${can("*") ? `<button class="reject" onclick="hideDetail(); deleteRecipe('${escapeAttribute(recipe.id)}')">Eliminar receta</button>` : ""}
        </div>
      `;
      document.getElementById("detail").classList.add("open");
    }

    function showRecipeDetail(recipeId) {
      const recipe = allRecipes.find((item) => item.id === recipeId);
      if (!recipe) return;

      document.getElementById("recipe-detail-title").textContent = recipe.name;
      document.getElementById("recipe-detail-subtitle").textContent =
        `${recipe.category || "Receta"} | Rinde ${formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad")}`;
      document.getElementById("recipe-detail-body").innerHTML = `
        ${renderRecipeDetailSummary(recipe)}
        <div class="actions" style="margin-bottom:16px;">
          <button class="approve" onclick="hideRecipeDetail(); editRecipe('${escapeAttribute(recipe.id)}')">Editar receta</button>
          ${canSeeRecipeCosts() ? `<button class="filter" onclick="startBudgetFromRecipe('${escapeAttribute(recipe.id)}')">Presupuestar</button>` : ""}
          <button class="filter" onclick="downloadRecipeSheet('${escapeAttribute(recipe.id)}')">Descargar ficha</button>
          <button class="filter" onclick="printRecipeSheet('${escapeAttribute(recipe.id)}')">Imprimir</button>
        </div>
        ${recipe.platePhoto?.dataUrl ? `
          <section class="recipe-detail-section" style="margin-bottom:16px;">
            <div class="primary">Foto del plato terminado</div>
            <div class="recipe-photo-preview">${renderRecipePhotoThumbs([recipe.platePhoto], "readonly")}</div>
          </section>
        ` : ""}
        <section class="recipe-detail-section">
          <div class="primary">Ficha tecnica</div>
          <div class="recipe-detail-summary">
            <div class="recipe-stat"><span>Elaboracion</span><strong>${formatDurationHours(recipe.productionTimeHours)}</strong></div>
            <div class="recipe-stat"><span>Armado</span><strong>${formatDurationMinutes(recipe.assemblyTimeMinutes)}</strong></div>
            <div class="recipe-stat"><span>Personas</span><strong>${escapeHtml(recipe.assemblyPeople || "-")}</strong></div>
            <div class="recipe-stat"><span>Cantidad armado</span><strong>${escapeHtml(recipe.assemblyQuantity ? `${recipe.assemblyQuantity} ${recipe.assemblyUnit || ""}` : "-")}</strong></div>
          </div>
          ${renderRecipeProcessRows(recipe)}
        </section>
        <section class="recipe-detail-section">
          <div class="primary">Composicion</div>
          ${renderRecipeDetailItems(recipe)}
        </section>
        ${recipe.notes ? `
          <section class="recipe-detail-section" style="margin-top:16px;">
            <div class="primary">Notas</div>
            <div class="secondary">${escapeHtml(recipe.notes)}</div>
          </section>
        ` : ""}
      `;
      document.getElementById("recipe-detail").classList.add("open");
    }

    function renderRecipeDetailSummary(recipe) {
      if (!canSeeRecipeCosts()) {
        return `
          <div class="recipe-detail-summary">
            <div class="recipe-stat"><span>Ingredientes</span><strong>${escapeHtml(recipe.items?.length || 0)}</strong></div>
            <div class="recipe-stat"><span>Procesos</span><strong>${escapeHtml(recipe.processRows?.length || 0)}</strong></div>
            <div class="recipe-stat"><span>Fotos</span><strong>${escapeHtml(countRecipePhotos(recipe))}</strong></div>
            <div class="recipe-stat"><span>Rinde</span><strong>${escapeHtml(formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad"))}</strong></div>
          </div>
        `;
      }
      return `
        <div class="recipe-detail-summary">
          <div class="recipe-stat"><span>Total</span><strong>${formatCurrency(recipe.totalCost)}</strong></div>
          <div class="recipe-stat"><span>Costo x ${escapeHtml(recipe.yieldUnit || "unidad")}</span><strong>${formatCurrency(recipe.costPerPortion)}</strong></div>
          <div class="recipe-stat"><span>Insumos</span><strong>${formatCurrency(recipe.ingredientCost)}</strong></div>
          <div class="recipe-stat"><span>Personal</span><strong>${formatCurrency(recipe.laborCost)}</strong></div>
        </div>
      `;
    }

    function hideRecipeDetail() {
      document.getElementById("recipe-detail").classList.remove("open");
    }

    function closeRecipeDetail(event) {
      if (event.target.id === "recipe-detail") {
        hideRecipeDetail();
      }
    }

    async function startBudgetFromRecipe(recipeId) {
      if (!canSeeRecipeCosts()) {
        showNotice("El rol cocinero no puede acceder a costos ni presupuestos.", "error");
        return;
      }
      const recipe = allRecipes.find((item) => item.id === recipeId);
      if (!recipe) return;

      hideRecipeDetail();
      await loadRecipes();
      document.getElementById("budget-builder").classList.add("open");
      document.getElementById("budget-recipe-rows").innerHTML = "";
      budgetRecipeCounter = 0;
      addBudgetRecipeRow({ recipeId: recipe.id, quantity: recipe.portions || 1 });
      updateBudgetBuilder();
    }

    function renderRecipeDetailItems(recipe) {
      if (!recipe.items?.length) {
        return `<div class="secondary">Sin ingredientes cargados.</div>`;
      }

      return recipe.items.map((item) => {
        const typeLabel = item.type === "recipe" ? "Preparacion" : "Insumo";
        const nested = item.linkedRecipe
          ? `<div style="margin-top:8px;padding-left:14px;">${renderNestedPreparationItems(item.linkedRecipe, getCostQuantity(item.quantity, item.unit))}</div>`
          : "";

        return `
          <div class="recipe-breakdown-row">
            <div>
              <div class="primary">${escapeHtml(item.name)}</div>
              <div class="secondary">${typeLabel}${item.wastePercent ? ` | Merma ${escapeHtml(item.wastePercent)}%` : ""}</div>
            </div>
            <div class="primary">${escapeHtml(formatRecipeQuantity(item.quantity, item.unit))}</div>
            <div class="secondary">${canSeeRecipeCosts() ? formatCurrency(item.cost) : ""}</div>
          </div>
          ${nested}
        `;
      }).join("");
    }

    function renderRecipeProcessRows(recipe) {
      if (!recipe.processRows?.length) {
        return `<div class="secondary">Sin registros tecnicos cargados.</div>`;
      }

      return recipe.processRows.map((row) => `
        <div class="recipe-breakdown-row">
          <div>
            <div class="primary">${escapeHtml(row.label)}</div>
            <div class="secondary">${escapeHtml(getProcessTypeLabel(row.type))}${row.notes ? ` | ${escapeHtml(row.notes)}` : ""}</div>
            ${row.photos?.length ? `<div class="recipe-photo-preview" style="margin-top:8px;">${renderRecipePhotoThumbs(row.photos, "readonly")}</div>` : ""}
          </div>
          <div class="primary">${row.type === "note" ? "" : escapeHtml(formatRecipeQuantity(row.quantity, row.unit))}</div>
          <div class="secondary"></div>
        </div>
      `).join("");
    }

    function getProcessTypeLabel(type) {
      return {
        raw: "Crudo",
        clean: "Limpio",
        waste: "Merma",
        cooked: "Cocido",
        finished: "Terminado",
        portion: "Porcionado",
        note: "Nota",
      }[type] || "Nota";
    }

    function formatDurationHours(value) {
      const hours = parseDecimal(value || 0);
      return hours ? `${hours.toLocaleString("es-AR", { maximumFractionDigits: 2 })} hs` : "-";
    }

    function formatDurationMinutes(value) {
      const minutes = parseDecimal(value || 0);
      return minutes ? `${minutes.toLocaleString("es-AR", { maximumFractionDigits: 0 })} min` : "-";
    }

    function updateRecipeScale(recipeId, targetValue) {
      const recipe = allRecipes.find((item) => item.id === recipeId);
      const container = document.getElementById(`recipe-scale-${recipeId}`);

      if (!recipe || !container) return;

      container.innerHTML = renderRecipeScale(recipe, targetValue);
    }

    function renderRecipeScale(recipe, targetValue) {
      const basePortions = parseDecimal(recipe.portions || 0);
      const targetPortions = parseDecimal(targetValue || 0);

      if (!basePortions || !targetPortions) {
        return `<div class="secondary">Ingrese una cantidad valida para calcular.</div>`;
      }

      const factor = targetPortions / basePortions;
      const totalCost = (recipe.costPerPortion || 0) * targetPortions;
      const rows = (recipe.items || []).map((item) => {
        const baseQuantity = parseDecimal(item.quantity || 0);
        const scaledQuantity = baseQuantity * factor;
        const productionQuantity = normalizeRecipeProductionQuantity(scaledQuantity, item.unit);
        const unitCost = parseDecimal(item.unitCost || 0);
        const wastePercent = Math.max(0, parseDecimal(item.wastePercent || 0));
        const costQuantity = getCostQuantity(productionQuantity, item.unit);
        const itemCost = costQuantity * unitCost * (1 + wastePercent / 100);

        return `
          <div class="recipe-breakdown-row">
            <div>
              <div class="primary">${escapeHtml(item.name)}</div>
              <div class="secondary">Base: ${escapeHtml(formatRecipeQuantity(baseQuantity, item.unit))}</div>
            </div>
            <div class="primary">${escapeHtml(formatRecipeQuantity(productionQuantity, item.unit))}</div>
            <div class="secondary">${canSeeRecipeCosts() ? formatCurrency(itemCost) : ""}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="recipe-breakdown-row" style="border-top:0;">
          <div class="primary">Para producir ${escapeHtml(targetPortions)} unidad(es)</div>
          <div class="primary">${escapeHtml(formatScaleFactor(factor))}</div>
          <div class="primary">${canSeeRecipeCosts() ? formatCurrency(totalCost) : ""}</div>
        </div>
        ${rows}
      `;
    }

    function formatScaleFactor(factor) {
      return `x${Number(factor || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
    }

    function normalizeRecipeProductionQuantity(quantity, unit) {
      const value = parseDecimal(quantity || 0);
      if (!value) return 0;
      const normalizedUnit = normalizeSearch(unit || "");

      if (["gramos", "g", "gr", "ml"].includes(normalizedUnit) || isDiscreteRecipeUnit(normalizedUnit)) {
        return Math.ceil(value);
      }

      return roundToDecimals(value, 3);
    }

    function isDiscreteRecipeUnit(normalizedUnit) {
      return [
        "unidad",
        "unidades",
        "porcion",
        "porciones",
        "cazuela",
        "cazuelas",
        "botella",
        "botellas",
        "lata",
        "latas",
        "vaso",
        "vasos",
        "copa",
        "copas",
        "bandeja",
        "bandejas",
        "contenedor",
        "contenedores",
        "pieza",
        "piezas",
      ].includes(normalizedUnit);
    }

    function roundToDecimals(value, decimals = 3) {
      const factor = 10 ** decimals;
      return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
    }

    function formatRecipeQuantity(quantity, unit) {
      const normalizedUnit = String(unit || "").toLowerCase();
      const value = Number(quantity || 0);
      const formatted = value.toLocaleString("es-AR", { maximumFractionDigits: 3 });

      if (normalizedUnit === "gramos") {
        const kg = value / 1000;
        return kg >= 1
          ? `${formatted} g (${kg.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg)`
          : `${formatted} g`;
      }

      if (normalizedUnit === "ml") {
        const liters = value / 1000;
        return liters >= 1
          ? `${formatted} ml (${liters.toLocaleString("es-AR", { maximumFractionDigits: 3 })} litros)`
          : `${formatted} ml`;
      }

      return `${formatted} ${unit || ""}`.trim();
    }

    function downloadRecipeSheet(recipeId) {
      const recipe = allRecipes.find((item) => item.id === recipeId);
      if (!recipe) {
        showNotice("No encontre esa receta para descargar.", "error");
        return;
      }
      downloadTextFile(`${slugifyFileName(recipe.name || "receta")}.html`, buildRecipeBookHtml([recipe], recipe.name || "Receta"));
      showNotice("Ficha de receta descargada.");
    }

    function printRecipeSheet(recipeId) {
      const recipe = allRecipes.find((item) => item.id === recipeId);
      if (!recipe) {
        showNotice("No encontre esa receta para imprimir.", "error");
        return;
      }
      openPrintableRecipeBook([recipe], recipe.name || "Receta");
    }

    function downloadRecipeBook() {
      const term = normalizeSearch(document.getElementById("recipe-search")?.value || "");
      const recipes = allRecipes
        .filter((recipe) => normalizeSearch([recipe.name, recipe.category, recipe.notes].join(" ")).includes(term))
        .sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.name || "").localeCompare(String(b.name || "")));
      if (!recipes.length) {
        showNotice("No hay recetas para descargar.", "error");
        return;
      }
      const suffix = term ? "filtrado" : "completo";
      downloadTextFile(`libro-recetas-${suffix}.html`, buildRecipeBookHtml(recipes, "Libro de recetas"));
      showNotice(`Libro descargado con ${recipes.length} receta(s).`);
    }

    function openPrintableRecipeBook(recipes, title) {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        showNotice("El navegador bloqueo la ventana de impresion. Use Descargar ficha.", "error");
        return;
      }
      printWindow.document.write(buildRecipeBookHtml(recipes, title));
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }

    function buildRecipeBookHtml(recipes, title = "Libro de recetas") {
      const now = new Date().toLocaleString("es-AR");
      return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    ${getRecipePrintStyles()}
  </style>
</head>
<body>
  <header class="book-cover">
    <p class="eyebrow">Gratitud Gourmet</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(recipes.length)} receta(s) · Generado ${escapeHtml(now)}</p>
  </header>
  ${recipes.map(renderPrintableRecipe).join("")}
</body>
</html>`;
    }

    function renderPrintableRecipe(recipe) {
      const includeCosts = canSeeRecipeCosts();
      return `
        <article class="recipe-page">
          <header class="recipe-title">
            <div>
              <p class="eyebrow">${escapeHtml(recipe.category || "Receta")}</p>
              <h2>${escapeHtml(recipe.name || "Receta sin nombre")}</h2>
              <p>Rinde ${escapeHtml(formatRecipeQuantity(recipe.portions, recipe.yieldUnit || "unidad"))}</p>
            </div>
            <div class="stamp">Ficha tecnica</div>
          </header>

          ${includeCosts ? `
            <section class="kpi-grid">
              ${printKpi("Costo total", formatCurrency(recipe.totalCost))}
              ${printKpi(`Costo x ${recipe.yieldUnit || "unidad"}`, formatCurrency(recipe.costPerPortion))}
              ${printKpi("Insumos", formatCurrency(recipe.ingredientCost))}
              ${printKpi("Personal", formatCurrency(recipe.laborCost))}
            </section>
          ` : ""}

          <section class="info-grid">
            ${printField("Tiempo de elaboracion", formatDurationHours(recipe.productionTimeHours))}
            ${printField("Tiempo de armado", formatDurationMinutes(recipe.assemblyTimeMinutes))}
            ${printField("Personas de armado", recipe.assemblyPeople || "-")}
            ${printField("Cantidad armada", recipe.assemblyQuantity ? `${recipe.assemblyQuantity} ${recipe.assemblyUnit || ""}` : "-")}
            ${printField("Horas de personal", formatDurationHours(recipe.laborHours))}
            ${printField("Unidad de armado", recipe.assemblyUnit || "-")}
          </section>

          ${recipe.platePhoto?.dataUrl ? `
            <section>
              <h3>Foto del plato terminado</h3>
              <div class="print-photos">${renderPrintablePhotos([recipe.platePhoto])}</div>
            </section>
          ` : ""}

          <section>
            <h3>Procesos, mermas y rendimientos</h3>
            ${renderPrintableProcessRows(recipe)}
          </section>

          <section>
            <h3>Ingredientes y preparaciones</h3>
            ${renderPrintableRecipeItems(recipe)}
          </section>

          <section>
            <h3>Escala de produccion</h3>
            ${renderPrintableScale(recipe)}
          </section>

          ${recipe.notes ? `<section><h3>Notas</h3><p class="note">${escapeHtml(recipe.notes)}</p></section>` : ""}
        </article>
      `;
    }

    function printKpi(label, value) {
      return `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }

    function printField(label, value) {
      return `<div class="field-print"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
    }

    function renderPrintableProcessRows(recipe) {
      if (!recipe.processRows?.length) {
        return `<p class="muted">Sin registros tecnicos cargados.</p>`;
      }
      return `
        <table>
          <thead><tr><th>Tipo</th><th>Registro</th><th>Cantidad</th><th>Notas</th></tr></thead>
          <tbody>
            ${recipe.processRows.map((row) => `
              <tr>
                <td>${escapeHtml(getProcessTypeLabel(row.type))}</td>
                <td>${escapeHtml(row.label || "")}</td>
                <td>${row.type === "note" ? "" : escapeHtml(formatRecipeQuantity(row.quantity, row.unit))}</td>
                <td>${escapeHtml(row.notes || "")}${row.photos?.length ? `<div class="print-photos">${renderPrintablePhotos(row.photos)}</div>` : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    function renderPrintablePhotos(photos = []) {
      return photos
        .filter((photo) => photo?.dataUrl)
        .map((photo) => `
          <figure class="print-photo">
            <img src="${escapeAttribute(photo.dataUrl)}" alt="${escapeAttribute(photo.name || "Foto receta")}">
            <figcaption>${escapeHtml(photo.caption || photo.name || "Foto")}</figcaption>
          </figure>
        `).join("");
    }

    function renderPrintableRecipeItems(recipe) {
      if (!recipe.items?.length) {
        return `<p class="muted">Sin ingredientes cargados.</p>`;
      }
      const includeCosts = canSeeRecipeCosts();
      return `
        <table>
          <thead><tr><th>Tipo</th><th>Ingrediente / preparacion</th><th>Cantidad</th><th>Merma</th>${includeCosts ? "<th>Costo unit.</th><th>Costo</th>" : ""}</tr></thead>
          <tbody>
            ${recipe.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.type === "recipe" ? "Preparacion" : "Insumo")}</td>
                <td>
                  <strong>${escapeHtml(item.name || "")}</strong>
                  ${item.linkedRecipe ? `<div class="muted">Incluye preparacion: ${escapeHtml(item.linkedRecipe.name || "")}</div>` : ""}
                </td>
                <td>${escapeHtml(formatRecipeQuantity(item.quantity, item.unit))}</td>
                <td>${escapeHtml(item.wastePercent ? `${item.wastePercent}%` : "-")}</td>
                ${includeCosts ? `<td>${formatCurrency(item.unitCost || 0)}</td><td>${formatCurrency(item.cost || 0)}</td>` : ""}
              </tr>
              ${item.linkedRecipe ? renderPrintableNestedItems(item.linkedRecipe, getCostQuantity(item.quantity, item.unit)) : ""}
            `).join("")}
          </tbody>
        </table>
      `;
    }

    function renderPrintableNestedItems(recipe, requiredPortions) {
      const basePortions = parseDecimal(recipe.portions || 1);
      const factor = basePortions > 0 ? requiredPortions / basePortions : 0;
      return (recipe.items || []).map((item) => {
        const scaledQuantity = parseDecimal(item.quantity || 0) * factor;
        const productionQuantity = normalizeRecipeProductionQuantity(scaledQuantity, item.unit);
        const costQuantity = getCostQuantity(productionQuantity, item.unit);
        const unitCost = parseDecimal(item.unitCost || 0);
        const wastePercent = Math.max(0, parseDecimal(item.wastePercent || 0));
        const itemCost = costQuantity * unitCost * (1 + wastePercent / 100);
        return `
          <tr class="nested-row">
            <td></td>
            <td>${escapeHtml(item.name || "")}<div class="muted">Dentro de ${escapeHtml(recipe.name || "")}</div></td>
            <td>${escapeHtml(formatRecipeQuantity(productionQuantity, item.unit))}</td>
            <td>${escapeHtml(item.wastePercent ? `${item.wastePercent}%` : "-")}</td>
            ${canSeeRecipeCosts() ? `<td>${formatCurrency(item.unitCost || 0)}</td><td>${formatCurrency(itemCost)}</td>` : ""}
          </tr>
        `;
      }).join("");
    }

    function renderPrintableScale(recipe) {
      const base = parseDecimal(recipe.portions || 0);
      if (!base || !recipe.items?.length) {
        return `<p class="muted">Sin escala calculable.</p>`;
      }
      const targets = [base, base * 2, base * 5].filter((value, index, arr) => value > 0 && arr.indexOf(value) === index);
      return targets.map((target) => {
        const factor = target / base;
        return `
          <div class="scale-block">
            <h4>Para producir ${escapeHtml(formatRecipeQuantity(target, recipe.yieldUnit || "unidad"))} (${escapeHtml(formatScaleFactor(factor))})</h4>
            <table>
              <thead><tr><th>Ingrediente</th><th>Cantidad</th></tr></thead>
              <tbody>
                ${recipe.items.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.name || "")}</td>
                    <td>${escapeHtml(formatRecipeQuantity(normalizeRecipeProductionQuantity(parseDecimal(item.quantity || 0) * factor, item.unit), item.unit))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }).join("");
    }

    function getRecipePrintStyles() {
      return `
        * { box-sizing: border-box; }
        body { color: #111827; font-family: Arial, sans-serif; margin: 0; background: #f3f4f6; }
        .book-cover, .recipe-page { background: #fff; margin: 20px auto; max-width: 980px; padding: 28px; }
        .book-cover { border-bottom: 5px solid #0f5b4c; }
        .eyebrow { color: #607086; font-size: 11px; font-weight: 800; letter-spacing: .04em; margin: 0 0 8px; text-transform: uppercase; }
        h1, h2, h3, h4 { margin: 0; }
        h1 { font-size: 34px; }
        h2 { font-size: 28px; }
        h3 { border-bottom: 1px solid #d8dee8; font-size: 17px; margin: 22px 0 10px; padding-bottom: 6px; }
        h4 { font-size: 14px; margin: 12px 0 8px; }
        .recipe-page { page-break-after: always; }
        .recipe-title { align-items: start; display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
        .stamp { border: 1px solid #0f5b4c; color: #0f5b4c; font-weight: 800; padding: 8px 10px; text-transform: uppercase; }
        .kpi-grid, .info-grid { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin-top: 14px; }
        .info-grid { grid-template-columns: repeat(3, 1fr); }
        .kpi, .field-print { border: 1px solid #d8dee8; border-radius: 6px; padding: 9px; }
        .kpi span, .field-print span, .muted { color: #607086; font-size: 11px; }
        .kpi strong, .field-print strong { display: block; font-size: 16px; margin-top: 4px; }
        table { border-collapse: collapse; margin-top: 8px; width: 100%; }
        th, td { border: 1px solid #d8dee8; font-size: 12px; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #eef2f6; color: #334155; font-size: 11px; text-transform: uppercase; }
        .nested-row td { background: #f8fafc; }
        .note { border: 1px solid #d8dee8; border-radius: 6px; padding: 10px; white-space: pre-wrap; }
        .print-photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .print-photo { border: 1px solid #d8dee8; border-radius: 6px; margin: 0; padding: 6px; width: 180px; }
        .print-photo img { aspect-ratio: 4 / 3; object-fit: cover; width: 100%; }
        .print-photo figcaption { color: #607086; font-size: 10px; margin-top: 4px; }
        .scale-block { break-inside: avoid; }
        @media print {
          body { background: #fff; }
          .book-cover, .recipe-page { margin: 0; max-width: none; padding: 18mm; }
        }
      `;
    }

    function downloadTextFile(fileName, content) {
      const blob = new Blob([content], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function slugifyFileName(value) {
      return normalizeSearch(value || "receta")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "receta";
    }

    async function handleRecipePlatePhoto(input) {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      try {
        const photo = await resizeRecipeImage(file);
        const form = document.getElementById("recipe-form");
        setFormValue(form, "platePhotoData", photo.dataUrl);
        setFormValue(form, "platePhotoName", photo.name);
        renderRecipePlatePhoto(photo);
      } catch (error) {
        showNotice(error.message || "No se pudo cargar la foto.", "error");
      }
    }

    function renderRecipePlatePhoto(photo) {
      const container = document.getElementById("recipe-plate-photo-preview");
      if (!container) return;
      container.innerHTML = photo?.dataUrl
        ? renderRecipePhotoThumbs([photo], "plate")
        : `<div class="secondary">Sin foto cargada.</div>`;
    }

    function removeRecipePlatePhoto() {
      const form = document.getElementById("recipe-form");
      setFormValue(form, "platePhotoData", "");
      setFormValue(form, "platePhotoName", "");
      renderRecipePlatePhoto(null);
    }

    function getRecipePlatePhotoPayload(form) {
      const dataUrl = form.elements.platePhotoData?.value || "";
      if (!dataUrl) return null;
      return {
        name: form.elements.platePhotoName?.value || "plato.jpg",
        dataUrl,
      };
    }

    async function handleRecipeProcessPhotos(input) {
      const row = input.closest(".recipe-process-item");
      const files = Array.from(input.files || []);
      input.value = "";
      if (!row || !files.length) return;
      try {
        const current = getRecipeProcessRowPhotos(row);
        const nextPhotos = [...current];
        for (const file of files) {
          nextPhotos.push(await resizeRecipeImage(file));
        }
        setRecipeProcessRowPhotos(row, nextPhotos.slice(0, 8));
      } catch (error) {
        showNotice(error.message || "No se pudieron cargar las fotos.", "error");
      }
    }

    function getRecipeProcessRowPhotos(row) {
      try {
        const value = row.querySelector(".recipe-process-photos-data")?.value || "[]";
        return JSON.parse(value).filter((photo) => photo?.dataUrl);
      } catch {
        return [];
      }
    }

    function setRecipeProcessRowPhotos(row, photos) {
      const cleanPhotos = (photos || []).filter((photo) => photo?.dataUrl);
      const input = row.querySelector(".recipe-process-photos-data");
      if (input) input.value = JSON.stringify(cleanPhotos);
      const preview = row.querySelector(".recipe-process-photos");
      if (preview) preview.innerHTML = renderRecipePhotoThumbs(cleanPhotos, "process");
    }

    function removeRecipeProcessPhoto(button, photoId) {
      const row = button.closest(".recipe-process-item");
      const photos = getRecipeProcessRowPhotos(row).filter((photo) => photo.id !== photoId);
      setRecipeProcessRowPhotos(row, photos);
    }

    function renderRecipePhotoThumbs(photos = [], context = "process") {
      if (!photos.length) return `<div class="secondary">Sin fotos cargadas.</div>`;
      return photos.map((photo) => `
        <div class="recipe-photo-thumb">
          <img src="${escapeAttribute(photo.dataUrl)}" alt="${escapeAttribute(photo.name || "Foto receta")}">
          <div class="secondary">${escapeHtml(photo.name || "Foto")}</div>
          ${context === "readonly" ? ""
            : context === "plate"
            ? `<button class="reject" type="button" onclick="removeRecipePlatePhoto()">Quitar</button>`
            : `<button class="reject" type="button" onclick="removeRecipeProcessPhoto(this, '${escapeAttribute(photo.id || "")}')">Quitar</button>`}
        </div>
      `).join("");
    }

    function resizeRecipeImage(file) {
      if (!file.type.startsWith("image/")) {
        return Promise.reject(new Error("El archivo debe ser una imagen."));
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
          image.onload = () => {
            const maxSize = 1200;
            const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * ratio));
            const height = Math.max(1, Math.round(image.height * ratio));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, width, height);
            resolve({
              id: `foto-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: file.name || "foto-receta.jpg",
              dataUrl: canvas.toDataURL("image/jpeg", 0.82),
              uploadedAt: new Date().toISOString(),
            });
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function resetRecipeForm(recipe = {}) {
      const form = document.getElementById("recipe-form");
      form.reset();
      setFormValue(form, "id", recipe.id || "");
      setFormValue(form, "name", recipe.name || "");
      setFormValue(form, "portions", recipe.portions || "");
      setFormValue(form, "yieldUnit", recipe.yieldUnit || "unidad");
      setFormValue(form, "category", recipe.category || "");
      setFormValue(form, "laborHours", recipe.laborHours || "");
      setFormValue(form, "productionTimeHours", recipe.productionTimeHours || "");
      setFormValue(form, "assemblyTimeMinutes", recipe.assemblyTimeMinutes || "");
      setFormValue(form, "assemblyPeople", recipe.assemblyPeople || "");
      setFormValue(form, "assemblyQuantity", recipe.assemblyQuantity || "");
      setFormValue(form, "assemblyUnit", recipe.assemblyUnit || "");
      setFormValue(form, "platePhotoData", recipe.platePhoto?.dataUrl || "");
      setFormValue(form, "platePhotoName", recipe.platePhoto?.name || "");
      setFormValue(form, "notes", recipe.notes || "");
      renderRecipePlatePhoto(recipe.platePhoto || null);
      recipeItemCounter = 0;
      recipeProcessCounter = 0;
      document.getElementById("recipe-items").innerHTML = "";
      document.getElementById("recipe-process-rows").innerHTML = "";

      (recipe.processRows?.length ? recipe.processRows : [{}]).forEach((row) => addRecipeProcessRow(row));
      const items = recipe.items?.length ? recipe.items : [{}];
      items.forEach((item) => addRecipeItemRow(item));
      updateRecipeTotals();
    }

    function editRecipe(id) {
      const recipe = allRecipes.find((item) => item.id === id);
      if (!recipe) return;
      showRecipeForm(recipe);
    }

    function addRecipeProcessRow(item = {}) {
      const row = document.createElement("div");
      row.className = "recipe-process-item";
      const selectedUnit = normalizeRecipeUnit(item.unit || "kg");
      const photos = Array.isArray(item.photos) ? item.photos : [];
      row.innerHTML = `
        <select class="recipe-process-type">
          ${[
            ["raw", "Crudo"],
            ["clean", "Limpio"],
            ["waste", "Merma"],
            ["cooked", "Cocido"],
            ["finished", "Terminado"],
            ["portion", "Porcionado"],
            ["note", "Nota"],
          ].map(([value, label]) => `<option value="${value}" ${item.type === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <input class="recipe-process-label" placeholder="Ej: cebolla pelada, receta terminada" value="${escapeAttribute(item.label || "")}">
        <input class="recipe-process-quantity" inputmode="decimal" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}">
        <select class="recipe-process-unit">
          ${["kg", "gramos", "litros", "ml", "unidad", "min", "hs"].map((unit) => `<option value="${unit}" ${selectedUnit === unit ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
        <input class="recipe-process-notes" placeholder="Notas" value="${escapeAttribute(item.notes || "")}">
        <button class="reject icon-action" type="button" onclick="removeRecipeProcessRow(this)">X</button>
        <div class="recipe-process-photos-wrap">
          <input class="recipe-process-photos-data" type="hidden" value="${escapeAttribute(JSON.stringify(photos))}">
          <div class="toolbar-actions" style="justify-content:flex-start;margin:0 0 6px;">
            <input type="file" accept="image/*" multiple onchange="handleRecipeProcessPhotos(this)">
          </div>
          <div class="recipe-process-photos">${renderRecipePhotoThumbs(photos, "process")}</div>
        </div>
      `;
      document.getElementById("recipe-process-rows").appendChild(row);
      row.querySelector(".recipe-process-type").addEventListener("change", () => updateRecipeProcessRowState(row));
      updateRecipeProcessRowState(row);
      recipeProcessCounter += 1;
    }

    function updateRecipeProcessRowState(row) {
      const isNote = row.querySelector(".recipe-process-type")?.value === "note";
      row.classList.toggle("is-note", isNote);
      row.querySelector(".recipe-process-quantity").disabled = isNote;
      row.querySelector(".recipe-process-unit").disabled = isNote;
      if (isNote) {
        row.querySelector(".recipe-process-quantity").value = "";
      }
    }

    function removeRecipeProcessRow(button) {
      const rows = document.querySelectorAll(".recipe-process-item");
      if (rows.length <= 1) return;
      button.closest(".recipe-process-item").remove();
    }

    function getRecipeProcessRows() {
      return Array.from(document.querySelectorAll(".recipe-process-item"))
        .map((row) => {
          const type = row.querySelector(".recipe-process-type").value;
          return {
            type,
            label: row.querySelector(".recipe-process-label").value.trim(),
            quantity: type === "note" ? "" : row.querySelector(".recipe-process-quantity").value,
            unit: type === "note" ? "" : row.querySelector(".recipe-process-unit").value,
            notes: row.querySelector(".recipe-process-notes").value.trim(),
            photos: getRecipeProcessRowPhotos(row),
          };
        })
        .filter((item) => item.label);
    }

    function addRecipeItemRow(item = {}) {
      const id = `recipe-item-${++recipeItemCounter}`;
      const row = document.createElement("div");
      row.className = "recipe-item";
      const itemType = item.type || "product";
      const selectedUnit = normalizeRecipeUnit(item.unit || "kg");
      if (item.unit) {
        row.dataset.unitTouched = "1";
      }
      row.innerHTML = `
        <select class="recipe-item-type">
          <option value="product" ${itemType === "product" ? "selected" : ""}>Insumo</option>
          <option value="recipe" ${itemType === "recipe" ? "selected" : ""}>Preparacion</option>
        </select>
        <div class="autocomplete">
          <input class="recipe-item-name" autocomplete="off" placeholder="Ingrediente" value="${escapeAttribute(item.name || "")}" required>
          <input class="recipe-item-recipe-id" type="hidden" value="${escapeAttribute(item.recipeId || "")}">
          <div id="${id}-suggestions" class="autocomplete-list"></div>
        </div>
        <input class="recipe-item-quantity" inputmode="decimal" placeholder="Cant." value="${escapeAttribute(item.quantity || "")}" required>
        <select class="recipe-item-unit">
          ${["kg", "gramos", "litros", "ml", "unidad"].map((unit) => `<option value="${unit}" ${selectedUnit === unit ? "selected" : ""}>${unit}</option>`).join("")}
        </select>
        <input class="recipe-item-unit-cost recipe-cost-field" inputmode="decimal" placeholder="$ x kg/unidad" value="${escapeAttribute(item.unitCost || "")}" ${canSeeRecipeCosts() ? "required" : ""}>
        <input class="recipe-item-waste" inputmode="decimal" placeholder="Merma %" value="${escapeAttribute(item.wastePercent || "")}">
        <button class="reject icon-action" type="button" onclick="removeRecipeItemRow(this)">X</button>
      `;
      document.getElementById("recipe-items").appendChild(row);
      applyRecipeCostVisibility();
      row.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateRecipeTotals));
      row.querySelector(".recipe-item-type").addEventListener("change", () => {
        row.querySelector(".recipe-item-name").value = "";
        row.querySelector(".recipe-item-recipe-id").value = "";
        row.querySelector(".recipe-item-unit-cost").value = "";
        updateRecipeTotals();
      });
      row.querySelector(".recipe-item-unit").addEventListener("change", () => {
        row.dataset.unitTouched = "1";
        updateRecipeTotals();
      });
      row.querySelector(".recipe-item-name").addEventListener("blur", () => applyRecipeSelection(row, row.querySelector(".recipe-item-name").value));
      row.querySelector(".recipe-item-name").addEventListener("input", () => applyRecipeSelection(row, row.querySelector(".recipe-item-name").value));
      setupAutocompleteForElement(
        row.querySelector(".recipe-item-name"),
        row.querySelector(".autocomplete-list"),
        () => getRecipeItemSuggestions(row),
        (value) => applyRecipeSelection(row, value)
      );
      if (!item.name) {
        applyRecipeSelection(row, row.querySelector(".recipe-item-name").value);
      }
      updateRecipeTotals();
    }

    function removeRecipeItemRow(button) {
      const rows = document.querySelectorAll(".recipe-item");

      if (rows.length <= 1) {
        showNotice("Debe quedar al menos un ingrediente.", "error");
        return;
      }

      button.closest(".recipe-item").remove();
      updateRecipeTotals();
    }

    function getRecipeItems() {
      return Array.from(document.querySelectorAll(".recipe-item"))
        .map((row) => ({
          type: row.querySelector(".recipe-item-type").value,
          recipeId: row.querySelector(".recipe-item-recipe-id").value,
          name: row.querySelector(".recipe-item-name").value.trim(),
          quantity: row.querySelector(".recipe-item-quantity").value,
          unit: row.querySelector(".recipe-item-unit").value,
          unitCost: row.querySelector(".recipe-item-unit-cost").value,
          wastePercent: row.querySelector(".recipe-item-waste").value,
        }))
        .filter((item) => item.name);
    }

    function calculateRecipePreview() {
      const form = document.getElementById("recipe-form");
      const portions = parseDecimal(form.elements.portions.value || 0);
      const laborHours = parseDecimal(form.elements.laborHours?.value || 0);
      const laborCost = laborHours * parseDecimal(costSettings.laborHourlyCost || 0);
      const total = getRecipeItems().reduce((sum, item) => {
        const quantity = getCostQuantity(item.quantity, item.unit);
        const unitCost = getRecipeItemUnitCost(item);
        const wastePercent = Math.max(0, parseDecimal(item.wastePercent || 0));
        return sum + quantity * unitCost * (1 + wastePercent / 100);
      }, laborCost);
      const costPerPortion = portions > 0 ? total / portions : 0;
      return { total, costPerPortion, laborCost };
    }

    function parseDecimal(value) {
      const raw = String(value ?? "").trim();
      const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
        : raw.replace(/[^\d.-]/g, "");
      const number = Number(normalized);
      return Number.isFinite(number) ? number : 0;
    }

    function getCostQuantity(quantityValue, unit) {
      const quantity = parseDecimal(quantityValue);
      const normalizedUnit = normalizeRecipeUnit(unit);

      if (normalizedUnit === "gramos") return quantity / 1000;
      if (normalizedUnit === "ml") return quantity / 1000;
      return quantity;
    }

    function getRecipeItemUnitCost(item) {
      if (item.type === "recipe") {
        const recipe = allRecipes.find((entry) => entry.id === item.recipeId || normalizeSearch(entry.name) === normalizeSearch(item.name));
        return parseDecimal(recipe?.costPerPortion || item.unitCost || 0);
      }

      return parseDecimal(item.unitCost || 0);
    }

    function getRecipeItemSuggestions(row) {
      const type = row.querySelector(".recipe-item-type").value;

      if (type === "recipe") {
        const currentId = document.getElementById("recipe-form").elements.id.value;
        return allRecipes
          .filter((recipe) => recipe.id !== currentId)
          .map((recipe) => recipe.name);
      }

      return recipeProducts.map((product) => product.name || product);
    }

    function applyRecipeSelection(row, value) {
      if (row.querySelector(".recipe-item-type").value === "recipe") {
        applyRecipePreparation(row, value);
        return;
      }

      applyRecipeProduct(row, value);
    }

    function applyRecipePreparation(row, value) {
      const recipe = allRecipes.find((entry) => normalizeSearch(entry.name) === normalizeSearch(value));
      if (!recipe) return;

      row.querySelector(".recipe-item-name").value = recipe.name;
      row.querySelector(".recipe-item-recipe-id").value = recipe.id;
      row.querySelector(".recipe-item-unit-cost").value = recipe.costPerPortion || "";
      if (row.dataset.unitTouched !== "1") {
        row.querySelector(".recipe-item-unit").value = mapYieldUnitToIngredientUnit(recipe.yieldUnit || "unidad");
      }
      updateRecipeTotals();
    }

    function normalizeRecipeUnit(unit) {
      const normalizedUnit = String(unit || "").toLowerCase().trim();
      if (["g", "gr", "gramo", "gramos"].includes(normalizedUnit)) return "gramos";
      if (["l", "lt", "lts", "litro", "litros"].includes(normalizedUnit)) return "litros";
      if (["u", "un", "unidad", "unidades"].includes(normalizedUnit)) return "unidad";
      if (["kg", "kilo", "kilos"].includes(normalizedUnit)) return "kg";
      if (normalizedUnit === "ml") return "ml";
      if (normalizedUnit === "min") return "min";
      if (normalizedUnit === "hs") return "hs";
      return normalizedUnit || "kg";
    }

    function mapYieldUnitToIngredientUnit(unit) {
      const normalizedUnit = String(unit || "").toLowerCase();
      if (normalizedUnit === "litros") return "litros";
      if (normalizedUnit === "kg") return "kg";
      return "unidad";
    }

    function applyRecipeProduct(row, value) {
      const product = findRecipeProduct(value);
      if (!product) return;

      row.querySelector(".recipe-item-name").value = product.name || value;

      if (product.unitCost) {
        row.querySelector(".recipe-item-unit-cost").value = product.unitCost;
      }

      const unit = row.querySelector(".recipe-item-unit");
      if (!unit.value) {
        unit.value = "kg";
      }

      updateRecipeTotals();
    }

    function findRecipeProduct(value) {
      const key = normalizeSearch(value);
      return recipeProducts.find((product) => normalizeSearch(product.name || product) === key);
    }

    function updateRecipeTotals() {
      const preview = calculateRecipePreview();
      const unit = document.getElementById("recipe-form").elements.yieldUnit.value || "unidad";
      document.getElementById("recipe-total").textContent = formatCurrency(preview.total);
      document.getElementById("recipe-portion").textContent = formatCurrency(preview.costPerPortion);
      document.getElementById("recipe-unit-label").textContent = `Costo x ${unit}`;
      document.getElementById("recipe-labor").textContent = formatCurrency(preview.laborCost);
    }

    async function saveRecipe(event) {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.target).entries());
      payload.items = getRecipeItems();
      payload.processRows = getRecipeProcessRows();
      payload.platePhoto = getRecipePlatePhotoPayload(event.target);
      delete payload.platePhotoData;
      delete payload.platePhotoName;

      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar la receta.", "error");
        return;
      }

      resetRecipeForm();
      hideRecipeForm();
      await loadRecipes();
      showNotice(result.pending ? "Edicion enviada a revision de administracion." : "Receta guardada correctamente.");
    }

    async function deleteRecipe(id) {
      const recipe = allRecipes.find((item) => item.id === id);
      if (!confirm(`Desea eliminar la receta ${recipe?.name || ""}?`)) return;

      const response = await fetch("/api/delete-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar la receta.", "error");
        return;
      }

      await loadRecipes();
      showNotice("Receta eliminada correctamente.");
    }

    function setupAutocomplete(inputId, listId, getItems, onSelect, options = {}) {
      const input = document.getElementById(inputId);
      const list = document.getElementById(listId);

      if (!input || !list) return;

      setupAutocompleteForElement(input, list, getItems, onSelect, options);
    }

    function setupAutocompleteForElement(input, list, getItems, onSelect, options = {}) {
      if (!input || !list) return;

      const update = () => renderAutocomplete(input, list, getItems(), onSelect, options);

      input.addEventListener("input", update);
      input.addEventListener("focus", update);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          list.classList.remove("open");
        }
        if (event.key === "Enter" && list.classList.contains("open")) {
          const firstOption = list.querySelector(".autocomplete-option");
          if (firstOption) {
            event.preventDefault();
            input.value = firstOption.dataset.value || "";
            list.classList.remove("open");
            if (onSelect) onSelect(input.value);
          }
        }
      });
      input.addEventListener("blur", () => {
        setTimeout(() => list.classList.remove("open"), 160);
      });
    }

    function renderAutocomplete(input, list, items, onSelect, options = {}) {
      const term = normalizeSearch(input.value);
      const matches = items
        .filter((item) => !term || normalizeSearch(item).includes(term))
        .slice(0, 14);

      if (!input.value.trim() && !options.showOnEmpty) {
        list.classList.remove("open");
        list.innerHTML = "";
        return;
      }

      if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-empty">No existe todavia. Se guardara al enviar.</div>`;
        list.classList.add("open");
        return;
      }

      list.innerHTML = matches
        .map((item) => `<div class="autocomplete-option" data-value="${escapeAttribute(item)}">${escapeHtml(item)}</div>`)
        .join("");
      list.classList.add("open");

      list.querySelectorAll(".autocomplete-option").forEach((option) => {
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = option.dataset.value || "";
          list.classList.remove("open");
          if (onSelect) {
            onSelect(input.value);
          }
        });
      });
    }

    function normalizeSearch(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    }

    function renderMetrics(metrics) {
      document.getElementById("m-total").textContent = metrics.total || 0;
      document.getElementById("m-pending").textContent = metrics.pendingApproval || 0;
      document.getElementById("m-progress").textContent = metrics.inProgress || 0;
      document.getElementById("m-ready").textContent = metrics.readyToQuote || 0;
      document.getElementById("m-today").textContent = metrics.dueToday || 0;
      document.getElementById("m-overdue").textContent = metrics.overdue || 0;
    }

    function renderRows() {
      const term = search.value.trim().toLowerCase();
      const filtered = allChats.filter((chat) => {
        const matchesFilter =
          activeFilter === "all" ||
          chat.status === activeFilter ||
          (activeFilter === "due_today" && chat.isDueToday) ||
          (activeFilter === "overdue" && chat.isOverdue) ||
          (activeFilter === "unassigned" && !chat.assignedTo);
        const searchable = [
          chat.displayPhone || chat.phone,
          chat.channel,
          chat.assignedTo,
          chat.nextAction,
          chat.data?.fullName,
          chat.data?.eventType,
          chat.data?.venue,
          chat.lastMessage,
        ].join(" ").toLowerCase();

        return matchesFilter && searchable.includes(term);
      });

      if (filtered.length === 0) {
        rows.innerHTML = `<div class="empty">No hay conversaciones para mostrar.</div>`;
        return;
      }

      rows.innerHTML = filtered.map((chat) => `
        <article class="row" onclick="showDetail('${escapeAttribute(chat.phone)}')">
          <div>
            <div class="primary">${escapeHtml(chat.data?.fullName || "Nombre pendiente")}</div>
            <div class="secondary">${escapeHtml(chat.stepLabel || "")}</div>
          </div>
          <div>
            <div class="primary">${escapeHtml(chat.displayPhone || chat.phone)}</div>
            <div class="secondary">${escapeHtml(formatDate(chat.updatedAt))}</div>
          </div>
          <div>
            <div class="primary">${escapeHtml(chat.channel || "Sin canal")}</div>
          </div>
          <div><span class="badge ${escapeAttribute(chat.status)}">${escapeHtml(chat.statusLabel)}</span></div>
          <div>
            <div class="primary">${escapeHtml(chat.assignedTo || "Sin asignar")}</div>
            <div class="secondary">${escapeHtml(chat.followUpDate ? `Seguimiento: ${formatShortDate(chat.followUpDate)}` : "")}</div>
          </div>
          <div>
            <div class="primary">${escapeHtml(chat.data?.eventType || "Sin evento")}</div>
            <div class="secondary">${escapeHtml(chat.data?.eventDate || chat.lastMessage || "")}</div>
            <div class="secondary">${(chat.suggestedQuestions || []).length ? `${chat.suggestedQuestions.length} pregunta(s) sugerida(s)` : ""}</div>
          </div>
          <div>
            <div class="primary">${escapeHtml(chat.nextAction || "Sin definir")}</div>
            <div class="secondary">${escapeHtml(chat.data?.statusReason || "")}</div>
          </div>
          <div class="row-actions" onclick="event.stopPropagation()">
            ${renderActions(chat)}
          </div>
        </article>
      `).join("");
    }

    function renderActions(chat) {
      if (chat.status === "pending_approval" && chat.approvalId) {
        return `
          <button class="approve" onclick="approve('${chat.approvalId}')">Iniciar</button>
          <button class="reject" onclick="rejectRequest('${chat.approvalId}')">Ignorar</button>
          <button class="reject wide-action" onclick="deleteBudget('${escapeAttribute(chat.phone)}')">Eliminar</button>
        `;
      }

      if (chat.status === "pending_approval") {
        return `
          <button class="filter" onclick="loadState(); showNotice('Esta solicitud ya no esta disponible. El panel se actualizo.', 'error')">Actualizar</button>
        `;
      }

      return `
        <button class="filter" onclick="showDetail('${escapeAttribute(chat.phone)}')">Ver</button>
        <button class="filter" onclick="showEditForm('${escapeAttribute(chat.phone)}')">Editar</button>
        <button class="approve" onclick="markStatus('${escapeAttribute(chat.phone)}', 'ready_to_quote')">Listo</button>
        <button class="menu-dot" type="button" onclick="showCommercialActions('${escapeAttribute(chat.phone)}')">...</button>
      `;
    }

    function showCommercialActions(phone) {
      const chat = allChats.find((item) => item.phone === phone);
      if (!chat) return;

      document.getElementById("detail-title").textContent = chat.data?.fullName || chat.displayPhone || "Acciones";
      document.getElementById("detail-subtitle").textContent = "Cambiar estado o eliminar oportunidad";
      document.getElementById("detail-fields").innerHTML = `
        <div class="actions">
          <button class="filter" onclick="hideDetail(); markStatus('${escapeAttribute(phone)}', 'proposal_sent')">Propuesta enviada</button>
          <button class="filter" onclick="hideDetail(); markStatus('${escapeAttribute(phone)}', 'follow_up')">Seguimiento</button>
          <button class="reject" onclick="hideDetail(); deleteBudget('${escapeAttribute(phone)}')">Eliminar</button>
        </div>
      `;
      document.getElementById("detail").classList.add("open");
    }

    async function approve(id) {
      await sendDecision("/api/approve", id);
    }

    async function rejectRequest(id) {
      await sendDecision("/api/reject", id);
    }

    async function sendDecision(url, id) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();

      if (!result.ok) {
        showNotice(result.error || "No se pudo completar la accion.", "error");
      } else {
        showNotice("Accion realizada correctamente.");
      }

      await loadState();
    }

    async function deleteBudget(phone) {
      const chat = allChats.find((item) => item.phone === phone);
      const name = chat?.data?.fullName || chat?.displayPhone || chat?.phone || "este presupuesto";
      const confirmed = confirm(`Desea eliminar definitivamente ${name}? Esta accion no se puede deshacer.`);

      if (!confirmed) {
        return;
      }

      const response = await fetch("/api/delete-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json();

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar el presupuesto.", "error");
        return;
      }

      hideDetail();
      hideEditForm();
      showNotice("Presupuesto eliminado correctamente.");
      await loadState();
    }

    function showNotice(message, type = "info") {
      notice.textContent = message;
      notice.className = `notice open ${type === "error" ? "error" : ""}`;

      clearTimeout(showNotice.timer);
      showNotice.timer = setTimeout(() => {
        notice.className = "notice";
      }, 4500);
    }

    async function markStatus(phone, status) {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, status }),
      });
      const result = await response.json();

      if (!result.ok) {
        alert(result.error || "No se pudo actualizar el estado.");
      }

      await loadState();
    }

    function showManualForm() {
      document.getElementById("manual").classList.add("open");
    }

    function hideManualForm() {
      document.getElementById("manual").classList.remove("open");
      document.getElementById("manual-form").reset();
    }

    function closeManual(event) {
      if (event.target.id === "manual") {
        hideManualForm();
      }
    }

    async function showPurchaseForm() {
      await loadPurchaseOptions();
      const form = document.getElementById("purchase-form");
      form.reset();
      document.getElementById("purchase-title").textContent = "Cargar compra";
      resetPurchaseItems();
      setFormValue(form, "date", new Date().toISOString().slice(0, 10));
      document.getElementById("purchase").classList.add("open");
      renderPurchaseDraftTools();
    }

    async function editPurchase(id) {
      await loadPurchaseOptions();
      const purchase = (erpData.purchases || []).find((item) => item.id === id);
      if (!purchase) {
        showNotice("No encontre esa compra para editar.", "error");
        return;
      }

      const form = document.getElementById("purchase-form");
      form.reset();
      document.getElementById("purchase-title").textContent = "Editar compra";
      setFormValue(form, "id", purchase.id || "");
      setFormValue(form, "date", purchase.date || "");
      setFormValue(form, "provider", purchase.provider || "");
      setFormValue(form, "invoiceType", purchase.invoiceType || "");
      setFormValue(form, "ivaRate", purchase.ivaRate || "");
      setFormValue(form, "eventName", purchase.eventName || "");
      setFormValue(form, "paymentStatus", purchase.paymentStatus || "Pendiente");
      setFormValue(form, "paymentMethod", purchase.paymentMethod || "");
      setFormValue(form, "fundsSource", purchase.fundsSource || "");
      setFormValue(form, "notes", purchase.notes || "");
      resetPurchaseItems(purchase.lineItems || []);
      document.getElementById("purchase").classList.add("open");
      renderPurchaseDraftTools();
    }

    function showPurchaseActions(id) {
      const purchase = (erpData.purchases || []).find((item) => item.id === id);
      if (!purchase) return;

      document.getElementById("purchase-action-title").textContent = purchase.provider || "Compra";
      document.getElementById("purchase-action-subtitle").textContent = `${formatShortDate(purchase.date) || purchase.date || ""} · ${formatCurrency(purchase.totalAmount || 0)}`;
      document.getElementById("purchase-action-body").innerHTML = `
        ${field("Producto", purchase.description || "Sin descripcion")}
        ${field("Evento", purchase.eventName || "Sin evento")}
        ${field("Estado", purchase.paymentStatus || "Pendiente")}
        ${field("Medio / origen", [purchase.paymentMethod, purchase.fundsSource].filter(Boolean).join(" · ") || "Sin definir")}
        ${isPersonalFundsSource(purchase.fundsSource) ? field(`Reintegro ${purchase.fundsSource || "personal"}`, `${purchase.reimbursementStatus || "Pendiente"} · pendiente ${formatCurrency(purchase.reimbursementPendingAmount || 0)}`) : ""}
        <div class="actions">
          <button class="approve" onclick="hidePurchaseActions(); editPurchase('${escapeAttribute(purchase.id)}')">Editar compra</button>
          <button class="reject" onclick="hidePurchaseActions(); deletePurchase('${escapeAttribute(purchase.id)}')">Eliminar compra</button>
        </div>
      `;
      document.getElementById("purchase-action-detail").classList.add("open");
    }

    function hidePurchaseActions() {
      document.getElementById("purchase-action-detail").classList.remove("open");
    }

    function closePurchaseActions(event) {
      if (event.target.id === "purchase-action-detail") {
        hidePurchaseActions();
      }
    }

    function hidePurchaseForm() {
      document.getElementById("purchase").classList.remove("open");
      document.getElementById("purchase-form").reset();
      document.getElementById("purchase-title").textContent = "Cargar compra";
      resetPurchaseItems();
      renderPurchaseDraftTools();
    }

    function closePurchase(event) {
      if (event.target.id === "purchase") {
        hidePurchaseForm();
      }
    }

    function resetPurchaseItems(items = []) {
      purchaseItemCounter = 0;
      document.getElementById("purchase-items").innerHTML = "";

      if (items.length) {
        items.forEach((item) => addPurchaseItemRow(item));
        return;
      }

      addPurchaseItemRow();
    }

    function getPurchaseDraftPayload() {
      const form = document.getElementById("purchase-form");
      return {
        id: form.elements.id.value || "",
        date: form.elements.date.value || "",
        provider: form.elements.provider.value || "",
        invoiceType: form.elements.invoiceType.value || "",
        ivaRate: form.elements.ivaRate.value || "",
        eventName: form.elements.eventName.value || "",
        paymentStatus: form.elements.paymentStatus.value || "",
        paymentMethod: form.elements.paymentMethod.value || "",
        fundsSource: form.elements.fundsSource.value || "",
        notes: form.elements.notes.value || "",
        items: getPurchaseItems(),
      };
    }

    function hasMeaningfulPurchaseDraft(payload) {
      return Boolean(
        payload?.provider ||
        payload?.eventName ||
        payload?.notes ||
        (payload?.items || []).some((item) => item.description || item.unitAmount)
      );
    }

    function savePurchaseDraft() {
      const payload = getPurchaseDraftPayload();
      if (!hasMeaningfulPurchaseDraft(payload)) return;
      localStorage.setItem("catering-purchase-draft", JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      }));
      renderPurchaseDraftTools();
    }

    function getPurchaseDraft() {
      try {
        return JSON.parse(localStorage.getItem("catering-purchase-draft") || "null");
      } catch (error) {
        return null;
      }
    }

    function clearPurchaseDraft() {
      localStorage.removeItem("catering-purchase-draft");
      renderPurchaseDraftTools();
    }

    function renderPurchaseDraftTools() {
      const box = document.getElementById("purchase-draft-tools");
      if (!box) return;
      const draft = getPurchaseDraft();
      if (!draft?.payload || !hasMeaningfulPurchaseDraft(draft.payload)) {
        box.className = "notice";
        box.innerHTML = "";
        return;
      }
      box.className = "notice open";
      box.innerHTML = `
        Borrador guardado ${escapeHtml(formatDate(draft.savedAt) || "")}: ${escapeHtml(draft.payload.provider || "Sin proveedor")} · ${(draft.payload.items || []).length} producto(s)
        <div class="actions" style="margin-top:8px;">
          <button class="filter" type="button" onclick="restorePurchaseDraft()">Restaurar borrador</button>
          <button class="reject" type="button" onclick="clearPurchaseDraft()">Descartar</button>
        </div>
      `;
    }

    function restorePurchaseDraft() {
      const draft = getPurchaseDraft();
      if (!draft?.payload) return;
      fillPurchaseForm(draft.payload);
      showNotice("Borrador de compra restaurado.", "success");
    }

    function fillPurchaseForm(data = {}) {
      const form = document.getElementById("purchase-form");
      setFormValue(form, "id", data.id || "");
      setFormValue(form, "date", data.date || "");
      setFormValue(form, "provider", data.provider || "");
      setFormValue(form, "invoiceType", data.invoiceType || "");
      setFormValue(form, "ivaRate", data.ivaRate || "0");
      setFormValue(form, "eventName", data.eventName || "");
      setFormValue(form, "paymentStatus", data.paymentStatus || "Pendiente");
      setFormValue(form, "paymentMethod", data.paymentMethod || "");
      setFormValue(form, "fundsSource", data.fundsSource || "");
      setFormValue(form, "notes", data.notes || "");
      resetPurchaseItems(data.items || []);
      renderPurchaseDraftTools();
    }

    function addPurchaseItemRow(item = {}) {
      const id = `purchase-item-${++purchaseItemCounter}`;
      const container = document.getElementById("purchase-items");
      const defaultIvaRate = getDefaultPurchaseItemIvaRate();
      const itemIvaRate = item.ivaRate ?? item.iva ?? defaultIvaRate;
      const row = document.createElement("div");
      row.className = "purchase-item";
      row.innerHTML = `
        <div class="autocomplete">
          <input class="purchase-item-description" autocomplete="off" placeholder="Producto o descripcion" value="${escapeAttribute(item.description || "")}" required>
          <div id="${id}-suggestions" class="autocomplete-list"></div>
        </div>
        <input class="purchase-item-quantity" type="number" min="0.01" step="0.01" placeholder="Cant." value="${escapeAttribute(item.quantity || 1)}" required>
        <input class="purchase-item-unit" type="number" min="0.01" step="0.01" placeholder="Unitario s/IVA" value="${escapeAttribute(item.unitAmount || "")}" required>
        <select class="purchase-item-iva">
          <option value="0" ${Number(itemIvaRate || 0) === 0 ? "selected" : ""}>IVA 0%</option>
          <option value="0.105" ${Number(itemIvaRate || 0) === 0.105 ? "selected" : ""}>IVA 10.5%</option>
          <option value="0.21" ${Number(itemIvaRate || 0) === 0.21 ? "selected" : ""}>IVA 21%</option>
          <option value="0.27" ${Number(itemIvaRate || 0) === 0.27 ? "selected" : ""}>IVA 27%</option>
        </select>
        <button class="reject icon-action" type="button" onclick="removePurchaseItemRow(this)">X</button>
      `;
      container.appendChild(row);

      setupAutocompleteForElement(
        row.querySelector(".purchase-item-description"),
        row.querySelector(".autocomplete-list"),
        () => purchaseOptions.products || []
      );

      row.querySelector(".purchase-item-iva").addEventListener("change", syncPurchaseDefaultIvaFromFirstItem);
      savePurchaseDraft();
    }

    function getDefaultPurchaseItemIvaRate() {
      const firstItemIva = document.querySelector("#purchase-items .purchase-item:first-child .purchase-item-iva")?.value;
      return firstItemIva || document.getElementById("purchase-form")?.elements.ivaRate?.value || "0";
    }

    function syncPurchaseDefaultIvaFromFirstItem() {
      const firstItemIva = document.querySelector("#purchase-items .purchase-item:first-child .purchase-item-iva")?.value;
      const form = document.getElementById("purchase-form");
      if (firstItemIva && form?.elements.ivaRate) {
        form.elements.ivaRate.value = firstItemIva;
      }
    }

    function removePurchaseItemRow(button) {
      const rows = document.querySelectorAll("#purchase-items .purchase-item");

      if (rows.length <= 1) {
        showNotice("Debe quedar al menos un producto.", "error");
        return;
      }

      button.closest(".purchase-item").remove();
      savePurchaseDraft();
    }

    function getPurchaseItems() {
      return Array.from(document.querySelectorAll("#purchase-items .purchase-item"))
        .map((row) => ({
          description: row.querySelector(".purchase-item-description").value.trim(),
          quantity: row.querySelector(".purchase-item-quantity").value,
          unitAmount: row.querySelector(".purchase-item-unit").value,
          ivaRate: row.querySelector(".purchase-item-iva").value,
        }))
        .filter((item) => item.description);
    }

    async function previewInvoicePhoto(event) {
      const file = event.target.files?.[0];
      const preview = document.getElementById("invoice-preview");

      if (!file) {
        preview.classList.remove("open");
        preview.removeAttribute("src");
        return;
      }

      const dataUrl = await fileToDataUrl(file);
      preview.src = dataUrl;
      preview.classList.add("open");
    }

    function clearInvoicePhoto() {
      const input = document.getElementById("invoice-photo");
      const preview = document.getElementById("invoice-preview");
      input.value = "";
      preview.classList.remove("open");
      preview.removeAttribute("src");
    }

    async function analyzeInvoicePhoto() {
      const input = document.getElementById("invoice-photo");
      const button = document.getElementById("invoice-read-button");
      const status = document.getElementById("invoice-reader-status");
      const file = input.files?.[0];

      if (!file) {
        showNotice("Primero suba una foto de factura.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Leyendo...";
      status.textContent = "Procesando la imagen en esta computadora. Puede tardar unos segundos.";
      showNotice("Leyendo factura con herramienta gratuita local. Revise los datos antes de enviar.");

      try {
        const imageDataUrl = await fileToDataUrl(file);
        const response = await fetch("/api/purchase-invoice-ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
        const result = await readJsonResponse(response);

        if (!result.ok) {
          status.textContent = "No se pudo completar la lectura. Puede cargar los datos manualmente.";
          showNotice(result.error || "No se pudo leer la factura.", "error");
          return;
        }

        fillPurchaseFormFromInvoice(result.result || {});
        status.textContent = "Lectura completada. Revise proveedor, productos e importes antes de cargar.";
        showNotice("Lectura completada. Revise y corrija antes de enviar.");
      } finally {
        button.disabled = false;
        button.textContent = "Leer factura gratis";
      }
    }

    function fillPurchaseFormFromInvoice(data) {
      const form = document.getElementById("purchase-form");
      setFormValue(form, "date", data.date || form.elements.date.value);
      setFormValue(form, "provider", data.provider || form.elements.provider.value);
      setFormValue(form, "invoiceType", data.invoiceType || form.elements.invoiceType.value);
      setFormValue(form, "ivaRate", data.ivaRate || form.elements.ivaRate.value);

      if (Array.isArray(data.lineItems) && data.lineItems.length) {
        resetPurchaseItems(data.lineItems);
      } else {
        resetPurchaseItems([{
          description: data.description || "",
          quantity: data.quantity || 1,
          unitAmount: data.unitAmount || "",
          ivaRate: data.ivaRate || form.elements.ivaRate.value,
        }]);
      }

      setFormValue(form, "paymentMethod", data.paymentMethod || form.elements.paymentMethod.value);

      const notes = [
        data.invoiceNumber ? `Factura: ${data.invoiceNumber}` : "",
        data.cuit ? `CUIT: ${data.cuit}` : "",
        data.total ? `Total leido: ${data.total}` : "",
        data.notes || "",
      ].filter(Boolean).join(" | ");

      if (notes) {
        setFormValue(form, "notes", notes);
      }
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function createPurchase(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const payload = Object.fromEntries(formData.entries());
      payload.items = getPurchaseItems();

      if (!payload.items.length) {
        showNotice("Ingrese al menos un producto.", "error");
        return;
      }

      let response;
      let result;
      try {
        response = await fetch("/api/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = await readJsonResponse(response);
      } catch (error) {
        savePurchaseDraft();
        showNotice("El panel local no esta respondiendo. La compra quedo guardada como borrador en este navegador; reinicie el panel y restaure el borrador.", "error");
        return;
      }

      if (!result.ok) {
        savePurchaseDraft();
        showNotice(result.error || "No se pudo cargar la compra.", "error");
        return;
      }

      clearPurchaseDraft();
      hidePurchaseForm();
      await loadPurchaseOptions();
      await loadErp();
      const added = result.result?.addedOptions || {};
      const extraMessage = [
        added.provider ? "proveedor nuevo guardado" : "",
        added.product ? "producto nuevo guardado" : "",
      ].filter(Boolean).join(", ");
      showNotice(`${result.result?.message || "Compra cargada correctamente."}${extraMessage ? ` (${extraMessage})` : ""}`);
    }

    async function deletePurchase(id) {
      const purchase = (erpData.purchases || []).find((item) => item.id === id);
      if (!purchase) return;
      if (!confirm(`Eliminar compra de ${purchase.provider || ""} por ${formatCurrency(purchase.totalAmount || 0)}?`)) return;

      const response = await fetch("/api/delete-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse(response);

      if (!result.ok) {
        showNotice(result.error || "No se pudo eliminar la compra.", "error");
        return;
      }

      await loadErp();
      showNotice(result.result?.message || "Compra eliminada correctamente.");
    }

    async function readJsonResponse(response) {
      const text = await response.text();

      try {
        return text ? JSON.parse(text) : { ok: response.ok };
      } catch (error) {
        return {
          ok: false,
          error: response.ok
            ? `Respuesta inesperada del servidor: ${text}`
            : `El bot respondio ${response.status}: ${text || response.statusText}`,
        };
      }
    }

    async function postJson(url, payload = {}) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return readJsonResponse(response);
    }

    async function addPurchaseOptionFromPrompt(type) {
      const labels = {
        provider: "proveedor",
        product: "producto",
      };
      const value = prompt(`Ingrese el nuevo ${labels[type] || "dato"}:`);

      if (!value || !value.trim()) {
        return;
      }

      const response = await fetch("/api/purchase-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const result = await response.json();

      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el dato.", "error");
        return;
      }

      await loadPurchaseOptions();

      if (type === "provider") {
        setFormValue(document.getElementById("purchase-form"), "provider", result.result.value);
      }

      if (type === "product") {
        setFormValue(document.getElementById("purchase-form"), "description", result.result.value);
      }

      showNotice(`${labels[type] || "Dato"} guardado correctamente.`);
    }

    function getEditableEventMenuItems(event) {
      const items = event.menuItems || [];
      if (items.length === 1 && !items[0].quantity && !items[0].detail && String(items[0].name || "").length > 120) {
        return splitLongMenuText(items[0].name).map((name) => ({ name }));
      }
      return items;
    }

    async function addTablewareProductOption() {
      const form = document.getElementById("erp-event-form");
      const value = form?.elements.tablewareDetail?.value?.trim() || "";
      if (!value) {
        showNotice("Escriba primero el producto de vajilla o descartable.", "error");
        return;
      }

      const response = await fetch("/api/purchase-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "product", value }),
      });
      const result = await readJsonResponse(response);
      if (!result.ok) {
        showNotice(result.error || "No se pudo guardar el producto.", "error");
        return;
      }
      purchaseOptions.products = result.options?.products || purchaseOptions.products || [];
      renderPurchaseOptions();
      showNotice("Producto agregado a sugerencias.");
    }

    async function createManualBudget(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const payload = Object.fromEntries(formData.entries());

      const response = await fetch("/api/manual-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!result.ok) {
        alert(result.error || "No se pudo guardar el pedido.");
        return;
      }

      hideManualForm();
      await loadState();
    }

    function showEditForm(phone) {
      const chat = allChats.find((item) => item.phone === phone);
      if (!chat) return;

      const form = document.getElementById("edit-form");
      const data = chat.data || {};
      setFormValue(form, "phone", chat.phone);
      setFormValue(form, "channel", chat.channel || data.channel || "");
      setFormValue(form, "status", chat.status || "in_progress");
      setFormValue(form, "assignedTo", data.assignedTo || chat.assignedTo || "");
      setFormValue(form, "fullName", data.fullName || "");
      setFormValue(form, "externalPhone", chat.displayPhone || data.externalPhone || "");
      setFormValue(form, "eventType", data.eventType || "");
      setFormValue(form, "eventDate", data.eventDate || "");
      setFormValue(form, "guestCount", data.guestCount || "");
      setFormValue(form, "venue", data.venue || "");
      setFormValue(form, "serviceType", data.serviceType || "");
      setFormValue(form, "eventMoments", data.eventMoments || "");
      setFormValue(form, "selectedMenu", data.selectedMenu || "");
      setFormValue(form, "includesDrinks", data.includesDrinks || "");
      setFormValue(form, "drinkType", data.drinkType || "");
      setFormValue(form, "serviceMode", data.serviceMode || "");
      setFormValue(form, "trayServiceType", data.trayServiceType || "");
      setFormValue(form, "foodFormat", data.foodFormat || "");
      setFormValue(form, "tableware", data.tableware || "");
      setFormValue(form, "staff", data.staff || "");
      setFormValue(form, "kitchenAvailable", data.kitchenAvailable || "");
      setFormValue(form, "schedule", data.schedule || "");
      setFormValue(form, "budgetRange", data.budgetRange || "");
      setFormValue(form, "nextAction", data.nextAction || "");
      setFormValue(form, "followUpDate", data.followUpDate || chat.followUpDate || "");
      setFormValue(form, "statusReason", data.statusReason || "");
      setFormValue(form, "dietaryRestrictions", data.dietaryRestrictions || "");
      setFormValue(form, "commercialNotes", data.commercialNotes || "");
      setFormValue(form, "notes", data.notes || "");

      document.getElementById("edit").classList.add("open");
    }

    function setFormValue(form, name, value) {
      const field = form.elements[name];
      if (field) {
        field.value = value;
      }
    }

    function hideEditForm() {
      document.getElementById("edit").classList.remove("open");
      document.getElementById("edit-form").reset();
    }

    function closeEdit(event) {
      if (event.target.id === "edit") {
        hideEditForm();
      }
    }

    async function updateBudget(event) {
      event.preventDefault();
      const formData = new FormData(event.target);
      const payload = Object.fromEntries(formData.entries());

      const response = await fetch("/api/update-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!result.ok) {
        alert(result.error || "No se pudieron guardar los cambios.");
        return;
      }

      hideEditForm();
      await loadState();
    }

    function showDetail(phone) {
      const chat = allChats.find((item) => item.phone === phone);
      if (!chat) return;

      document.getElementById("detail-title").textContent = chat.data?.fullName || "Nombre pendiente";
      document.getElementById("detail-subtitle").textContent = chat.displayPhone || chat.phone;
      document.getElementById("detail-fields").innerHTML = `
        <div class="actions" style="margin-bottom:8px;">
          <button class="approve" onclick="hideDetail(); showEditForm('${escapeAttribute(chat.phone)}')">Editar presupuesto</button>
          <button class="reject" onclick="deleteBudget('${escapeAttribute(chat.phone)}')">Eliminar</button>
        </div>
        ${field("Estado", chat.statusLabel)}
        ${field("Responsable", chat.assignedTo || "Sin asignar")}
        ${field("Proxima accion", chat.nextAction || "Sin definir")}
        ${field("Fecha de seguimiento", chat.followUpDate ? formatShortDate(chat.followUpDate) : "Sin fecha")}
        ${field("Motivo / estado comercial", chat.data?.statusReason || "Sin detalle")}
        ${field("Canal de origen", chat.channel || "Sin canal")}
        ${field("Telefono visible", chat.displayPhone || "Telefono no disponible")}
        ${field("Paso actual", chat.stepLabel)}
        ${field("Ultimo mensaje", chat.lastMessage || "Sin registro")}
        ${field("Nombre completo", chat.data?.fullName || "Pendiente")}
        ${field("Tipo de evento", chat.data?.eventType || "Pendiente")}
        ${field("Fecha estimada", chat.data?.eventDate || "Pendiente")}
        ${field("Cantidad de invitados", chat.data?.guestCount || "Pendiente")}
        ${field("Lugar o zona", chat.data?.venue || "Pendiente")}
        ${field("Servicio gastronomico", chat.data?.serviceType || "Pendiente")}
        ${field("Momentos del evento", chat.data?.eventMoments || "Pendiente")}
        ${field("Menu elegido", chat.data?.selectedMenu || "Pendiente")}
        ${field("Bebidas", chat.data?.includesDrinks || "Pendiente")}
        ${field("Detalle de bebidas", chat.data?.drinkType || "Pendiente")}
        ${field("Modalidad", chat.data?.serviceMode || "Pendiente")}
        ${field("Tipo de bandejeo", chat.data?.trayServiceType || "Pendiente")}
        ${field("Formato gastronomico", chat.data?.foodFormat || "Pendiente")}
        ${field("Vajilla / cristaleria", chat.data?.tableware || "Pendiente")}
        ${field("Personal", chat.data?.staff || "Pendiente")}
        ${field("Cocina / apoyo", chat.data?.kitchenAvailable || "Pendiente")}
        ${field("Horarios / jornadas", chat.data?.schedule || "Pendiente")}
        ${field("Presupuesto objetivo", chat.data?.budgetRange || "Pendiente")}
        ${field("Proxima accion", chat.data?.nextAction || "Pendiente")}
        ${field("Restricciones alimentarias", chat.data?.dietaryRestrictions || "Pendiente")}
        ${field("Notas comerciales", chat.data?.commercialNotes || "Sin notas")}
        ${field("Notas internas", chat.data?.notes || "Sin notas")}
        ${suggestionsBlock(chat.suggestedQuestions || [])}
        ${historyBlock(chat.history || [])}
      `;
      document.getElementById("detail").classList.add("open");
    }

    function field(label, value) {
      return `<div class="field"><label>${escapeHtml(label)}</label><div>${escapeHtml(value)}</div></div>`;
    }

    function suggestionsBlock(items) {
      if (!items.length) {
        return `<div class="field"><label>Preguntas sugeridas</label><div>No hay preguntas sugeridas por ahora.</div></div>`;
      }

      return `
        <div class="field">
          <label>Preguntas sugeridas para el asesor</label>
          <div>${items.map((item) => `- ${escapeHtml(item)}`).join("<br>")}</div>
        </div>
      `;
    }

    function historyBlock(items) {
      if (!items.length) {
        return `<div class="field"><label>Historial</label><div>Sin movimientos registrados.</div></div>`;
      }

      return `
        <div class="field">
          <label>Historial de movimientos</label>
          <div>${items.slice(0, 12).map((item) => {
            const detail = item.detail ? ` - ${escapeHtml(item.detail)}` : "";
            return `${escapeHtml(formatDate(item.at))} - ${escapeHtml(item.actor || "Sistema")}: ${escapeHtml(item.action || "")}${detail}`;
          }).join("<br>")}</div>
        </div>
      `;
    }

    function hideDetail() {
      document.getElementById("detail").classList.remove("open");
      document.querySelector("#detail .detail-panel")?.classList.remove("wide", "extra-wide", "event-wide");
    }

    function closeDetail(event) {
      if (event.target.id === "detail") {
        hideDetail();
      }
    }

    function formatCurrency(value) {
      return Number(value || 0).toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      });
    }

    function formatPercent(value) {
      return `${Number(value || 0).toLocaleString("es-AR", {
        maximumFractionDigits: 1,
      })}%`;
    }

    function formatDate(value) {
      if (!value) return "";
      return new Date(value).toLocaleString();
    }

    function formatShortDate(value) {
      if (!value) return "";
      const [year, month, day] = String(value).split("-");
      return day && month && year ? `${day}/${month}/${year}` : value;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value).replaceAll("`", "&#096;");
    }

    function closeOpenModals() {
      document.querySelectorAll(".detail.open").forEach((modal) => modal.classList.remove("open"));
      document.querySelectorAll(".menu-popover.open").forEach((menu) => menu.classList.remove("open"));
      document.querySelectorAll(".logistics-item-menu.open").forEach((menu) => menu.classList.remove("open"));
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeOpenModals();
      }
    });

    bootstrapPanel();
  