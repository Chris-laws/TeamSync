# TeamSync

TeamSync is a Google Workspace task-management web app built entirely with Google Apps Script, HTML Service, and a private Google Sheet. It provides a Workspace → Spaces → Projects → Tasks hierarchy, project-aware task CRUD, filtered table views, My Tasks, dashboard statistics, Kanban drag and drop, subtasks, comments, activity history, optimistic version checks, responsive light/dark UI, and server-side role/access enforcement.

## Architecture

- `Code.gs` exposes the web app and a small authenticated API surface.
- `AuthService.gs` resolves `Session.getActiveUser().getEmail()`, enforces the corporate domain and allowlist, and obtains names from the Admin SDK Directory API.
- `StorageService.gs` owns all Sheet reads and writes. Persistent IDs are UUIDs; row numbers are internal lookup details only. `Spaces` isolates project context, `Teams`/`TeamMembers` group authorised employees, and `ProjectMembers` continues to enforce task visibility.
- `TaskService.gs` enforces validation, project access, assignment allowlisting, locking, version checks, activity records, and bounded reads.
- `Index.html`, `Styles.html`, and `Scripts.html` form the build-free SPA.

## First-time setup

1. Create a standalone Apps Script project in the corporate Workspace and copy these files with `clasp`.
2. In Apps Script, enable **Admin SDK API** under Services and in the linked Google Cloud project.
3. Run `initializeTeamSync()` once from the editor as the intended deploying administrator. It creates a private `TeamSync Data` spreadsheet, initializes every required sheet, derives `TEAMSYNC_ALLOWED_DOMAIN` from the active corporate account, and provisions that account as the first admin.
4. Confirm these Script Properties under Project Settings:
   - `TEAMSYNC_SPREADSHEET_ID`: backing spreadsheet ID (set automatically by initialization)
   - `TEAMSYNC_ALLOWED_DOMAIN`: corporate domain without `@` (set automatically by initialization)
   - `TEAMSYNC_DIRECTORY_MODE`: `admin_directory` (default)
5. Open **Settings → Authorised employees** as an administrator to add corporate employees, update roles/status, and grant explicit project access. Names are resolved by the directory provider and are never entered or inferred manually.
6. Deploy as a Web App with **Execute as: Me (deploying account)** and **Who has access: Anyone within the corporate Workspace domain**.

## Deployment model

TeamSync recommends **execute as the deploying account** with domain-only access. This keeps the backing spreadsheet private and avoids granting every employee direct Sheet access. In a domain-restricted Workspace deployment, `Session.getActiveUser().getEmail()` should expose the visitor identity; this must be confirmed in the real tenant because organizational policies can alter behavior.

Executing as the accessing user can make visitor identity straightforward, but every employee then needs sufficient authorization for backend resources and scopes. That conflicts with least privilege for a private shared Sheet and adds OAuth/permission maintenance. It is therefore not the recommended production model here.

`Session.getEffectiveUser()` is diagnostic only and is never treated as the visitor. If the active email is unavailable, TeamSync fails closed. Every API method establishes a new server-side context and ignores client-provided actor identity.

The Admin SDK scope is intentionally read-only. Directory lookup availability depends on Workspace admin policy and the deploying account's privileges. If lookup fails, the account remains `unresolved`; TeamSync does not derive a name from the email. Grant the deploying account the narrowest directory-read role supported by your organization, or replace `UserProfileProvider_` with an approved profile source.

## Deploy with clasp

```sh
npm install -g @google/clasp
clasp login
copy .clasp.json.example .clasp.json
clasp push
clasp deploy --description "TeamSync MVP"
```

Never commit `.clasp.json`, access tokens, actual emails, or spreadsheet IDs. Keep the backing spreadsheet private and owned by a controlled deployment account.

## Authentication smoke test

These checks require a deployed web app and real Workspace accounts; automated local tests cannot verify them.

1. Open with the approved admin: dashboard loads, role is admin, and directory name appears.
2. Open with a second approved member: only explicitly assigned projects and their tasks are visible.
3. Open with a corporate account absent from `Users`: access fails with `NOT_AUTHORIZED` and no task data is returned.
4. Open with a personal Google account: domain deployment blocks access; if a request reaches code, it fails with `EXTERNAL_DOMAIN`.
5. Test an approved account while directory lookup is unavailable: access follows the allowlist, profile status is `unresolved`, no inferred name appears, and diagnostics identify the issue.
6. Modify an API call in browser tools to pass a different assignee/actor/project: server-side authorization still rejects inaccessible projects and unauthorized assignees.
7. Open one task in two accounts and save both copies: the stale save receives `VERSION_CONFLICT` rather than overwriting silently.

Do not claim corporate SSO or Directory integration is verified until all checks pass in the target tenant.

## Data and date semantics

Timestamps are UTC ISO-8601 strings. Task start/due dates are calendar-date strings (`YYYY-MM-DD`) and are compared as date-only values. Mutations use `LockService`; task writes increment `version`; list results are bounded; cache entries are invalidated after writes.

## Automated checks

Run the local source and business-rule checks with:

```powershell
node tests/source-tests.js
node tests/unit-tests.js
```

The checks verify API authorization coverage, schema invariants, no frontend-supplied actor identity, task versioning/locking, required UI surfaces, authentication failure modes, role enforcement, project access, task validation, serialization, dashboard calculations, and the absence of out-of-scope modules. The corporate authentication checklist above remains manual.
