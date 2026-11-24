import * as path from 'path';

// Dossier du build React (index.html + assets), servi par ServeStaticModule.
// En prod : /client/dist (cf. Dockerfile) ; en dev : client/dist du dépôt.
export const CLIENT_DIST = path.join(__dirname, '..', '..', '..', 'client', 'dist');
