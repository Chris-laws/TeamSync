var AuthService_ = {
  context: function () {
    var email = normalizeEmail_(Session.getActiveUser().getEmail());
    if (!email) throw appError_('IDENTITY_UNAVAILABLE', 'Google did not expose your identity. Ask an administrator to verify the web app execution and domain-access settings.');
    var domain = normalizeEmail_(PropertiesService.getScriptProperties().getProperty(CONFIG_.propertyKeys.allowedDomain));
    if (!domain) throw appError_('NOT_CONFIGURED', 'Set the TEAMSYNC_ALLOWED_DOMAIN script property.');
    if (email.split('@')[1] !== domain) throw appError_('EXTERNAL_DOMAIN', 'This application is restricted to the approved corporate Google Workspace domain.');
    var user = Storage_.find('Users', 'email', email);
    if (!user || user.status !== 'active') throw appError_('NOT_AUTHORIZED', 'Your corporate account is not on the TeamSync allowlist.');
    var profile = UserProfileProvider_.resolve(email);
    if (profile.resolved && (profile.displayName !== user.displayName || profile.photoUrl !== user.photoUrl)) {
      user.givenName = profile.givenName; user.familyName = profile.familyName; user.displayName = profile.displayName;
      user.photoUrl = profile.photoUrl; user.workspaceId = profile.workspaceId; user.profileStatus = 'resolved';
    }
    user.lastActiveAt = nowIso_();
    Storage_.update('Users', user._row, user);
    delete user._row;
    return { email: email, user: user };
  },
  requireAdmin: function (context) { if (!context || context.user.role !== CONFIG_.roles.ADMIN) throw appError_('FORBIDDEN', 'Administrator permission is required.'); },
  requireProjectAccess: function (context, projectId) {
    if (!this.canAccessProject(context.user, projectId)) throw appError_('FORBIDDEN', 'You do not have access to this project.');
  },
  canAccessProject: function (user, projectId) {
    if (user.role === CONFIG_.roles.ADMIN) return true;
    return Storage_.all('ProjectMembers').some(function (row) { return row.projectId === projectId && row.userId === user.userId; });
  },
  diagnostics: function (context) {
    return { activeEmailAvailable: !!context.email, effectiveUserEmail: Session.getEffectiveUser().getEmail(), activeUserEmail: context.email, role: context.user.role, profileStatus: context.user.profileStatus, deploymentNote: 'Identity is reliable only when deployed to the Workspace domain with an execution mode that exposes the active user.' };
  }
};

var UserProfileProvider_ = {
  resolve: function (email) {
    var mode = PropertiesService.getScriptProperties().getProperty(CONFIG_.propertyKeys.directoryMode) || 'admin_directory';
    if (mode !== 'admin_directory') return { resolved: false };
    try {
      var record = AdminDirectory.Users.get(email, { projection: 'basic' });
      return { resolved: true, workspaceId: record.id || '', givenName: record.name.givenName || '', familyName: record.name.familyName || '', displayName: record.name.fullName || '', photoUrl: record.thumbnailPhotoUrl || '' };
    } catch (error) {
      console.warn('Directory profile unresolved for ' + email + ': ' + error.message);
      return { resolved: false };
    }
  }
};
