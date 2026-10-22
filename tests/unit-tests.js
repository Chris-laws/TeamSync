const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = ['Config.gs', 'AuthService.gs', 'TaskService.gs'].map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
const state = { email: '', effectiveEmail: 'deployer@corp.test', properties: { TEAMSYNC_ALLOWED_DOMAIN: 'corp.test' }, tables: {} };
const context = {
  console,
  Date,
  JSON,
  Math,
  Object,
  String,
  Number,
  Array,
  Error,
  Session: {
    getActiveUser: () => ({ getEmail: () => state.email }),
    getEffectiveUser: () => ({ getEmail: () => state.effectiveEmail })
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => state.properties[key] || '' }) },
  Storage_: {
    find: (table, field, value) => (state.tables[table] || []).find(row => String(row[field]) === String(value)) || null,
    all: table => state.tables[table] || [],
    update: (table, row, item) => item,
    insert: (table, item) => item,
    withLock: callback => callback()
  },
  UserProfileProvider_: { resolve: () => ({ resolved: false }) },
  ProjectService_: { list: () => state.tables.Projects || [] },
  UserService_: { publicProfile: user => ({ userId: user.userId, displayName: user.displayName }) },
  ActivityService_: { record: () => {} },
  Utilities: { getUuid: () => 'uuid' }
};
vm.createContext(context);
vm.runInContext(source, context);

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function assert(value, message) { if (!value) throw new Error(message); }
function throws(code, fn) { try { fn(); } catch (error) { assert(error.code === code, `Expected ${code}, received ${error.code}`); return; } throw new Error(`Expected ${code}`); }
function reset() {
  state.email = '';
  state.tables = { Users: [], ProjectMembers: [], Projects: [], Tasks: [] };
  state.properties.TEAMSYNC_ALLOWED_DOMAIN = 'corp.test';
}

test('authentication fails when active email is unavailable', () => { reset(); throws('IDENTITY_UNAVAILABLE', () => context.AuthService_.context()); });
test('authentication rejects an external domain', () => { reset(); state.email = 'person@gmail.com'; throws('EXTERNAL_DOMAIN', () => context.AuthService_.context()); });
test('authentication rejects a corporate user outside the allowlist', () => { reset(); state.email = 'person@corp.test'; throws('NOT_AUTHORIZED', () => context.AuthService_.context()); });
test('authentication accepts an active allowlisted corporate user', () => {
  reset(); state.email = 'member@corp.test'; state.tables.Users = [{ _row:2, userId:'u1', email:state.email, status:'active', role:'member', displayName:'Member', profileStatus:'resolved' }];
  const result = context.AuthService_.context(); assert(result.user.userId === 'u1', 'Wrong user');
});
test('member cannot pass administrator enforcement', () => { throws('FORBIDDEN', () => context.AuthService_.requireAdmin({ user:{ role:'member' } })); });
test('member access requires explicit project membership', () => {
  reset(); const user = { userId:'u1', role:'member' }; assert(!context.AuthService_.canAccessProject(user, 'p1'), 'Unexpected access');
  state.tables.ProjectMembers = [{ userId:'u1', projectId:'p1' }]; assert(context.AuthService_.canAccessProject(user, 'p1'), 'Membership ignored');
});
test('task validation rejects missing title and invalid status', () => {
  throws('VALIDATION', () => context.TaskService_._validate({ status:'todo' }, false));
  throws('VALIDATION', () => context.TaskService_._validate({ title:'Task', status:'invented' }, false));
});
test('task validation rejects an inverted date range', () => {
  throws('VALIDATION', () => context.TaskService_._validate({ title:'Task', startDate:'2026-02-10', dueDate:'2026-02-01' }, false));
});
test('task serialization parses tags and numeric concurrency fields', () => {
  const task = context.TaskService_._serialize({ tags:'["one"]', version:'3', position:'12', _row:5 });
  assert(task.tags[0] === 'one' && task.version === 3 && task.position === 12 && task._row === undefined, 'Serialization incorrect');
});
test('dashboard derives real counts from stored tasks', () => {
  reset(); state.tables.Projects = [{ projectId:'p1' }];
  state.tables.Tasks = [
    { taskId:'1', projectId:'p1', assigneeId:'u1', status:'in_progress', dueDate:'2000-01-01', tags:'[]', version:1, position:1, updatedAt:'2026-01-01' },
    { taskId:'2', projectId:'p1', assigneeId:'u1', status:'done', dueDate:'', tags:'[]', version:1, position:2, updatedAt:'2026-01-02' }
  ];
  const dashboard = context.TaskService_.dashboard({ user:{ userId:'u1', role:'admin' } });
  assert(dashboard.open === 1 && dashboard.inProgress === 1 && dashboard.completed === 1 && dashboard.overdue === 1, 'Dashboard counts incorrect');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} unit tests passed.`);
