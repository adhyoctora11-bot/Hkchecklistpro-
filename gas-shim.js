// Emulasi google.script.run -> POST /api/server. Frontend lama tidak perlu diubah.
(function(){
  function make(ok,fail){
    var api={withSuccessHandler:function(f){return make(f,fail);},withFailureHandler:function(f){return make(ok,f);}};
    api.callServer=function(action,payload){
      fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:action,payload:payload||{}})})
        .then(function(r){return r.json();}).then(function(d){ok&&ok(d);}).catch(function(e){fail&&fail(e);});
    };
    api.getActiveUserEmail=function(){fail&&fail({message:'Login Google belum diaktifkan di versi Vercel. Gunakan email & password.'});};
    return api;
  }
  window.google={script:{run:make(null,null)}};
})();
