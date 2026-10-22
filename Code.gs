function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('TeamSync')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function initializeTeamSync() {
  var properties = PropertiesService.getScriptProperties();
  var email = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!email) throw appError_('IDENTITY_UNAVAILABLE', 'Run initialization while signed in with the deploying corporate Workspace account.');
  var domain = email.split('@')[1];
  if (!properties.getProperty(CONFIG_.propertyKeys.allowedDomain)) properties.setProperty(CONFIG_.propertyKeys.allowedDomain, domain);
  if (!properties.getProperty(CONFIG_.propertyKeys.spreadsheetId)) {
    var spreadsheet = SpreadsheetApp.create('TeamSync Data');
    properties.setProperty(CONFIG_.propertyKeys.spreadsheetId, spreadsheet.getId());
  }
  Storage_.initialize();
  var existing = Storage_.find('Users', 'email', email);
  if (!existing) {
    var profile = UserProfileProvider_.resolve(email);
    var now = nowIso_();
    Storage_.insert('Users', {
      userId: uuid_(), email: email, workspaceId: profile.workspaceId || '', givenName: profile.givenName || '',
      familyName: profile.familyName || '', displayName: profile.displayName || '', photoUrl: profile.photoUrl || '',
      status: 'active', role: CONFIG_.roles.ADMIN, profileStatus: profile.resolved ? 'resolved' : 'unresolved',
      firstLoginAt: now, lastActiveAt: now
    });
  }
  return { initialized: true, spreadsheetId: properties.getProperty(CONFIG_.propertyKeys.spreadsheetId), adminEmail: email };
}

function getBootstrapData() {
  return Api_.run(function (context) {
    return {
      user: context.user,
      diagnostics: AuthService_.diagnostics(context),
      projects: ProjectService_.list(context),
      users: UserService_.listAssignable(context),
      tasks: TaskService_.list(context, { limit: 500 }),
      dashboard: TaskService_.dashboard(context),
      preferences: UserService_.preferences(context)
    };
  });
}

function apiListTasks(filters) { return Api_.run(function (ctx) { return TaskService_.list(ctx, filters || {}); }); }
function apiCreateTask(input) { return Api_.run(function (ctx) { return TaskService_.create(ctx, input); }); }
function apiUpdateTask(taskId, patch, version) { return Api_.run(function (ctx) { return TaskService_.update(ctx, taskId, patch, version); }); }
function apiArchiveTask(taskId, version) { return Api_.run(function (ctx) { return TaskService_.archive(ctx, taskId, version); }); }
function apiReorderTask(taskId, status, position, version) { return Api_.run(function (ctx) { return TaskService_.reorder(ctx, taskId, status, position, version); }); }
function apiBulkUpdateTasks(taskIds, patch) { return Api_.run(function (ctx) { return TaskService_.bulkUpdate(ctx, taskIds, patch); }); }
function apiCreateProject(input) { return Api_.run(function (ctx) { return ProjectService_.create(ctx, input); }); }
function apiUpdateProject(projectId, patch) { return Api_.run(function (ctx) { return ProjectService_.update(ctx, projectId, patch); }); }
function apiAddComment(taskId, content) { return Api_.run(function (ctx) { return CommentService_.create(ctx, taskId, content); }); }
function apiAddSubtask(taskId, title) { return Api_.run(function (ctx) { return SubtaskService_.create(ctx, taskId, title); }); }
function apiToggleSubtask(subtaskId, completed) { return Api_.run(function (ctx) { return SubtaskService_.toggle(ctx, subtaskId, completed); }); }
function apiSavePreferences(input) { return Api_.run(function (ctx) { return UserService_.savePreferences(ctx, input); }); }
function apiGetTaskDetail(taskId) { return Api_.run(function (ctx) { return TaskService_.detail(ctx, taskId); }); }
function apiListAdminUsers() { return Api_.run(function (ctx) { return UserService_.listAdmin(ctx); }); }
function apiProvisionUser(input) { return Api_.run(function (ctx) { return UserService_.provision(ctx, input); }); }
function apiUpdateUser(userId, patch) { return Api_.run(function (ctx) { return UserService_.update(ctx, userId, patch); }); }
function apiSetProjectMembership(projectId, userId, enabled) { return Api_.run(function (ctx) { return ProjectService_.setMembership(ctx, projectId, userId, enabled); }); }
function apiAuthenticationDiagnostics() { return Api_.run(function (ctx) { AuthService_.requireAdmin(ctx); return AuthService_.diagnostics(ctx); }); }
function apiInitializeApplication() { return Api_.run(function (ctx) { AuthService_.requireAdmin(ctx); return Storage_.initialize(); }); }

var Api_ = {
  run: function (callback) {
    try {
      return { ok: true, data: callback(AuthService_.context()) };
    } catch (error) {
      console.error(error && error.stack ? error.stack : error);
      return { ok: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || 'Unexpected error.' } };
    }
  }
};
