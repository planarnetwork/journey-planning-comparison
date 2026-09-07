/**
 * The planner package's own worker entry, in a module of this app so that Vite resolves it.
 *
 * The package deliberately does not construct the Worker itself, because resolving a worker's url
 * is a question for whatever is bundling the application. This is that answer.
 */
import 'raptor-journey-planner/worker';
