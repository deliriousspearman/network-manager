import Database, { type Database as BetterDatabase } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

const readonlyDb: BetterDatabase = new Database(path.join(dataDir, 'network.db'), { readonly: true });

readonlyDb.pragma('busy_timeout = 5000');

export default readonlyDb;
