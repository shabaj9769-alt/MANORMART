// FIXED api/admin-db.js for manormart-pay
// Previously, api/admin-db.js had a copy-paste of api/admin.js (adminLogin/adminRefresh),
// causing every request to /api/admin-db to return 404 Unknown route!
// Also disables bodyParser so PUT/PATCH raw JSON reading in adminDb works properly.
module.exports = require('../lib/handlers/admin').adminDb;
module.exports.config = { api: { bodyParser: false } };
