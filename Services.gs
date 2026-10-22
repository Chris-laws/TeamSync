var UserService_ = {
  listAssignable: function (ctx) {
    var memberships = Storage_.all('ProjectMembers'), projects = Storage_.all('Projects').filter(function (p) { return p.status !== 'archived'; });
    return Storage_.all('Users').filter(function (u) { return u.status === 'active'; }).map(function (user) {
      var profile = UserService_.publicProfile(user);
      profile.projectIds = user.role === CONFIG_.roles.ADMIN ? projects.map(function (p) { return p.projectId; }) : memberships.filter(function (m) { return m.userId === user.userId; }).map(function (m) { return m.projectId; });
      return profile;
    });
  },
  publicProfile: function (u) { return { userId:u.userId, displayName:u.displayName || 'Profile unresolved', email:u.email, photoUrl:u.photoUrl, profileStatus:u.profileStatus }; },
  listAdmin: function (ctx) {
    AuthService_.requireAdmin(ctx);
    var memberships = Storage_.all('ProjectMembers');
    return Storage_.all('Users').map(function (user) {
      var result = Object.assign({}, user, { projectIds: memberships.filter(function (m) { return m.userId === user.userId; }).map(function (m) { return m.projectId; }) });
      delete result._row;
      return result;
    });
  },
  provision: function (ctx, input) {
    AuthService_.requireAdmin(ctx);
    var email = normalizeEmail_(input && input.email);
    var domain = normalizeEmail_(PropertiesService.getScriptProperties().getProperty(CONFIG_.propertyKeys.allowedDomain));
    if (!email || email.split('@')[1] !== domain) throw appError_('VALIDATION', 'Enter an email in the approved corporate domain.');
    if (Storage_.find('Users', 'email', email)) throw appError_('VALIDATION', 'This employee is already provisioned.');
    var role = input && input.role === CONFIG_.roles.ADMIN ? CONFIG_.roles.ADMIN : CONFIG_.roles.MEMBER;
    var profile = UserProfileProvider_.resolve(email), now = nowIso_();
    var user = { userId:uuid_(), email:email, workspaceId:profile.workspaceId||'', givenName:profile.givenName||'', familyName:profile.familyName||'', displayName:profile.displayName||'', photoUrl:profile.photoUrl||'', status:'active', role:role, profileStatus:profile.resolved?'resolved':'unresolved', firstLoginAt:'', lastActiveAt:'' };
    Storage_.insert('Users', user);
    return this.publicProfile(Object.assign({}, user, { role:user.role, status:user.status }));
  },
  update: function (ctx, userId, patch) {
    AuthService_.requireAdmin(ctx);
    var user = Storage_.find('Users', 'userId', userId);
    if (!user) throw appError_('NOT_FOUND', 'Employee not found.');
    if (user.userId === ctx.user.userId && patch.status === 'disabled') throw appError_('VALIDATION', 'You cannot disable your own administrator account.');
    if (patch.role !== undefined) {
      if ([CONFIG_.roles.ADMIN, CONFIG_.roles.MEMBER].indexOf(patch.role) < 0) throw appError_('VALIDATION', 'Invalid role.');
      user.role = patch.role;
    }
    if (patch.status !== undefined) {
      if (['active','disabled'].indexOf(patch.status) < 0) throw appError_('VALIDATION', 'Invalid account status.');
      user.status = patch.status;
    }
    Storage_.update('Users', user._row, user);
    delete user._row;
    return user;
  },
  preferences: function (ctx) { var row = Storage_.find('UserPreferences', 'userId', ctx.user.userId); return row ? parseJson_(row.data, {}) : {}; },
  savePreferences: function (ctx, input) {
    var data = JSON.stringify(input || {}), existing = Storage_.find('UserPreferences', 'userId', ctx.user.userId), now = nowIso_();
    if (existing) { existing.data = data; existing.updatedAt = now; Storage_.update('UserPreferences', existing._row, existing); }
    else Storage_.insert('UserPreferences', { preferenceId:uuid_(), userId:ctx.user.userId, data:data, updatedAt:now });
    return input || {};
  }
};

var SpaceService_ = {
  list: function (ctx) {
    var spaces = Storage_.all('Spaces');
    var projects = Storage_.all('Projects');
    return spaces.map(function (space) {
      var own = projects.filter(function (p) { return p.spaceId === space.spaceId && p.status !== 'archived'; });
      return { spaceId:space.spaceId, name:space.name, description:space.description, color:space.color, projectCount:own.length };
    });
  },
  create: function (ctx, input) {
    AuthService_.requireAdmin(ctx);
    var name = cleanText_(input && input.name, 100);
    if (!name) throw appError_('VALIDATION', 'Space name is required.');
    var now = nowIso_();
    return Storage_.insert('Spaces', { spaceId:uuid_(), name:name, description:cleanText_(input.description, 1000), color:cleanText_(input.color, 20) || '#0050AA', createdBy:ctx.user.userId, createdAt:now, updatedAt:now });
  }
};

var TeamService_ = {
  list: function (ctx) {
    var teams = Storage_.all('Teams'), members = Storage_.all('TeamMembers');
    return teams.filter(function (team) {
      return ctx.user.role === CONFIG_.roles.ADMIN || members.some(function (member) { return member.teamId === team.teamId && member.userId === ctx.user.userId; });
    }).map(function (team) {
      return { teamId:team.teamId, spaceId:team.spaceId, name:team.name, description:team.description, memberCount:members.filter(function (member) { return member.teamId === team.teamId; }).length };
    });
  },
  create: function (ctx, input) {
    AuthService_.requireAdmin(ctx);
    var spaceId = cleanText_(input && input.spaceId, 120), name = cleanText_(input && input.name, 100);
    if (!name || !spaceId) throw appError_('VALIDATION', 'Team name and space are required.');
    if (!Storage_.find('Spaces', 'spaceId', spaceId)) throw appError_('VALIDATION', 'Select a valid space.');
    var now = nowIso_();
    return Storage_.insert('Teams', { teamId:uuid_(), spaceId:spaceId, name:name, description:cleanText_(input.description,1000), createdBy:ctx.user.userId, createdAt:now, updatedAt:now });
  },
  setMembership: function (ctx, teamId, userId, enabled) {
    AuthService_.requireAdmin(ctx);
    if (!Storage_.find('Teams','teamId',teamId) || !Storage_.find('Users','userId',userId)) throw appError_('NOT_FOUND','Team or employee not found.');
    var existing = Storage_.all('TeamMembers').find(function (member) { return member.teamId === teamId && member.userId === userId; });
    if (enabled && !existing) return Storage_.insert('TeamMembers',{teamMemberId:uuid_(),teamId:teamId,userId:userId,createdAt:nowIso_()});
    if (!enabled && existing) { Storage_.spreadsheet().getSheetByName('TeamMembers').deleteRow(existing._row); Storage_.invalidate(); }
    return { teamId:teamId, userId:userId, enabled:!!enabled };
  }
};

var ProjectService_ = {
  list: function (ctx) {
    var allowed = ctx.user.role === 'admin' ? null : Storage_.all('ProjectMembers').filter(function (m) { return m.userId === ctx.user.userId; }).map(function (m) { return m.projectId; });
    var tasks = Storage_.all('Tasks').filter(function (t) { return !t.archivedAt; });
    return Storage_.all('Projects').filter(function (p) { return p.status !== 'archived' && (!allowed || allowed.indexOf(p.projectId) >= 0); }).map(function (p) {
      var own = tasks.filter(function (t) { return t.projectId === p.projectId; }), done = own.filter(function (t) { return t.status === 'done'; }).length;
      return Object.assign({}, p, { taskCount:own.length, completedCount:done, progress:own.length ? Math.round(done / own.length * 100) : 0, _row:undefined });
    });
  },
  create: function (ctx, input) { AuthService_.requireAdmin(ctx); var now=nowIso_(), name=cleanText_(input && input.name,120), spaceId=cleanText_(input && input.spaceId,120); if(!name) throw appError_('VALIDATION','Project name is required.'); if(spaceId&&!Storage_.find('Spaces','spaceId',spaceId))throw appError_('VALIDATION','Select a valid space.'); return Storage_.insert('Projects',{projectId:uuid_(),name:name,description:cleanText_(input.description,2000),status:'active',createdBy:ctx.user.userId,createdAt:now,updatedAt:now,spaceId:spaceId}); },
  update: function (ctx, id, patch) { AuthService_.requireAdmin(ctx); var row=Storage_.find('Projects','projectId',id); if(!row) throw appError_('NOT_FOUND','Project not found.'); ['name','description','status'].forEach(function(k){if(patch[k]!=null) row[k]=cleanText_(patch[k],k==='description'?2000:120);}); row.updatedAt=nowIso_(); return Storage_.update('Projects',row._row,row); },
  setMembership: function (ctx, projectId, userId, enabled) {
    AuthService_.requireAdmin(ctx);
    if (!Storage_.find('Projects','projectId',projectId)) throw appError_('NOT_FOUND','Project not found.');
    if (!Storage_.find('Users','userId',userId)) throw appError_('NOT_FOUND','Employee not found.');
    var existing = Storage_.all('ProjectMembers').find(function (m) { return m.projectId === projectId && m.userId === userId; });
    if (enabled && !existing) return Storage_.insert('ProjectMembers',{projectMemberId:uuid_(),projectId:projectId,userId:userId,accessLevel:'member',createdAt:nowIso_()});
    if (!enabled && existing) {
      var sheet = Storage_.spreadsheet().getSheetByName('ProjectMembers');
      sheet.deleteRow(existing._row);
      Storage_.invalidate();
    }
    return { projectId:projectId, userId:userId, enabled:!!enabled };
  }
};

var ActivityService_ = { record:function(ctx,type,id,action,details){ Storage_.insert('ActivityLog',{activityId:uuid_(),entityType:type,entityId:id,action:action,actorId:ctx.user.userId,details:JSON.stringify(details||{}),createdAt:nowIso_()}); } };

var CommentService_ = {
  create:function(ctx,taskId,content){ var task=TaskService_._getAccessible(ctx,taskId), text=cleanText_(content,5000); if(!text) throw appError_('VALIDATION','Comment cannot be empty.'); var row={commentId:uuid_(),taskId:task.taskId,authorId:ctx.user.userId,content:text,createdAt:nowIso_(),updatedAt:nowIso_()}; Storage_.insert('Comments',row); ActivityService_.record(ctx,'task',taskId,'comment_added',{}); return row; }
};

var SubtaskService_ = {
  create:function(ctx,taskId,title){ TaskService_._getAccessible(ctx,taskId); var value=cleanText_(title,300); if(!value) throw appError_('VALIDATION','Subtask title is required.'); var row={subtaskId:uuid_(),taskId:taskId,title:value,completed:false,createdBy:ctx.user.userId,createdAt:nowIso_(),updatedAt:nowIso_()}; Storage_.insert('Subtasks',row); ActivityService_.record(ctx,'task',taskId,'subtask_added',{title:value}); return row; },
  toggle:function(ctx,id,completed){ var row=Storage_.find('Subtasks','subtaskId',id); if(!row) throw appError_('NOT_FOUND','Subtask not found.'); TaskService_._getAccessible(ctx,row.taskId); row.completed=!!completed; row.updatedAt=nowIso_(); Storage_.update('Subtasks',row._row,row); return row; }
};
