// docker/mongo-init.js — V016
// Runs once when the container is created for the first time (initdb).
// Creates a dedicated app-scoped user with readWrite only on the "hema" DB.
// The root user is only used by the healthcheck and DBA tasks — never by the app.
//
// Environment variables are injected by docker-compose from the host .env:
//   MONGO_APP_USER  — app database username
//   MONGO_APP_PASS  — app database password

const appUser = process.env.MONGO_APP_USER;
const appPass = process.env.MONGO_APP_PASS;

if (!appUser || !appPass) {
  print('[mongo-init] ERROR: MONGO_APP_USER and MONGO_APP_PASS must be set');
  quit(1);
}

db = db.getSiblingDB('hema');

const existing = db.getUser(appUser);
if (!existing) {
  db.createUser({
    user: appUser,
    pwd:  appPass,
    roles: [{ role: 'readWrite', db: 'hema' }],
  });
  print(`[mongo-init] Created app user "${appUser}" with readWrite on "hema".`);
} else {
  print(`[mongo-init] App user "${appUser}" already exists — skipping creation.`);
}
