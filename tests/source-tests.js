const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const code = read('Code.gs');
const auth = read('AuthService.gs');
const tasks = read('TaskService.gs');
const config = read('Config.gs');
const scripts = read('Scripts.html');
const index = read('Index.html');
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function assert(value, message) { if (!value) throw new Error(message); }

test('all exposed API methods establish authenticated context', () => {
  const exposed = code.match(/^function api\w+\([^)]*\)[^{]*\{[^\n]+$/gm) || [];
  assert(exposed.length >= 10, 'Expected complete API surface');
  exposed.forEach(line => assert(line.includes('Api_.run'), `Missing Api_.run: ${line}`));
});
test('identity uses active user and fails closed', () => {
  assert(auth.includes('Session.getActiveUser().getEmail()'), 'Active user lookup missing');
  assert(auth.includes("'IDENTITY_UNAVAILABLE'"), 'Missing identity failure');
  assert(auth.includes("'EXTERNAL_DOMAIN'"), 'Missing domain rejection');
  assert(auth.includes("'NOT_AUTHORIZED'"), 'Missing allowlist rejection');
});
test('effective user is not used for authorization', () => {
  const beforeDiagnostics = auth.split('diagnostics: function')[0];
  const uses = auth.match(/getEffectiveUser/g) || [];
  assert(uses.length === 1 && !beforeDiagnostics.includes('getEffectiveUser'), 'Effective user escaped diagnostics');
});
test('task schema has stable ID and optimistic version', () => {
  assert(config.includes("'taskId'") && config.includes("'version'") && config.includes("'position'"), 'Task schema incomplete');
  assert(config.includes('Spaces') && config.includes('spaceId') && config.includes('Teams') && config.includes('TeamMembers'), 'Workspace hierarchy schema missing');
  assert(tasks.includes("'VERSION_CONFLICT'"), 'Version conflict missing');
  assert(tasks.includes('Storage_.withLock'), 'Task mutation lock missing');
});
test('actor identity is never accepted by task, comment, or subtask API', () => {
  const apiLines = code.split('\n').filter(line => /^function api/.test(line));
  assert(apiLines.every(line => !/(authorId|createdBy|actorId|email)/.test(line)), 'Client actor argument exposed');
});
test('assignment checks the authorized Users table', () => {
  assert(tasks.includes("Storage_.find('Users','userId',data.assigneeId)"), 'Assignment allowlist missing');
  assert(tasks.includes('AuthService_.canAccessProject'), 'Assignee project membership missing');
});
test('admin APIs enforce server-side administrator role', () => {
  const services = read('Services.gs');
  ['listAdmin','provision','update','setMembership'].forEach(name => {
    const start = services.indexOf(`${name}: function`);
    assert(start >= 0 && services.slice(start, start + 220).includes('AuthService_.requireAdmin'), `${name} lacks admin enforcement`);
  });
});
test('required UI surfaces exist', () => {
  ['Dashboard','Tasks','Teams','Settings','Spaces','Projects','Authorised employees'].forEach(label => assert(scripts.includes(label) || index.includes(label), `${label} missing`));
  ['Type','Tags','Progress','data-page','kanban-add'].forEach(label => assert(scripts.includes(label), `Task surface missing: ${label}`));
  assert(index.includes('globalSearch') && index.includes('quickAddBtn') && index.includes('drawer'), 'Application shell incomplete');
  ['Overdue','Today','Upcoming','No due date','Completed'].forEach(label => assert(scripts.includes(`['${label}'`), `My Tasks group missing: ${label}`));
});
test('out-of-scope modules are absent', () => {
  const source = [code, scripts, config].join('\n').toLowerCase();
  ['absence calendar','holiday system','vertex ai','password login'].forEach(term => assert(!source.includes(term), `Out-of-scope feature found: ${term}`));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} checks passed.`);
