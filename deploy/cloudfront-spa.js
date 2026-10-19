// CloudFront Function, viewer-request, JavaScript runtime 2.0.
// Attach to S3 behaviors only. Never rewrite API requests or missing asset paths.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (request.method !== 'GET' && request.method !== 'HEAD') return request;
  if (uri === '/canvas') {
    return { statusCode: 308, statusDescription: 'Permanent Redirect',
      headers: { location: { value: '/canvas/' } } };
  }
  if (/^\/canvas\/(?:$|gardens\/[^/]+\/?$|model-preview\/?$)/.test(uri)) {
    request.uri = '/canvas/index.html';
  } else if (/^\/(?:$|plants\/?$|products\/[^/]+\/?$|materials\/?$|cart(?:\/gardens\/[^/]+)?\/?$|orders(?:\/[^/]+)?\/?$|(?:account|seller|operator|store)(?:\/[A-Za-z0-9_-]+)*\/?$|purchases\/?$)/.test(uri)) {
    request.uri = '/index.html';
  }
  return request;
}
