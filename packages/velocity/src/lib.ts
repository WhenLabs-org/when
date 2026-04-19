// Library exports for embedding velocity tools into another MCP server
export { initDb, getDbPath } from './db/schema.js';
export { TaskQueries } from './db/queries.js';
export { registerStartTask } from './tools/start-task.js';
export { registerEndTask } from './tools/end-task.js';
export { registerEstimate } from './tools/estimate.js';
export { registerStats } from './tools/stats.js';
export { registerHistory } from './tools/history.js';
