import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dict = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8');
const layout = fs.readFileSync('app/dashboard/layout.tsx', 'utf8');
const shell = fs.readFileSync('components/layout/dashboard-shell.tsx', 'utf8');
const sidebar = fs.readFileSync('components/layout/sidebar.tsx', 'utf8');
const header = fs.readFileSync('components/layout/header.tsx', 'utf8');
const langSwitch = fs.readFileSync('components/layout/app-language-switch.tsx', 'utf8');
const homePage = fs.readFileSync('app/dashboard/page.tsx', 'utf8');
const dashboardHome = fs.readFileSync('components/dashboard/dashboard-home.tsx', 'utf8');

test('dashboard layout resolves locale server-side and feeds the shell', () => {
  assert.match(layout, /getDictionaryForRequest\(\)/);
  assert.match(layout, /<DashboardShell locale=\{locale\} dictionary=\{dictionary\}>/);
  assert.match(shell, /<Sidebar dictionary=\{dictionary\} locale=\{locale\} \/>/);
  assert.match(shell, /<Header sidebarCollapsed=\{collapsed\} onToggleSidebar=\{toggleSidebar\} locale=\{locale\} dictionary=\{dictionary\} \/>/);
});

test('sidebar renders every label from the dictionary', () => {
  // Menu entries keyed, not labelled, in source.
  assert.match(sidebar, /itemKey: 'home', href: '\/dashboard'/);
  assert.match(sidebar, /group: 'areas', moduleKey: 'mant_operaciones'/);
  assert.match(sidebar, /\{t\.items\[item\.itemKey\]\}/);
  assert.match(sidebar, /\{t\.groups\[group\]\}/);
  assert.match(sidebar, /\{dictionary\.app\.header\.signOut\}/);
  assert.match(sidebar, /aria-label=\{isOpen\?t\.close:t\.open\}/);
  assert.match(sidebar, /\{t\.tagline\}/);
  // No hardcoded Spanish chrome may remain.
  for (const literal of ['Inicio', 'Gestión diaria', 'Cerrar navegación', 'Navegación principal', "label:'", "group:'Principal'", "group:'Áreas'"]) {
    assert.doesNotMatch(sidebar, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `sidebar must not hardcode ${literal}`);
  }
});

test('header breadcrumbs, roles and actions come from the dictionary', () => {
  assert.match(header, /const t=dictionary\.app\.header;/);
  assert.match(header, /const routes=t\.routes as Record<string,string>;/);
  assert.match(header, /const roleLabels=t\.roles as Record<string,string>;/);
  assert.match(header, /sidebarAction=sidebarCollapsed\?t\.showMenu:t\.hideMenu/);
  assert.match(header, /aria-label=\{t\.breadcrumbLabel\}/);
  assert.match(header, /aria-label=\{t\.viewCalendar\}/);
  assert.match(header, /showOperationalAlerts=\{canSeeAlerts\}/);
  assert.match(header, /\{t\.signOut\}/);
  assert.doesNotMatch(header, /const routeLabels/);
  assert.doesNotMatch(header, /Mostrar menú/);
  assert.doesNotMatch(header, /Ruta de navegación/);
  assert.doesNotMatch(header, /Sin rol asignado/);
});

test('app language switcher forces a full document navigation', () => {
  assert.match(langSwitch, /locale === 'en' \? pathname : `\/en\$\{pathname\}`/);
  assert.match(langSwitch, /preventDefault\(\)/);
  assert.match(langSwitch, /window\.location\.assign\(target\)/);
  assert.match(langSwitch, /lang=\{locale === 'en' \? 'es' : 'en'\}/);
});

test('app namespace carries chrome copy for both locales', () => {
  assert.match(dict, /app: \{/);
  // es
  assert.match(dict, /home: 'Inicio'/);
  assert.match(dict, /'ordenes-trabajo': 'Órdenes de trabajo'/);
  assert.match(dict, /superadmin: 'Administrador general'/);
  assert.match(dict, /signOut: 'Cerrar sesión'/);
  assert.match(dict, /openUserMenu: 'Abrir menú de usuario'/);
  // en
  assert.match(dict, /home: 'Home'/);
  assert.match(dict, /'ordenes-trabajo': 'Work orders'/);
  assert.match(dict, /superadmin: 'General administrator'/);
  assert.match(dict, /signOut: 'Sign out'/);
  assert.match(dict, /openUserMenu: 'Open user menu'/);
});

test('dashboard home is a server wrapper over a locale-aware client', () => {
  assert.match(homePage, /getDictionaryForRequest\(\)/);
  assert.match(homePage, /<DashboardHome locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(dashboardHome, /const t = dictionary\.app\.home;/);
  assert.match(dashboardHome, /t\.modes\.plant/);
  assert.match(dashboardHome, /t\.modes\.maintenance/);
  assert.match(dashboardHome, /t\.modes\.drilling/);
  assert.match(dashboardHome, /t\.modes\.management/);
  assert.match(dashboardHome, /t\.modes\.general/);
  const priorities = fs.readFileSync('components/dashboard/home-decision-priorities.tsx', 'utf8');
  assert.match(priorities, /dictionary\.app\.home\.priorities/);
  // No hardcoded role-mode copy may remain in the component.
  for (const literal of ['Mi Planta', 'Mi Mantención', 'Mi Bodega', 'Resumen ejecutivo', 'Acciones pendientes', 'Por qué importa:']) {
    assert.doesNotMatch(dashboardHome, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `dashboard-home must not hardcode ${literal}`);
  }
  assert.match(shell, /pathname === '\/dashboard' \? <HomeDecisionPriorities locale=\{locale\} dictionary=\{dictionary\} \/> : null/);
});

test('actions inbox is a server wrapper over a locale-aware client', () => {
  const actionsPage = fs.readFileSync('app/dashboard/acciones/page.tsx', 'utf8');
  const inbox = fs.readFileSync('components/actions/actions-inbox.tsx', 'utf8');

  assert.match(actionsPage, /getDictionaryForRequest\(\)/);
  assert.match(actionsPage, /<ActionsInbox locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(inbox, /const t = dictionary\.app\.actions;/);
  assert.match(inbox, /t\.lanes\[lane\]/);
  assert.match(inbox, /t\.families\[key\]/);
  assert.match(inbox, /t\.severity\[task\.severity\]/);
  // No hardcoded actions copy may remain in the component.
  for (const literal of ['Mis acciones', 'Operación al día', 'Escalaciones', 'Calidad de datos', 'Marcar pendiente', 'Operación actual']) {
    assert.doesNotMatch(inbox, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `actions-inbox must not hardcode ${literal}`);
  }
});

test('context navs render every label from the dictionary', () => {
  const daily = fs.readFileSync('components/layout/daily-management-context-nav.tsx', 'utf8');
  const docs = fs.readFileSync('components/layout/documentation-context-nav.tsx', 'utf8');
  const attention = fs.readFileSync('components/layout/operational-attention-context-nav.tsx', 'utf8');
  const management = fs.readFileSync('components/layout/management-context-nav.tsx', 'utf8');
  const shellSrc = fs.readFileSync('components/layout/dashboard-shell.tsx', 'utf8');
  const decisionLayout = fs.readFileSync('app/dashboard/decisiones/layout.tsx', 'utf8');
  const saludLayout = fs.readFileSync('app/dashboard/calidad-datos/salud/layout.tsx', 'utf8');
  const desempenoLayout = fs.readFileSync('app/dashboard/desempeno/layout.tsx', 'utf8');

  for (const nav of [daily, docs, attention, management]) {
    assert.match(nav, /dictionary\.app\./);
    assert.doesNotMatch(nav, /label: '/);
  }
  assert.match(daily, /dictionary\.app\.dailyNav/);
  assert.match(docs, /dictionary\.app\.docsNav/);
  assert.match(attention, /dictionary\.app\.attentionNav/);
  assert.match(management, /dictionary\.app\.managementNav/);
  assert.match(shellSrc, /<DocumentationContextNav dictionary=\{dictionary\} \/>/);
  assert.match(shellSrc, /<OperationalAttentionContextNav dictionary=\{dictionary\} \/>/);
  assert.match(decisionLayout, /getDictionaryForRequest\(\)/);
  assert.match(decisionLayout, /<DecisionCenterShell dictionary=\{dictionary\}>/);
  assert.match(saludLayout, /<ManagementContextNav dictionary=\{dictionary\} \/>/);
  assert.match(desempenoLayout, /<ManagementContextNav dictionary=\{dictionary\} \/>/);
  // No hardcoded nav labels may remain.
  for (const literal of ['Revisión diaria', 'Acciones del cargo', 'Biblioteca', 'Control documental', 'Asistente Ariel', 'Centro ejecutivo', 'Navegación gerencial']) {
    assert.doesNotMatch(daily + docs + attention + management, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `context navs must not hardcode ${literal}`);
  }
});

test('operational calendar is a server wrapper over a locale-aware client', () => {
  const calendarPage = fs.readFileSync('app/dashboard/tareas/page.tsx', 'utf8');
  const calendar = fs.readFileSync('components/calendar/operational-calendar.tsx', 'utf8');

  assert.match(calendarPage, /getDictionaryForRequest\(\)/);
  assert.match(calendarPage, /<OperationalCalendar locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(calendar, /const t = dictionary\.app\.calendar;/);
  assert.match(calendar, /t\.tabs\.(all|overdue|today|week)/);
  assert.match(calendar, /relativeLabel\(task\.days_until, t\)/);
  assert.match(calendar, /formatDate\(task\.date, dateLocale\)/);
  // No hardcoded calendar copy may remain in the component.
  for (const literal of ['Calendario operacional', 'Cargando compromisos', 'Próximos 7 días', 'No hay compromisos para este filtro']) {
    assert.doesNotMatch(calendar, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `operational-calendar must not hardcode ${literal}`);
  }
});

test('maintenance home is a server wrapper over a locale-aware client', () => {
  const maintenancePage = fs.readFileSync('app/dashboard/mantenimiento/page.tsx', 'utf8');
  const maintenance = fs.readFileSync('components/dashboard/maintenance-home.tsx', 'utf8');

  assert.match(maintenancePage, /getDictionaryForRequest\(\)/);
  assert.match(maintenancePage, /<MaintenanceHome locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(maintenance, /const t = dictionary\.app\.maintenance;/);
  assert.match(maintenance, /t\.queue\.titles\[mode as WorkMode\]/);
  assert.match(maintenance, /t\.kinds\[kindKey\]/);
  // No hardcoded maintenance copy may remain in the component.
  for (const literal of ['Qué debo decidir o destrabar', 'Cola de planificación', 'Fuera de servicio', 'Calculando prioridades', 'Flujo operacional']) {
    assert.doesNotMatch(maintenance, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `maintenance-home must not hardcode ${literal}`);
  }
});

test('daily review is a server wrapper over a locale-aware client', () => {
  const reviewPage = fs.readFileSync('app/dashboard/daily-management/page.tsx', 'utf8');
  const review = fs.readFileSync('components/dashboard/daily-review.tsx', 'utf8');

  assert.match(reviewPage, /getDictionaryForRequest\(\)/);
  assert.match(reviewPage, /<DailyReview locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(review, /const t = dictionary\.app\.dailyReview;/);
  assert.match(review, /ti\.production\.label/);
  assert.match(review, /t\.meeting\.agenda\.map/);
  assert.match(review, /fill\(ti\.safety\.findings, \{ n: safety\.open_ncs, m: safety\.overdue_cas \}\)/);
  // No hardcoded daily-review copy may remain in the component.
  for (const literal of ['Revisión diaria', 'Compromisos del día', 'Orden de la reunión', 'Información parcial', 'Indicadores diarios']) {
    assert.doesNotMatch(review, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `daily-review must not hardcode ${literal}`);
  }
});

test('work orders queue is a server wrapper over a locale-aware client', () => {
  const workOrdersPage = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/page.tsx', 'utf8');
  const workOrders = fs.readFileSync('components/maintenance/work-orders-queue.tsx', 'utf8');

  assert.match(workOrdersPage, /getDictionaryForRequest\(\)/);
  assert.match(workOrdersPage, /<WorkOrdersQueue locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(workOrders, /const t = dictionary\.app\.workOrders;/);
  assert.match(workOrders, /getStatusLabel\(order\.status, t\)/);
  assert.match(workOrders, /t\.schedule\.title/);
  assert.match(workOrders, /fill\(t\.counts, \{ filtered: filteredOrders\.length, total: workOrders\.length \}\)/);
  // No hardcoded work-orders copy may remain in the component.
  for (const literal of ['Órdenes de trabajo', 'Cierre progresivo', 'Nueva OT', 'Próximas intervenciones']) {
    assert.doesNotMatch(workOrders, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `work-orders-queue must not hardcode ${literal}`);
  }
});

test('work order create is a server wrapper over a locale-aware client', () => {
  const createPage = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/create/page.tsx', 'utf8');
  const create = fs.readFileSync('components/maintenance/create-work-order.tsx', 'utf8');

  assert.match(createPage, /getDictionaryForRequest\(\)/);
  assert.match(createPage, /<CreateWorkOrder locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(create, /const t = dictionary\.app\.workOrderCreate;/);
  assert.match(create, /t\.validation\.assetRequired/);
  assert.match(create, /fill\(t\.reviewTitleTemplate, \{ asset: review\.asset_name \|\| review\.asset_code \|\| t\.fallbackEquipment \}\)/);
  assert.match(create, /t\.assetStatus\[selectedAsset\.status as keyof typeof t\.assetStatus\]/);
  // No hardcoded create copy may remain in the component.
  for (const literal of ['Crear orden de trabajo', 'Trabajo a realizar', 'Crear OT y resolver revisión', 'Planificación inicial', 'Materiales / insumos solicitados']) {
    assert.doesNotMatch(create, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `create-work-order must not hardcode ${literal}`);
  }
});

test('work order detail is a server wrapper over a locale-aware client', () => {
  const detailPage = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/[id]/page.tsx', 'utf8');
  const detail = fs.readFileSync('components/maintenance/work-order-detail.tsx', 'utf8');

  assert.match(detailPage, /getDictionaryForRequest\(\)/);
  assert.match(detailPage, /<WorkOrderDetail locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(detail, /const t = dictionary\.app\.workOrderDetail;/);
  assert.match(detail, /statusLabel\(workOrder\.status, t\)/);
  assert.match(detail, /typeLabel\(workOrder\.work_type, t\)/);
  assert.match(detail, /toLocaleDateString\(dateLocale\)/);
  assert.match(detail, /fill\(t\.financial\.readyTemplate, \{ code: selectedCostCenter\?\.code \|\| t\.financial\.readyDefault \}\)/);
  // No hardcoded detail copy may remain in the component.
  for (const literal of ['Histórico importado · solo lectura', 'Imputación financiera', 'Continuar cierre', 'Responsable operativo', 'Intervención']) {
    assert.doesNotMatch(detail, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `work-order-detail must not hardcode ${literal}`);
  }
});

test('work order close page renders its header from the dictionary', () => {
  const closePage = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/cierre/page.tsx', 'utf8');

  assert.match(closePage, /getDictionaryForRequest\(\)/);
  assert.match(closePage, /export async function generateMetadata\(\)/);
  assert.match(closePage, /const t = dictionary\.app\.workOrderClose;/);
  assert.match(closePage, /<ProgressiveWorkOrderCloseQueue locale=\{locale\} dictionary=\{dictionary\} \/>/);
  // No hardcoded close-page copy may remain in the page.
  for (const literal of ['Qué falta para cerrar la siguiente OT', 'Cierre controlado de OT', 'decisión final en el usuario autorizado']) {
    assert.doesNotMatch(closePage, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `close page must not hardcode ${literal}`);
  }
});

test('progressive close queue renders from the dictionary', () => {
  const queue = fs.readFileSync('components/maintenance/progressive-work-order-close-queue.tsx', 'utf8');

  assert.match(queue, /const t = dictionary\.app\.workOrderCloseQueue;/);
  assert.match(queue, /ACTION_KEYS\[current\.next_action\]/);
  assert.match(queue, /t\.actionTitles\[actionKey\]/);
  assert.match(queue, /fill\(t\.planBadgeTemplate, \{ completed: current\.standard_plan_steps_completed \|\| 0, total: current\.standard_plan_steps_total \|\| 0 \}\)/);
  assert.match(queue, /toLocaleString\(numberLocale\)/);
  // No hardcoded close-queue copy may remain in the component.
  for (const literal of ['Siguiente acción', 'Guardar y continuar', 'Cerrar OT y congelar costo', 'Marcar paso realizado', 'Resolver activo', 'Registrar causa raíz']) {
    assert.doesNotMatch(queue, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `close queue must not hardcode ${literal}`);
  }
});

test('cost center review is a server wrapper over a locale-aware client', () => {
  const reviewPage = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/imputacion/page.tsx', 'utf8');
  const review = fs.readFileSync('components/maintenance/cost-center-review.tsx', 'utf8');

  assert.match(reviewPage, /getDictionaryForRequest\(\)/);
  assert.match(reviewPage, /<CostCenterReview locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(review, /const t = dictionary\.app\.costCenterReview;/);
  assert.match(review, /fill\(t\.pendingCountTemplate, \{ n: rows\.length \}\)/);
  assert.match(review, /current\.family_hint \|\| t\.fields\.noEvidence/);
  // No hardcoded review copy may remain in the component.
  for (const literal of ['Resolver imputación de OT', 'Una sola decisión principal por vez', 'Guardar y mostrar siguiente', 'Seleccionar centro de costo', 'No quedan OT pendientes de imputación']) {
    assert.doesNotMatch(review, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `cost-center-review must not hardcode ${literal}`);
  }
});

test('availability page renders its header and metadata from the dictionary', () => {
  const availabilityPage = fs.readFileSync('app/dashboard/mantenimiento/disponibilidad/page.tsx', 'utf8');

  assert.match(availabilityPage, /getDictionaryForRequest\(\)/);
  assert.match(availabilityPage, /export async function generateMetadata\(\)/);
  assert.match(availabilityPage, /const t = dictionary\.app\.availability;/);
  assert.match(availabilityPage, /<AvailabilitySemaphore \/>/);
  // No hardcoded availability copy may remain in the page.
  for (const literal of ['Disponibilidad de equipos', 'Ver tablero de equipos', 'cost centers no se interpretan como equipos']) {
    assert.doesNotMatch(availabilityPage, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `availability page must not hardcode ${literal}`);
  }
});
