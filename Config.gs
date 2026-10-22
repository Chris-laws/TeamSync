var CONFIG_ = {
  propertyKeys: { spreadsheetId: 'TEAMSYNC_SPREADSHEET_ID', allowedDomain: 'TEAMSYNC_ALLOWED_DOMAIN', directoryMode: 'TEAMSYNC_DIRECTORY_MODE' },
  roles: { ADMIN: 'admin', MEMBER: 'member' },
  statuses: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'],
  priorities: ['critical', 'high', 'medium', 'low'],
  projectStatuses: ['active', 'on_hold', 'completed', 'archived'],
  maxPageSize: 500,
  cacheSeconds: 120
};

var SCHEMAS_ = {
  Users: ['userId','email','workspaceId','givenName','familyName','displayName','photoUrl','status','role','profileStatus','firstLoginAt','lastActiveAt'],
  Spaces: ['spaceId','name','description','color','createdBy','createdAt','updatedAt'],
  Projects: ['projectId','name','description','status','createdBy','createdAt','updatedAt','spaceId'],
  Teams: ['teamId','spaceId','name','description','createdBy','createdAt','updatedAt'],
  TeamMembers: ['teamMemberId','teamId','userId','createdAt'],
  ProjectMembers: ['projectMemberId','projectId','userId','accessLevel','createdAt'],
  Tasks: ['taskId','title','description','status','priority','projectId','assigneeId','createdBy','createdAt','updatedAt','startDate','dueDate','completedAt','tags','estimatedEffort','position','version','archivedAt'],
  Subtasks: ['subtaskId','taskId','title','completed','createdBy','createdAt','updatedAt'],
  Comments: ['commentId','taskId','authorId','content','createdAt','updatedAt'],
  ActivityLog: ['activityId','entityType','entityId','action','actorId','details','createdAt'],
  UserPreferences: ['preferenceId','userId','data','updatedAt'],
  Settings: ['key','value','updatedAt']
};

function appError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function nowIso_() { return new Date().toISOString(); }
function uuid_() { return Utilities.getUuid(); }
function normalizeEmail_(value) { return String(value || '').trim().toLowerCase(); }
function cleanText_(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 5000); }
function parseJson_(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; } }
