// Vercel's Express entry point. Existing Beanos pages remain static assets.
const { createApp } = require('./ganderson/app.cjs');
const app = createApp();
module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Beanos: http://localhost:${port}/ganderson/`));
}
