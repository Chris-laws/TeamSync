const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.TEAMSYNC_PREVIEW_PORT || 4173);
const index = fs.readFileSync(path.join(root, 'Index.html'), 'utf8')
  .replace("<?!= include('Styles'); ?>", () => fs.readFileSync(path.join(root, 'Styles.html'), 'utf8'))
  .replace("<?!= include('Scripts'); ?>", () => `<script>${mockBridge()}</script>${fs.readFileSync(path.join(root, 'Scripts.html'), 'utf8')}`);

function mockBridge() {
  return `
  (() => {
    const now = new Date(), iso = now.toISOString(), day = offset => new Date(now.getTime() + offset * 86400000).toISOString().slice(0,10);
    const users = [
      {userId:'u1',email:'alex.morgan@teamsync.example',givenName:'Alex',familyName:'Morgan',displayName:'Alex Morgan',photoUrl:'',status:'active',role:'admin',profileStatus:'resolved',projectIds:['p1','p2','p3'],firstLoginAt:iso,lastActiveAt:iso},
      {userId:'u2',email:'maya.chen@teamsync.example',givenName:'Maya',familyName:'Chen',displayName:'Maya Chen',photoUrl:'',status:'active',role:'member',profileStatus:'resolved',projectIds:['p1','p2']},
      {userId:'u3',email:'noah.wilson@teamsync.example',givenName:'Noah',familyName:'Wilson',displayName:'Noah Wilson',photoUrl:'',status:'active',role:'member',profileStatus:'resolved',projectIds:['p1','p3']}
    ];
    const spaces = [
      {spaceId:'s1',name:'Demand Forecast',description:'Planning and forecasting',color:'#0050AA',projectCount:1},
      {spaceId:'s2',name:'Innovation',description:'New product work',color:'#FFB800',projectCount:1},
      {spaceId:'s3',name:'Operations',description:'Operational delivery',color:'#E30613',projectCount:1}
    ];
    const teams = [
      {teamId:'team1',spaceId:'s1',name:'Forecasting',description:'Demand planning team',memberCount:2},
      {teamId:'team2',spaceId:'s2',name:'Innovation Lab',description:'New product team',memberCount:1}
    ];
    const projects = [
      {projectId:'p1',name:'Forecast Quality',spaceId:'s1',description:'Refresh the customer workspace and core workflows.',status:'active',taskCount:5,completedCount:1,progress:20},
      {projectId:'p2',name:'KPI Monitoring',spaceId:'s2',description:'Coordinate the public mobile release.',status:'active',taskCount:3,completedCount:1,progress:33},
      {projectId:'p3',name:'Data Quality',spaceId:'s3',description:'Create a consistent visual language.',status:'active',taskCount:2,completedCount:0,progress:0}
    ];
    let tasks = [
      ['t1','Finalize navigation patterns','Document responsive navigation behavior.','in_progress','high','p1','u1',day(1)],
      ['t2','Accessibility review','Complete keyboard and screen-reader review.','todo','critical','p1','u2',day(-1)],
      ['t3','Prepare launch checklist','Coordinate release owners and dependencies.','in_review','medium','p2','u1',day(3)],
      ['t4','Polish empty states','Create concise guidance for empty views.','backlog','low','p1','u3',day(7)],
      ['t5','Approve color tokens','Validate contrast across both themes.','done','medium','p3','u1',day(-2)],
      ['t6','Store listing assets','Export final screenshots and copy.','todo','high','p2','u2',day(5)],
      ['t7','Analytics event map','Confirm events for the new task flow.','backlog','medium','p1','u1',''],
      ['t8','Component inventory','Audit reusable interface components.','in_progress','high','p3','u3',day(2)]
    ].map((x,i)=>({taskId:x[0],title:x[1],description:x[2],status:x[3],priority:x[4],projectId:x[5],assigneeId:x[6],createdBy:'u1',createdAt:iso,updatedAt:iso,startDate:day(-3),dueDate:x[7],completedAt:x[3]==='done'?iso:'',tags:['Preview'],estimatedEffort:'4h',position:i+1,version:1}));
    const details = {};
    const dashboard = () => { const mine=tasks.filter(t=>t.assigneeId==='u1'),open=mine.filter(t=>!['done','cancelled'].includes(t.status)); return {open:open.length,inProgress:mine.filter(t=>t.status==='in_progress').length,completed:mine.filter(t=>t.status==='done').length,overdue:open.filter(t=>t.dueDate&&t.dueDate<day(0)).length,upcoming:open.filter(t=>t.dueDate&&t.dueDate>=day(0)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,8),recent:mine.slice(0,8)} };
    const bootstrap = () => ({user:users[0],users,spaces,teams,projects,tasks,dashboard:dashboard(),preferences:{theme:'light'},diagnostics:{activeEmailAvailable:true,effectiveUserEmail:users[0].email,activeUserEmail:users[0].email,role:'admin',profileStatus:'resolved',deploymentNote:'Local preview: Workspace identity is mocked.'}});
    const handlers = {
      getBootstrapData: bootstrap,
      apiCreateTask: input => { const task={...input,taskId:'t'+Date.now(),createdBy:'u1',createdAt:iso,updatedAt:iso,completedAt:'',position:Date.now(),version:1};tasks.unshift(task);return task },
      apiUpdateTask: (id,patch) => { const task=tasks.find(t=>t.taskId===id);Object.assign(task,patch,{updatedAt:new Date().toISOString(),version:task.version+1});return task },
      apiReorderTask: (id,status,position) => handlers.apiUpdateTask(id,{status,position}),
      apiBulkUpdateTasks: (ids,patch) => ids.map(id=>handlers.apiUpdateTask(id,patch)),
      apiArchiveTask: id => { tasks=tasks.filter(t=>t.taskId!==id);return {taskId:id} },
      apiGetTaskDetail: id => ({task:tasks.find(t=>t.taskId===id),comments:(details[id]?.comments||[]),subtasks:(details[id]?.subtasks||[]),activity:(details[id]?.activity||[])}),
      apiAddComment: (id,content) => { const row={commentId:'c'+Date.now(),taskId:id,authorId:'u1',content,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),author:users[0]};(details[id]??={comments:[],subtasks:[],activity:[]}).comments.push(row);return row },
      apiAddSubtask: (id,title) => { const row={subtaskId:'s'+Date.now(),taskId:id,title,completed:false};(details[id]??={comments:[],subtasks:[],activity:[]}).subtasks.push(row);return row },
      apiToggleSubtask: (id,completed) => { for(const detail of Object.values(details)){const row=detail.subtasks.find(s=>s.subtaskId===id);if(row){row.completed=completed;return row}} },
      apiCreateProject: input => { const row={...input,projectId:'p'+Date.now(),status:'active',taskCount:0,completedCount:0,progress:0};projects.push(row);return row },
      apiCreateSpace: input => { const row={...input,spaceId:'s'+Date.now(),projectCount:0};spaces.push(row);return row },
      apiCreateTeam: input => { const row={...input,teamId:'team'+Date.now(),memberCount:0};teams.push(row);return row },
      apiUpdateProject: (id,patch) => Object.assign(projects.find(p=>p.projectId===id),patch),
      apiSavePreferences: value => value,
      apiListAdminUsers: () => users,
      apiProvisionUser: input => { const row={...input,userId:'u'+Date.now(),displayName:'Profile unresolved',status:'active',profileStatus:'unresolved',projectIds:[]};users.push(row);return row },
      apiUpdateUser: (id,patch) => Object.assign(users.find(u=>u.userId===id),patch),
      apiSetProjectMembership: (projectId,userId,enabled) => {const user=users.find(u=>u.userId===userId);user.projectIds=enabled?[...new Set([...user.projectIds,projectId])]:user.projectIds.filter(id=>id!==projectId);return {projectId,userId,enabled}}
    };
    let success=()=>{}, failure=()=>{};
    const runner = new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return fn=>(success=fn,runner);if(name==='withFailureHandler')return fn=>(failure=fn,runner);return(...args)=>setTimeout(()=>{try{const value=(handlers[name]||(()=>{throw new Error('Preview method unavailable: '+name)}))(...args);success({ok:true,data:value})}catch(error){failure(error)}},80)}});
    window.google={script:{run:runner}};
  })();`;
}

http.createServer((request, response) => {
  var pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname !== '/' && pathname !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  response.end(index);
}).listen(port, '127.0.0.1', () => console.log(`TeamSync preview: http://127.0.0.1:${port}`));
