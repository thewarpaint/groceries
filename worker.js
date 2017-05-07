// var metadata = {
//   version: '%GIT_COMMIT%'
// };

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open('airhorner').then(function (cache) {
      return cache.addAll([
        '/',
        '/index.html',
        '/css/app.css',
        '/js/app.js'
      ]);
    })
  );
});

self.addEventListener('fetch', function (event) {
  console.log(event.request.url);
});