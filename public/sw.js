// Service worker: shows a phone notification when the server pushes a new ride request.
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch{}
  e.waitUntil(self.registration.showNotification(d.title||'Luwingu Rider',{body:d.body||'',tag:'ride-request',renotify:true,vibrate:[200,100,200],data:{url:d.url||'/driver'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if(c.url.includes('/driver')&&'focus' in c)return c.focus()}return clients.openWindow(e.notification.data.url)}))});
