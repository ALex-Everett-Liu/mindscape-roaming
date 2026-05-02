import { Database } from "bun:sqlite";

const db = new Database("C:\\Coding\\mindscape-roaming\\test_debug.db");
db.run("PRAGMA journal_mode=TRUNCATE");

db.run(`
  CREATE TABLE IF NOT EXISTS outline_nodes (
    id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '',
    parent_id TEXT, position INTEGER NOT NULL DEFAULT 0,
    is_expanded INTEGER NOT NULL DEFAULT 1, is_page INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
  )
`);

const now = Date.now();
const insert = db.prepare(
  "INSERT INTO outline_nodes(id,content,parent_id,position,is_expanded,is_page,created_at,updated_at,is_deleted) VALUES (?,?,?,?,?,?,?,?,0)"
);

const root = Bun.randomUUIDv7();
const page = Bun.randomUUIDv7();
const child1 = Bun.randomUUIDv7();
const child2 = Bun.randomUUIDv7();
const regular = Bun.randomUUIDv7();
const regChild = Bun.randomUUIDv7();

insert.run(root, "Root", null, 0, 1, 0, now, now);
insert.run(page, "My Page", root, 0, 1, 0, now, now);   // NOT a page yet
insert.run(child1, "Child 1 of Page", page, 0, 1, 0, now, now);
insert.run(child2, "Child 2 of Page", page, 1, 1, 0, now, now);
insert.run(regular, "Regular Node", root, 2, 1, 0, now, now);
insert.run(regChild, "Child of Regular", regular, 0, 1, 0, now, now);

console.log("=== Test DB created ===");
console.log("Root:", root);
console.log("PAGE:", page);
console.log("  child1:", child1);
console.log("  child2:", child2);
console.log("Regular:", regular);
console.log("  child:", regChild);
console.log("");
console.log("=== Test steps ===");
console.log("1. Start app with this DB");
console.log("2. You should see: Root > My Page (with children visible), Regular Node");
console.log("3. Focus 'My Page', Command Palette > Toggle Page Mode — children should DISAPPEAR, [[My Page]] shown");
console.log("4. Click Save — children of My Page must STAY hidden");
console.log("5. Click [[My Page]] to enter - children reappear inside page");
console.log("6. Navigate back out (breadcrumb/Escape) - children hidden again");
