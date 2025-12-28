const { app } = require('electron');
console.log('ELECTRON_sanity_check');
console.log('App type:', typeof app);
if (app) {
    console.log('App Name:', app.getName());
    app.quit();
} else {
    console.error('App is undefined!');
    process.exit(1);
}
