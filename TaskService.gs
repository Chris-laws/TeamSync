var TaskService_ = {
  _getAccessible:function(ctx,id){ var task=Storage_.find('Tasks','taskId',id); if(!task||task.archivedAt) throw appError_('NOT_FOUND','Task not found.'); AuthService_.requireProjectAccess(ctx,task.projectId); return task; },
  _validate:function(input,partial){
    var out={}; input=input||{};
    ['title','description','status','priority','projectId','assigneeId','startDate','dueDate','estimatedEffort'].forEach(function(k){if(input[k]!==undefined) out[k]=cleanText_(input[k],k==='description'?5000:300);});
    if(input.position!==undefined) out.position=Number(input.position)||0;
    if(input.tags!==undefined) out.tags=Array.isArray(input.tags)?JSON.stringify(input.tags.map(function(t){return cleanText_(t,40);}).filter(Boolean).slice(0,20)):JSON.stringify([]);
    if(!partial && !out.title) throw appError_('VALIDATION','Title is required.');
    if(out.status && CONFIG_.statuses.indexOf(out.status)<0) throw appError_('VALIDATION','Invalid status.');
    if(out.priority && CONFIG_.priorities.indexOf(out.priority)<0) throw appError_('VALIDATION','Invalid priority.');
    if(out.startDate && out.dueDate && out.startDate>out.dueDate) throw appError_('VALIDATION','Due date must be on or after start date.');
    return out;
  },
  list:function(ctx,filters){
    filters=filters||{}; var projects=ProjectService_.list(ctx).map(function(p){return p.projectId;}), query=cleanText_(filters.search,200).toLowerCase();
    var rows=Storage_.all('Tasks').filter(function(t){
      if(t.archivedAt||projects.indexOf(t.projectId)<0) return false;
      if(filters.mine&&t.assigneeId!==ctx.user.userId) return false;
      if(filters.status&&t.status!==filters.status) return false;
      if(filters.priority&&t.priority!==filters.priority) return false;
      if(filters.projectId&&t.projectId!==filters.projectId) return false;
      if(filters.assigneeId&&t.assigneeId!==filters.assigneeId) return false;
      return !query||(String(t.title)+' '+String(t.description)).toLowerCase().indexOf(query)>=0;
    });
    rows.sort(function(a,b){return String(a.position).localeCompare(String(b.position),undefined,{numeric:true})||String(b.updatedAt).localeCompare(String(a.updatedAt));});
    return rows.slice(0,Math.min(Number(filters.limit)||CONFIG_.maxPageSize,CONFIG_.maxPageSize)).map(this._serialize);
  },
  _serialize:function(t){ var copy=Object.assign({},t); delete copy._row; copy.tags=parseJson_(copy.tags,[]); copy.version=Number(copy.version)||1; copy.position=Number(copy.position)||0; return copy; },
  create:function(ctx,input){
    var data=this._validate(input,false); AuthService_.requireProjectAccess(ctx,data.projectId);
    var assignee=Storage_.find('Users','userId',data.assigneeId); if(!assignee||assignee.status!=='active') throw appError_('VALIDATION','Select an authorised assignee.');
    if (!AuthService_.canAccessProject(assignee, data.projectId)) throw appError_('VALIDATION','The assignee does not have access to this project.');
    var now=nowIso_(), task=Object.assign({taskId:uuid_(),description:'',status:'todo',priority:'medium',assigneeId:ctx.user.userId,createdBy:ctx.user.userId,createdAt:now,updatedAt:now,startDate:'',dueDate:'',completedAt:'',tags:'[]',estimatedEffort:'',position:Date.now(),version:1,archivedAt:''},data);
    Storage_.withLock(function(){Storage_.insert('Tasks',task); ActivityService_.record(ctx,'task',task.taskId,'created',{title:task.title});}); return this._serialize(task);
  },
  update:function(ctx,id,patch,version){
    var self=this; return Storage_.withLock(function(){ var task=self._getAccessible(ctx,id); if(Number(task.version)!==Number(version)) throw appError_('VERSION_CONFLICT','This task changed elsewhere. Refresh and try again.'); var data=self._validate(patch,true); var targetProject=data.projectId||task.projectId; if(data.projectId) AuthService_.requireProjectAccess(ctx,data.projectId); var targetAssignee=data.assigneeId||task.assigneeId; var u=Storage_.find('Users','userId',targetAssignee); if(!u||u.status!=='active')throw appError_('VALIDATION','Select an authorised assignee.'); if(!AuthService_.canAccessProject(u,targetProject))throw appError_('VALIDATION','The assignee does not have access to this project.'); var before={status:task.status,priority:task.priority,assigneeId:task.assigneeId}; Object.assign(task,data); task.updatedAt=nowIso_(); task.version=Number(task.version)+1; if(data.status==='done'&&!task.completedAt)task.completedAt=task.updatedAt; if(data.status&&data.status!=='done')task.completedAt=''; Storage_.update('Tasks',task._row,task); ActivityService_.record(ctx,'task',id,'updated',{before:before,after:{status:task.status,priority:task.priority,assigneeId:task.assigneeId}}); return self._serialize(task); });
  },
  reorder:function(ctx,id,status,position,version){ return this.update(ctx,id,{status:status,position:Number(position)},version); },
  archive:function(ctx,id,version){ var self=this; return Storage_.withLock(function(){var task=self._getAccessible(ctx,id);if(Number(task.version)!==Number(version))throw appError_('VERSION_CONFLICT','This task changed elsewhere.');task.archivedAt=nowIso_();task.updatedAt=task.archivedAt;task.version=Number(task.version)+1;Storage_.update('Tasks',task._row,task);ActivityService_.record(ctx,'task',id,'archived',{});return {taskId:id};}); },
  bulkUpdate:function(ctx,ids,patch){ if(!Array.isArray(ids)||ids.length>100)throw appError_('VALIDATION','Select between 1 and 100 tasks.'); var self=this; return ids.map(function(id){var task=self._getAccessible(ctx,id);return self.update(ctx,id,patch,task.version);}); },
  detail:function(ctx,id){ var task=this._serialize(this._getAccessible(ctx,id)); var users=Storage_.all('Users'); function person(uid){var u=users.find(function(x){return x.userId===uid;});return u?UserService_.publicProfile(u):null;} return {task:task,comments:Storage_.all('Comments').filter(function(c){return c.taskId===id;}).map(function(c){delete c._row;c.author=person(c.authorId);return c;}),subtasks:Storage_.all('Subtasks').filter(function(s){return s.taskId===id;}).map(function(s){delete s._row;s.completed=String(s.completed)==='true'||s.completed===true;return s;}),activity:Storage_.all('ActivityLog').filter(function(a){return a.entityId===id;}).map(function(a){delete a._row;a.actor=person(a.actorId);a.details=parseJson_(a.details,{});return a;}).slice(-50).reverse()}; },
  dashboard:function(ctx){ var tasks=this.list(ctx,{limit:500}), mine=tasks.filter(function(t){return t.assigneeId===ctx.user.userId;}), today=new Date().toISOString().slice(0,10), active=mine.filter(function(t){return t.status!=='done'&&t.status!=='cancelled';}); return {open:active.length,inProgress:mine.filter(function(t){return t.status==='in_progress';}).length,completed:mine.filter(function(t){return t.status==='done';}).length,overdue:active.filter(function(t){return t.dueDate&&t.dueDate<today;}).length,upcoming:active.filter(function(t){return t.dueDate&&t.dueDate>=today;}).sort(function(a,b){return a.dueDate.localeCompare(b.dueDate);}).slice(0,8),recent:mine.slice().sort(function(a,b){return b.updatedAt.localeCompare(a.updatedAt);}).slice(0,8)}; }
};
