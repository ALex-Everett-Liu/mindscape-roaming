
Now that we know the real issue, let me summarize what happened and provide the complete solution:

## ✅ **Root Cause Analysis**

The FTS5 index was **empty** (no tokens) even though the `outline_nodes_fts` table existed and had rows in auxiliary tables. The `outline_nodes_fts_docsize` table was the key indicator of whether tokens had been built.

## 🔧 **The Fix That Worked**

### **Problem in Original Code:**

```typescript
const nodeCount = db.query("SELECT COUNT(*) as c FROM outline_nodes").get();
const ftsCount = db.query("SELECT COUNT(*) as c FROM outline_nodes_fts").get();
// This checked the wrong table! outline_nodes_fts always has rows (it's a virtual table)
if (nodeCount > 0 && ftsCount === 0) {
  db.run("INSERT INTO outline_nodes_fts(outline_nodes_fts) VALUES('rebuild')");
}
```

### **Correct Implementation:**

```typescript
const nodeCount = db.query("SELECT COUNT(*) as c FROM outline_nodes").get();
const ftsDocsize = db.query("SELECT COUNT(*) as c FROM outline_nodes_fts_docsize").get();
// Check docsize table - empty means tokens haven't been built
if (nodeCount > 0 && ftsDocsize.c === 0) {
  console.log(`[core-fts-search] FTS index empty (docsize=${ftsDocsize.c}), rebuilding...`);
  db.run("INSERT INTO outline_nodes_fts(outline_nodes_fts) VALUES('rebuild')");
}
```

## 📊 **Understanding FTS5 Tables**

When you create an FTS5 virtual table, SQLite automatically creates these auxiliary tables:

| Table | Purpose | Empty until rebuild? |
|-------|---------|---------------------|
| `outline_nodes_fts` | Virtual table - always "exists" | N/A |
| `outline_nodes_fts_data` | Stores FTS index data | ✅ Yes |
| `outline_nodes_fts_idx` | Index for the FTS data | ✅ Yes |
| `outline_nodes_fts_docsize` | Document sizes (rowid → token count) | ✅ Yes |
| `outline_nodes_fts_config` | Configuration | Never empty |

**Key Insight:** `outline_nodes_fts_docsize` is empty until the index is built, making it the perfect indicator.

## 🚀 **Complete Working Solution**

Here's the full corrected initialization logic:

```typescript
// In core-fts-search plugin onLoad()
async onLoad({ db }: PluginContext) {
  // Run migration to create FTS table and triggers
  this.runMigration(db, 1);
  
  // Check if we need to rebuild the FTS index
  const nodeCount = db.query<{ c: number }>(
    "SELECT COUNT(*) as c FROM outline_nodes"
  ).get()?.c || 0;
  
  const ftsDocsize = db.query<{ c: number }>(
    "SELECT COUNT(*) as c FROM outline_nodes_fts_docsize"
  ).get()?.c || 0;
  
  console.log(
    `[core-fts-search] FTS init: outline_nodes=${nodeCount}, ` +
    `outline_nodes_fts_docsize=${ftsDocsize}`
  );
  
  // Rebuild if source has data but FTS index is empty
  if (nodeCount > 0 && ftsDocsize === 0) {
    console.log(`[core-fts-search] Rebuilding FTS index...`);
    db.run("INSERT INTO outline_nodes_fts(outline_nodes_fts) VALUES('rebuild')");
    
    // Verify rebuild worked
    const newDocsize = db.query<{ c: number }>(
      "SELECT COUNT(*) as c FROM outline_nodes_fts_docsize"
    ).get()?.c || 0;
    console.log(`[core-fts-search] After rebuild: docsize=${newDocsize}`);
  }
  
  // Register search RPC handler
  this.registerRpcHandler("search", this.handleSearch.bind(this));
}
```

## 🧪 **Verification Queries**

To confirm everything is working:

```sql
-- Check FTS is properly populated
SELECT 
  (SELECT COUNT(*) FROM outline_nodes) as node_count,
  (SELECT COUNT(*) FROM outline_nodes_fts_docsize) as fts_docsize,
  (SELECT COUNT(*) FROM outline_nodes_fts_data) as fts_data;

-- Test search works
SELECT rowid, * FROM outline_nodes_fts 
WHERE outline_nodes_fts MATCH 'any*' 
LIMIT 5;

-- See actual tokens
SELECT rowid, snippet(outline_nodes_fts, 0, '[', ']', '...', 10) 
FROM outline_nodes_fts 
WHERE outline_nodes_fts MATCH 'bullet';
```

## 🎯 **Why This Happened**

1. **Seed data inserted before FTS existed** → No triggers to populate FTS
2. **Wrong table checked for emptiness** → `outline_nodes_fts` vs `outline_nodes_fts_docsize`
3. **FTS5 doesn't auto-populate from external content** → Needs explicit rebuild

## 📝 **Best Practices for FTS5 External Content Tables**

1. **Always check `_docsize` table** for index emptiness
2. **Rebuild after initial creation** if source table has data
3. **Use triggers** for ongoing sync (you already have these)
4. **Monitor token counts** during development:

```typescript
// Diagnostic logging
const totalTokens = db.query(`
 SELECT SUM(sz) as total_tokens
 FROM outline_nodes_fts_docsize
`).get();
console.log(`Total tokens in index: ${totalTokens}`);
```

## 🔍 **For Future Debugging**

If search stops working again, check this order:

1. **Docsize table empty?** → Rebuild needed
2. **Triggers missing?** → Re-run migration
3. **Rowid mismatch?** → Check JOIN conditions
4. **Tokenizer changed?** → Recreate table with explicit tokenizer

**The fix is now complete!** The search should return results for "any", "a", "bullet", etc., because the FTS index is now properly populated with tokens from your content.
