var metadata = {
  version: '%GIT_COMMIT%'
};

const cacheName = `groceries-${ metadata.version }`;
const filesToCache = [
  '/',
  '/index.html',
  '/?account=hh',
  '/index.html?account=hh',
  '/css/app.css',
  '/js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((key) => {
        if (key !== cacheName) {
          console.log('Service Worker: Removing Old Cache', key);

          return caches.delete(key);
        }
      }));
    })
  );

  return self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  console.log('URL:', event.request.url);

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }) // Add catch
  );
});